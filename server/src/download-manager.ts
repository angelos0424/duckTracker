import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import {
    recordDownloadQueued,
    recordDownloadStart,
    recordDownloadCompleted,
    recordDownloadError,
    recordDownloadStopped,
    recordDownloadTitle,
    recordDownloadFilePath
} from './database';
import { ServerConfig, RunnerConfig } from './config';

export interface DownloadRequest {
    url: string;
    urlId: string;
    title?: string;
}

export interface DownloadSnapshot {
    status: 'downloading' | 'queued' | 'completed' | 'error' | 'stop';
    url: string;
    urlId: string;
    title: string;
    percent: number;
    filePath?: string;
    error?: string;
}

type DownloadManagerEvents = {
    state: [DownloadSnapshot];
    finished: [DownloadSnapshot];
};

interface ActiveDownloadEntry {
    request: DownloadRequest;
    child: ChildProcess;
    filePath: string;
    stoppedManually: boolean;
    dockerContainerName: string | null;
    finishedEmitted: boolean;
    resolvedTitle: string;
}

function ensureDirectory(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
}

function isDockerRunner(runner: RunnerConfig): runner is Extract<RunnerConfig, { type: 'docker' }> {
    return runner.type === 'docker';
}

export class DownloadManager extends EventEmitter<DownloadManagerEvents> {
    private readonly config: ServerConfig;

    private readonly activeDownloads: Map<string, ActiveDownloadEntry> = new Map();

    private readonly queue: DownloadRequest[] = [];

    private readonly state: Map<string, DownloadSnapshot> = new Map();

    constructor(config: ServerConfig) {
        super();
        this.config = config;
    }

    private isPathInsideDownloadDir(candidate: string | undefined | null): boolean {
        if (!candidate) {
            return false;
        }

        const relative = path.relative(this.config.downloadDir, candidate);
        if (relative === '') {
            return true;
        }

        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    private resolveDownloadPath(rawPath: string | undefined | null): string {
        if (!rawPath) {
            return '';
        }

        const trimmed = rawPath.trim();
        if (!trimmed) {
            return '';
        }

        const normalised = path.normalize(trimmed);
        const absolute = path.isAbsolute(normalised)
            ? normalised
            : path.resolve(this.config.downloadDir, normalised);

        if (!this.isPathInsideDownloadDir(absolute)) {
            return '';
        }

        return absolute;
    }

    private sanitisePathSegment(value: string | undefined, fallback: string): string {
        const base = (value || '').toString().trim();
        const cleaned = base
            .replace(/[^a-z0-9\-_. \[\]\(\)]+/giu, '_')
            .replace(/\s+/gu, ' ')
            .trim();
        const candidate = cleaned || fallback || '';
        return candidate.replace(/^[.\s]+|[.\s]+$/gu, '') || fallback || '';
    }

    private deriveFilePath({ titleCandidate, urlId, ext }: { titleCandidate?: string; urlId: string; ext?: string }): string {
        const rawExt = this.sanitisePathSegment(ext || 'mp4', 'mp4');
        const safeExt = rawExt.replace(/^\.+/u, '') || 'mp4';
        const safeTitle = this.sanitisePathSegment(titleCandidate || urlId || 'download', 'download');
        const safeId = this.sanitisePathSegment(urlId || '', '');

        const replacements = new Map<string, string>([
            ['%(title)s', safeTitle],
            ['%(id)s', safeId],
            ['%(ext)s', safeExt]
        ]);

        let template = this.config.template || '%(title)s.%(ext)s';
        for (const [token, replacement] of replacements.entries()) {
            if (!replacement && token !== '%(id)s') {
                continue;
            }
            template = template.split(token).join(replacement);
        }

        if (safeId === '') {
            template = template.replace(/\s*\[\s*\]\s*/gu, '');
        }

        if (!this.config.template.includes('%(ext)s') && !template.includes('.')) {
            template = `${template}.${safeExt}`;
        }

        const segments = template
            .split(/[\\/]+/u)
            .map((segment) => this.sanitisePathSegment(segment, safeTitle))
            .filter(Boolean);

        if (segments.length === 0) {
            segments.push(safeTitle);
        }

        const candidatePath = segments.join(path.sep);
        const resolved = this.resolveDownloadPath(candidatePath);
        if (resolved) {
            return resolved;
        }

        return path.join(this.config.downloadDir, `${safeTitle}.${safeExt}`);
    }

    findExistingFileById(urlId: string): string {
        if (!urlId) {
            return '';
        }

        const upperBound = 2000;
        const stack: string[] = [this.config.downloadDir];
        let inspected = 0;

        while (stack.length > 0) {
            const currentDir = stack.pop();
            if (!currentDir) {
                continue;
            }

            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
            } catch (error) {
                continue;
            }

            for (const entry of entries) {
                inspected += 1;
                if (inspected > upperBound) {
                    return '';
                }

                const entryPath = path.join(currentDir, entry.name);
                if (typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) {
                    continue;
                }

                if (typeof entry.isDirectory === 'function' && entry.isDirectory()) {
                    stack.push(entryPath);
                    continue;
                }

                if (typeof entry.isFile === 'function' && entry.isFile() && entry.name.includes(urlId)) {
                    const resolved = this.resolveDownloadPath(entryPath);
                    if (resolved) {
                        return resolved;
                    }
                }
            }
        }

        return '';
    }

    getState(urlId: string): DownloadSnapshot | undefined {
        return this.state.get(urlId);
    }

    getStateList(): DownloadSnapshot[] {
        return Array.from(this.state.values());
    }

    private enqueue(request: DownloadRequest): void {
        this.queue.push(request);
        this.state.set(request.urlId, {
            status: 'queued',
            url: request.url,
            urlId: request.urlId,
            title: request.title || '',
            percent: 0
        });
        this.emit('state', this.state.get(request.urlId)!);
    }

    private tryStart(): void {
        if (this.activeDownloads.size >= this.config.maxConcurrent) {
            return;
        }

        const next = this.queue.shift();
        if (!next) {
            return;
        }

        this.start(next);
    }

    private start(request: DownloadRequest): boolean {
        if (this.activeDownloads.has(request.urlId)) {
            return false;
        }

        ensureDirectory(this.config.downloadDir);

        const ytArgs = this.buildArgs(request.url);
        let spawnResult: { child: ChildProcess; containerName: string | null };
        try {
            console.log(ytArgs);
            spawnResult = this.spawnDownloadProcess(ytArgs, request);
        } catch (error) {
            const err = error as Error;
            const errorState: DownloadSnapshot = {
                status: 'error',
                url: request.url,
                urlId: request.urlId,
                title: request.title || '',
                percent: 0,
                error: err.message
            };
            this.state.set(request.urlId, errorState);
            this.emit('state', errorState);
            recordDownloadError({ urlId: request.urlId, url: request.url, error: err.message });
            return false;
        }

        const { child, containerName } = spawnResult;

        const downloadEntry: ActiveDownloadEntry = {
            request,
            child,
            filePath: '',
            stoppedManually: false,
            dockerContainerName: containerName,
            finishedEmitted: false,
            resolvedTitle: request.title || ''
        };

        this.activeDownloads.set(request.urlId, downloadEntry);
        const baseState: DownloadSnapshot = {
            status: 'downloading',
            url: request.url,
            urlId: request.urlId,
            title: request.title || '',
            percent: 0
        };
        this.state.set(request.urlId, baseState);
        this.emit('state', baseState);
        recordDownloadStart(request);

        const updateState = (partial: Partial<DownloadSnapshot>): void => {
            const existing = this.state.get(request.urlId) || baseState;
            const nextState: DownloadSnapshot = {
                ...existing,
                ...partial
            };
            if (partial.status && partial.status !== 'error') {
                delete nextState.error;
            }
            this.state.set(request.urlId, nextState);
            this.emit('state', nextState);
        };

        const emitFinished = (overrides: Partial<DownloadSnapshot> = {}): void => {
            if (downloadEntry.finishedEmitted) {
                return;
            }

            const snapshot: DownloadSnapshot = {
                ...(this.state.get(request.urlId) || baseState),
                ...overrides
            };

            downloadEntry.finishedEmitted = true;
            this.emit('finished', snapshot);
        };

        const captureResolvedTitle = (titleCandidate: string | undefined): void => {
            const normalised = typeof titleCandidate === 'string' ? titleCandidate.trim() : '';
            if (!normalised || normalised === downloadEntry.resolvedTitle) {
                return;
            }

            downloadEntry.resolvedTitle = normalised;
            updateState({ title: normalised });
            recordDownloadTitle({ urlId: request.urlId, title: normalised });
        };

        const parseLine = (line: string): void => {
            if (!line) return;
            const percentMatch = line.match(/(\d+(?:\.\d+)?)%/u);
            if (percentMatch) {
                updateState({ status: 'downloading', percent: Number.parseFloat(percentMatch[1]) });
            }

            const destMarker = 'Destination:';
            if (line.includes(destMarker)) {
                const candidate = line.slice(line.indexOf(destMarker) + destMarker.length).trim();
                const resolvedPath = this.resolveDownloadPath(candidate);
                if (resolvedPath) {
                    downloadEntry.filePath = resolvedPath;
                    captureResolvedTitle(this.deriveTitleFromPath(resolvedPath));
                    recordDownloadFilePath({ urlId: request.urlId, filePath: resolvedPath });
                }
            }

            if (line.startsWith('[Merger]')) {
              let title = line.split('/')[2];
              title = title.slice(0, title.length - 1);
              const mergedPath = `/downloads/${title}`;
              captureResolvedTitle(title);
              downloadEntry.filePath = mergedPath;
              updateState({ status: 'completed', percent: 100, filePath: mergedPath });
              recordDownloadCompleted({ urlId: request.urlId, url: request.url, filePath: mergedPath });
              emitFinished({ status: 'completed', percent: 100, filePath: mergedPath, title });
              this.finish(request.urlId);
            } else if (/has already been downloaded/u.test(line)) {
                const inferredPath =
                    downloadEntry.filePath ||
                    this.findExistingFileById(request.urlId) ||
                    this.deriveFilePath({
                        titleCandidate: downloadEntry.resolvedTitle || request.title || request.urlId,
                        urlId: request.urlId,
                        ext: 'mp4'
                    });
                captureResolvedTitle(downloadEntry.resolvedTitle || this.deriveTitleFromPath(inferredPath));
                downloadEntry.filePath = inferredPath;
                updateState({ status: 'completed', percent: 100, filePath: inferredPath });
                recordDownloadCompleted({ urlId: request.urlId, url: request.url, filePath: inferredPath });
                emitFinished({ status: 'completed', percent: 100, filePath: inferredPath, title: downloadEntry.resolvedTitle });
                this.finish(request.urlId);
            }
        };

        const stdout = child.stdout;
        const stderr = child.stderr;
        const stdoutReader = stdout ? readline.createInterface({ input: stdout }) : null;
        stdoutReader?.on('line', (line) => {
            if (!line) return;
            parseLine(line);
        });
        const stderrReader = stderr ? readline.createInterface({ input: stderr }) : null;
        stderrReader?.on('line', (line) => {
            if (!line) return;
            parseLine(line);
        });

        child.on('error', (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            updateState({ status: 'error', error: message, percent: 0 });
            recordDownloadError({ urlId: request.urlId, url: request.url, error: message });
            emitFinished({ status: 'error', error: message, percent: 0 });
            this.cleanup(request.urlId);
            this.tryStart();
        });

        child.on('close', (code) => {
            stdoutReader?.close();
            stderrReader?.close();

            if (downloadEntry.finishedEmitted) {
                this.cleanup(request.urlId);
                this.tryStart();
                return;
            }

            if (downloadEntry.stoppedManually) {
                updateState({ status: 'stop', percent: 0 });
                recordDownloadStopped({ urlId: request.urlId, url: request.url, error: 'stopped manually' });
                this.cleanup(request.urlId);
                this.tryStart();
                return;
            }

            if (code === 0) {
                const finalPath =
                    downloadEntry.filePath ||
                    this.findExistingFileById(request.urlId) ||
                    this.deriveFilePath({
                        titleCandidate: downloadEntry.resolvedTitle || request.title || request.urlId,
                        urlId: request.urlId,
                        ext: path.extname(downloadEntry.filePath || '') || 'mp4'
                    });
                const finalTitle = downloadEntry.resolvedTitle || this.deriveTitleFromPath(finalPath);
                captureResolvedTitle(finalTitle);
                recordDownloadCompleted({ urlId: request.urlId, url: request.url, filePath: finalPath });
                emitFinished({ percent: 100, status: 'completed', filePath: finalPath, title: downloadEntry.resolvedTitle });
            } else {
                const errorMessage = `yt-dlp exited with code ${code}`;
                updateState({ status: 'error', error: errorMessage, percent: 0 });
                recordDownloadError({ urlId: request.urlId, url: request.url, error: errorMessage });
                emitFinished({ status: 'error', error: errorMessage, percent: 0 });
            }

            this.cleanup(request.urlId);
            this.tryStart();
        });

        return true;
    }

    schedule(request: DownloadRequest): { queued: boolean } {
        recordDownloadQueued(request);
        if (this.activeDownloads.size >= this.config.maxConcurrent) {
            this.enqueue(request);
            return { queued: true };
        }

        this.start(request);
        return { queued: false };
    }

    stop(urlId: string): boolean {
        const active = this.activeDownloads.get(urlId);
        if (active) {
            active.stoppedManually = true;
            recordDownloadStopped({ urlId, url: active.request.url, error: 'stop requested' });

            if (active.dockerContainerName && isDockerRunner(this.config.runner)) {
                const stopper = spawn(this.config.runner.dockerBin, ['stop', active.dockerContainerName]);
                stopper.on('error', () => {
                    if (active.child.exitCode === null) {
                        active.child.kill('SIGTERM');
                    }
                });
            } else {
                active.child.kill('SIGTERM');
            }

            return true;
        }

        const queueIndex = this.queue.findIndex((item) => item.urlId === urlId);
        if (queueIndex !== -1) {
            const [entry] = this.queue.splice(queueIndex, 1);
            const snapshot: DownloadSnapshot = {
                status: 'stop',
                url: entry.url,
                urlId: entry.urlId,
                title: entry.title || '',
                percent: 0
            };
            this.state.set(urlId, snapshot);
            this.emit('state', snapshot);
            recordDownloadStopped({ urlId, url: entry.url, error: 'removed from queue' });
            return true;
        }

        return false;
    }

    private cleanup(urlId: string): void {
        this.activeDownloads.delete(urlId);
    }

    private finish(urlId: string): void {
        this.cleanup(urlId);
    }

    private spawnDownloadProcess(
        ytArgs: string[],
        request: DownloadRequest
    ): { child: ChildProcess; containerName: string | null } {
        const runner: RunnerConfig = this.config.runner || { type: 'binary', ytDlpBinary: 'yt-dlp' };
        if (isDockerRunner(runner)) {
            if (!runner.volumesFrom) {
                throw new Error('SERVER_CONTAINER_NAME must be set when using the docker runner.');
            }

            const safeId = (request.urlId || 'job')
                .toLowerCase()
                .replace(/[^a-z0-9_.-]+/gu, '-');
            const containerName = `ducktracker-dl-${safeId}-${Date.now()}`.slice(0, 63);
            const dockerArgs = ['run', '--rm'];

            dockerArgs.push('--volumes-from', runner.volumesFrom);

            if (runner.workDir) {
                dockerArgs.push('-w', runner.workDir);
            }

            dockerArgs.push('--name', containerName);
            dockerArgs.push(runner.dockerImage);
            dockerArgs.push(...ytArgs);

            const child = spawn(runner.dockerBin, dockerArgs, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            return { child, containerName };
        }

        const binary = runner.ytDlpBinary || 'yt-dlp';
        const child = spawn(binary, ytArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return { child, containerName: null };
    }

    private buildArgs(url: string): string[] {
        const runner = this.config.runner;
        const cookieFilePath = 'cookieFilePath' in runner ? runner.cookieFilePath : undefined;
        const chromePath = 'chromePath' in runner ? runner.chromePath : undefined;

        if (!cookieFilePath && !chromePath) {
            throw new Error('cookieFilePath or chromePath must be set');
        }

        const args = [
            url,
            '-P',
            this.config.downloadDir,
            '-o',
            this.config.template,
            '-f',
            this.config.format
        ];

        if (cookieFilePath) {
            if (!fs.existsSync(cookieFilePath)) {
                throw new Error(`Cookie file not found: ${cookieFilePath}`);
            }
            args.push('--cookies', cookieFilePath);
        } else if (chromePath) {
            args.push('--cookies-from-browser', chromePath);
        }

        args.push('--newline');

        if (this.config.qualityLimit != null) {
            args.push('--format-sort');
            args.push(`res:${this.config.qualityLimit}`);
        }

        return args;
    }

    private deriveTitleFromPath(filePath: string): string {
        if (!filePath) {
            return '';
        }

        const parsed = path.parse(filePath);
        return parsed.name || parsed.base || '';
    }
}
