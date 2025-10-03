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
} from './database.js';
import { ServerConfig, RunnerConfig } from './config.js';

export interface DownloadRequest {
    url: string;
    urlId: string;
    title?: string;
    formatId?: string;
    skipFormatCheck?: boolean;
}

export interface DownloadSnapshot {
    status: 'downloading' | 'queued' | 'completed' | 'error' | 'stop' | 'format-select';
    url: string;
    urlId: string;
    title: string;
    percent: number;
    filePath?: string;
    error?: string;
    fileSizeBytes?: number | null;
    formatOptions?: FormatOptionSummary[];
}

type FormatProtocol = 'https' | 'mhtml';

interface FormatListItem {
    formatId: string;
    resolution: string;
    tbr: number | null;
    vcodec: string;
    ext: string;
    filesize: number | null;
    protocol: FormatProtocol;
    width: number | null;
    height: number | null;
    isAudioOnly: boolean;
    sortScore: number;
}

interface FormatListResult {
    id: string;
    title: string;
    formats: FormatListItem[];
}

export interface FormatOptionSummary {
    id: string;
    label: string;
    resolution: string;
    tbr: number | null;
    ext: string;
    filesize: number | null;
    isAudioOnly: boolean;
}

interface ScheduleResult {
    queued: boolean;
    requiresFormatSelection?: boolean;
    formatOptions?: FormatOptionSummary[];
    title?: string;
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

    private readonly formatCache: Map<string, FormatListResult> = new Map();

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

    private prepareFileMetadata(filePath: string | undefined | null): {
        absolute: string;
        client: string;
        size: number | null;
    } {
        const raw = typeof filePath === 'string' ? filePath.trim() : '';
        if (!raw) {
            return { absolute: '', client: '', size: null };
        }

        const resolved = this.resolveDownloadPath(raw);
        const absolute = resolved || raw;

        let client = '';
        if (resolved) {
            const relative = path.relative(this.config.downloadDir, resolved);
            if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
                client = relative;
            } else {
                client = resolved;
            }
        } else {
            client = raw;
        }

        let size: number | null = null;
        if (resolved) {
            try {
                const stats = fs.statSync(resolved);
                if (typeof stats.isFile === 'function') {
                    size = stats.isFile() ? stats.size : null;
                } else {
                    size = stats.size ?? null;
                }
            } catch (error) {
                size = null;
            }
        }

        return { absolute, client, size };
    }

    private extractMergedOutputPath(line: string): string | null {
        const match = line.match(/Merging formats into "(?<target>.+)"/u);
        if (!match || !match.groups || typeof match.groups.target !== 'string') {
            return null;
        }

        let target = match.groups.target.trim();
        if (!target) {
            return null;
        }

        if (target.startsWith('file:')) {
            target = target.slice('file:'.length);
        }

        if (path.sep === '\\') {
            target = target.replace(/\//gu, '\\');
        }

        return target;
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
            .map((segment: string) => this.sanitisePathSegment(segment, safeTitle))
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

    private async getFormatList(request: DownloadRequest): Promise<FormatListResult> {
        const ytArgs = this.buildFormatArgs(request.url);

        let spawnResult: { child: ChildProcess; containerName: string | null };

        try {
            spawnResult = await this.spawnDownloadProcessPromise(ytArgs, request);
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
            return {
                id: request.urlId,
                title: request.title || '',
                formats: []
            };
        }

        const { child } = spawnResult;

        const parseResult = async (): Promise<FormatListResult> => {
            const manager = this;
            return await new Promise<FormatListResult>((resolve, reject) => {
                let stdoutBuffer = '';
                let stderrBuffer = '';

                if (child.stdout) {
                    child.stdout.setEncoding('utf8');
                    child.stdout.on('data', (chunk: string) => {
                        stdoutBuffer += chunk;
                    });
                }

                if (child.stderr) {
                    child.stderr.setEncoding('utf8');
                    child.stderr.on('data', (chunk: string) => {
                        stderrBuffer += chunk;
                    });
                }

                child.on('error', (processError) => {
                    const message = processError instanceof Error ? processError.message : String(processError);
                    reject(new Error(message));
                });

                child.on('close', (code) => {
                    if (code !== 0) {
                        const trimmed = stderrBuffer.trim();
                        const message = trimmed ? trimmed : `yt-dlp exited with code ${code}`;
                        reject(new Error(message));
                        return;
                    }

                    const lines = stdoutBuffer
                        .split(/\r?\n/u)
                        .map((line) => line.trim())
                        .filter(Boolean);

                    let parsed: {
                        id?: string;
                        title?: string;
                        fulltitle?: string;
                        formats?: Array<{
                            format_id?: string;
                            resolution?: string;
                            width?: number;
                            height?: number;
                            tbr?: number;
                            vcodec?: string;
                            ext?: string;
                            filesize?: number;
                            filesize_approx?: number;
                            protocol?: string;
                        }>;
                    } | null = null;

                    for (const line of lines) {
                        try {
                            parsed = JSON.parse(line);
                            break;
                        } catch (parseError) {
                            console.warn('[history] Failed to parse yt-dlp format line', { line, error: (parseError as Error).message });
                        }
                    }

                    if (!parsed) {
                        reject(new Error('No parsable format metadata returned from yt-dlp.'));
                        return;
                    }

                    const normaliseProtocol = (value: unknown): FormatProtocol => {
                        if (typeof value !== 'string') {
                            return 'https';
                        }
                        const normalised = value.trim().toLowerCase();
                        if (normalised.includes('mhtml')) {
                            return 'mhtml';
                        }
                        return 'https';
                    };

                    const normaliseResolution = (
                        rawResolution: string,
                        widthValue: number | null,
                        heightValue: number | null,
                        isAudioOnly: boolean
                    ): string => {
                        if (isAudioOnly) {
                            return 'audio only';
                        }

                        if (rawResolution.trim()) {
                            return rawResolution.trim();
                        }

                        if (widthValue && heightValue) {
                            return `${widthValue}x${heightValue}`;
                        }

                        if (heightValue) {
                            return `${heightValue}p`;
                        }

                        if (widthValue) {
                            return `${widthValue}p`;
                        }

                        return '';
                    };

                    const formatItems: FormatListItem[] = [];

                    if (Array.isArray(parsed.formats)) {
                        for (const item of parsed.formats) {
                            const protocol = normaliseProtocol(item.protocol);
                            if (protocol === 'mhtml') {
                                continue;
                            }

                            const formatId = typeof item.format_id === 'string' ? item.format_id : '';
                            if (!formatId) {
                                continue;
                            }

                            const widthValue =
                                typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : null;
                            const heightValue =
                                typeof item.height === 'number' && Number.isFinite(item.height) ? item.height : null;
                            const rawResolution = typeof item.resolution === 'string' ? item.resolution : '';
                            const vcodec = typeof item.vcodec === 'string' ? item.vcodec : '';
                            const isAudioOnly =
                                rawResolution.toLowerCase().includes('audio') || vcodec.toLowerCase() === 'none';

                            const resolution = normaliseResolution(rawResolution, widthValue, heightValue, isAudioOnly);
                            const tbr = typeof item.tbr === 'number' && Number.isFinite(item.tbr) ? item.tbr : null;
                            const ext = typeof item.ext === 'string' ? item.ext : '';
                            const fileSizeCandidate =
                                typeof item.filesize === 'number' && Number.isFinite(item.filesize)
                                    ? item.filesize
                                    : typeof item.filesize_approx === 'number' && Number.isFinite(item.filesize_approx)
                                    ? item.filesize_approx
                                    : null;

                            if (!resolution && !vcodec && !ext) {
                                continue;
                            }

                            const sortScore = manager.computeFormatSortScore({
                                resolution,
                                width: widthValue,
                                height: heightValue,
                                isAudioOnly
                            });

                            formatItems.push({
                                formatId,
                                resolution,
                                tbr,
                                vcodec,
                                ext,
                                filesize: fileSizeCandidate,
                                protocol,
                                width: widthValue,
                                height: heightValue,
                                isAudioOnly,
                                sortScore
                            });
                        }
                    }

                    formatItems.sort((a, b) => {
                        if (a.isAudioOnly && !b.isAudioOnly) {
                            return 1;
                        }
                        if (!a.isAudioOnly && b.isAudioOnly) {
                            return -1;
                        }

                        if (a.sortScore !== b.sortScore) {
                            return b.sortScore - a.sortScore;
                        }

                        const tbrA = typeof a.tbr === 'number' && Number.isFinite(a.tbr) ? a.tbr : -1;
                        const tbrB = typeof b.tbr === 'number' && Number.isFinite(b.tbr) ? b.tbr : -1;
                        if (tbrA !== tbrB) {
                            return tbrB - tbrA;
                        }

                        if (a.ext && b.ext && a.ext !== b.ext) {
                            return a.ext.localeCompare(b.ext);
                        }

                        return a.formatId.localeCompare(b.formatId);
                    });

                    const resolvedTitle = manager.resolveFormatTitle(parsed, request);

                    resolve({
                        id: typeof parsed.id === 'string' ? parsed.id : request.urlId,
                        title: resolvedTitle,
                        formats: formatItems
                    });
                });
            });
        };

        try {
            return await parseResult();
        } catch (error) {
            const err = error as Error;
            recordDownloadError({ urlId: request.urlId, url: request.url, error: err.message });
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
            return {
                id: request.urlId,
                title: request.title || '',
                formats: []
            };
        }
    }

    private start(request: DownloadRequest): boolean {
        if (this.activeDownloads.has(request.urlId)) {
            return false;
        }

        ensureDirectory(this.config.downloadDir);

        const ytArgs = this.buildArgs(request);
        let spawnResult: { child: ChildProcess; containerName: string | null };
        try {
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
                const metadata = this.prepareFileMetadata(candidate);
                if (metadata.absolute) {
                    downloadEntry.filePath = metadata.absolute;
                }
                const titleSource = metadata.absolute || metadata.client;
                if (titleSource) {
                    captureResolvedTitle(this.deriveTitleFromPath(titleSource));
                }
                if (metadata.client) {
                    recordDownloadFilePath({
                        urlId: request.urlId,
                        filePath: metadata.client,
                        fileSizeBytes: metadata.size
                    });
                }
            }

            if (line.startsWith('[Merger]')) {
                const mergedOutput = this.extractMergedOutputPath(line);
                if (mergedOutput) {
                    const metadata = this.prepareFileMetadata(mergedOutput);
                    const resolvedTitle = metadata.client || metadata.absolute || mergedOutput;
                    captureResolvedTitle(this.deriveTitleFromPath(resolvedTitle));
                    downloadEntry.filePath = metadata.absolute || mergedOutput;

                    const stateUpdate: Partial<DownloadSnapshot> = { percent: 100 };
                    if (metadata.client) {
                        stateUpdate.filePath = metadata.client;
                        recordDownloadFilePath({
                            urlId: request.urlId,
                            filePath: metadata.client,
                            fileSizeBytes: metadata.size
                        });
                    }
                    updateState(stateUpdate);
                }
            } else if (/has already been downloaded/u.test(line)) {
                const inferredPath =
                    downloadEntry.filePath ||
                    this.findExistingFileById(request.urlId) ||
                    this.deriveFilePath({
                        titleCandidate: downloadEntry.resolvedTitle || request.title || request.urlId,
                        urlId: request.urlId,
                        ext: 'mp4'
                    });
                const metadata = this.prepareFileMetadata(inferredPath);
                const titleSource = metadata.absolute || metadata.client || inferredPath;
                captureResolvedTitle(downloadEntry.resolvedTitle || this.deriveTitleFromPath(titleSource));
                downloadEntry.filePath = metadata.absolute || inferredPath;
                updateState({
                    status: 'completed',
                    percent: 100,
                    filePath: metadata.client,
                    fileSizeBytes: metadata.size
                });
                recordDownloadCompleted({
                    urlId: request.urlId,
                    url: request.url,
                    filePath: metadata.client,
                    fileSizeBytes: metadata.size
                });
                emitFinished({
                    status: 'completed',
                    percent: 100,
                    filePath: metadata.client,
                    fileSizeBytes: metadata.size,
                    title: downloadEntry.resolvedTitle
                });
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
                const metadata = this.prepareFileMetadata(finalPath);
                const finalTitle =
                    downloadEntry.resolvedTitle ||
                    this.deriveTitleFromPath(metadata.absolute || metadata.client || finalPath);
                captureResolvedTitle(finalTitle);
                downloadEntry.filePath = metadata.absolute || finalPath;
                updateState({
                    status: 'completed',
                    percent: 100,
                    filePath: metadata.client,
                    fileSizeBytes: metadata.size
                });
                recordDownloadCompleted({
                    urlId: request.urlId,
                    url: request.url,
                    filePath: metadata.client,
                    fileSizeBytes: metadata.size
                });
                emitFinished({
                    percent: 100,
                    status: 'completed',
                    filePath: metadata.client,
                    fileSizeBytes: metadata.size,
                    title: downloadEntry.resolvedTitle
                });
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

    async schedule(request: DownloadRequest): Promise<ScheduleResult> {
        const shouldCheckFormats = this.config.checkFormatList && request.skipFormatCheck !== true;

        if (shouldCheckFormats && !request.formatId) {
            const formatInfo = await this.getFormatList(request);
            this.formatCache.set(request.urlId, formatInfo);

            const title = formatInfo.title || request.title || '';
            request.title = title;
            if (title) {
                recordDownloadTitle({ urlId: request.urlId, title });
            }
            const options = formatInfo.formats.map((item) => this.createFormatOptionSummary(item));

            const snapshot: DownloadSnapshot = {
                status: 'format-select',
                url: request.url,
                urlId: request.urlId,
                title,
                percent: 0,
                formatOptions: options
            };
            this.state.set(request.urlId, snapshot);
            this.emit('state', snapshot);

            return {
                queued: false,
                requiresFormatSelection: true,
                formatOptions: options,
                title
            };
        }

        if (shouldCheckFormats && request.formatId) {
            const cached = this.formatCache.get(request.urlId) || (await this.getFormatList(request));
            this.formatCache.set(request.urlId, cached);

            const formatIds = request.formatId
                .split('+')
                .map((part) => part.trim())
                .filter((part) => part.length > 0);

            if (formatIds.length === 0) {
                throw new Error('Selected format not available.');
            }

            const missing = formatIds.filter(
                (formatId) => !cached.formats.some((item) => item.formatId === formatId)
            );
            if (missing.length > 0) {
                throw new Error('Selected format not available.');
            }

            const resolvedTitle = cached.title || request.title || '';
            request.title = resolvedTitle;
            if (resolvedTitle) {
                recordDownloadTitle({ urlId: request.urlId, title: resolvedTitle });
            }
        }

        // downloading, queued는 없음.
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
        this.formatCache.delete(urlId);
    }

    private finish(urlId: string): void {
        this.cleanup(urlId);
    }

    private async spawnDownloadProcessPromise(
        ytArgs: string[],
        request: DownloadRequest
    ): Promise<{ child: ChildProcess; containerName: string | null }> {
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

    private buildFormatArgs(url: string): string[] {
        const runner = this.config.runner;
        const cookieFilePath = 'cookieFilePath' in runner ? runner.cookieFilePath : undefined;
        const chromePath = 'chromePath' in runner ? runner.chromePath : undefined;

        if (!cookieFilePath && !chromePath) {
            throw new Error('cookieFilePath or chromePath must be set');
        }

        const args = [
            url,
            '-j',
            '--format-sort',
            'res,tbr,ext,filesize'
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

        return args;
    }

    private formatBitrateLabel(tbr: number | null): string {
        if (tbr === null || tbr === undefined) {
            return '0';
        }

        if (!Number.isFinite(tbr)) {
            return '0';
        }

        const rounded = Math.round(tbr);
        if (rounded <= 0) {
            return '0';
        }

        if (rounded > 1000) {
            const megabits = rounded / 1000;
            return `${megabits.toFixed(2)}Mbps`;
        }

        return `${rounded} kbps`;
    }

    private formatFilesizeLabel(filesize: number | null): string {
        if (filesize === null || filesize === undefined) {
            return '';
        }

        if (!Number.isFinite(filesize) || filesize <= 0) {
            return '';
        }

        const megabytes = filesize / (1024 * 1024);
        if (megabytes >= 1000) {
            const gigabytes = megabytes / 1024;
            return `${gigabytes.toFixed(2)} GB`;
        }

        return `${megabytes.toFixed(2)} MB`;
    }

    private computeFormatSortScore({
        resolution,
        width,
        height,
        isAudioOnly
    }: {
        resolution: string;
        width: number | null;
        height: number | null;
        isAudioOnly: boolean;
    }): number {
        if (isAudioOnly) {
            return -1;
        }

        const candidates: number[] = [];

        if (typeof height === 'number' && Number.isFinite(height)) {
            candidates.push(height);
        }

        if (typeof width === 'number' && Number.isFinite(width)) {
            candidates.push(width);
        }

        const resolutionMatch = resolution.match(/(\d+)\s*[xX]\s*(\d+)/u);
        if (resolutionMatch) {
            const first = Number.parseInt(resolutionMatch[1] ?? '', 10);
            const second = Number.parseInt(resolutionMatch[2] ?? '', 10);
            if (Number.isFinite(first)) {
                candidates.push(first);
            }
            if (Number.isFinite(second)) {
                candidates.push(second);
            }
        }

        const progressiveMatch = resolution.match(/(\d+)\s*p/iu);
        if (progressiveMatch) {
            const progressive = Number.parseInt(progressiveMatch[1] ?? '', 10);
            if (Number.isFinite(progressive)) {
                candidates.push(progressive);
            }
        }

        if (candidates.length === 0) {
            return 0;
        }

        return Math.max(...candidates);
    }

    private resolveFormatTitle(
        parsed: { title?: string; fulltitle?: string } | null,
        request: DownloadRequest
    ): string {
        const candidates: Array<string | undefined> = [];
        if (parsed) {
            candidates.push(parsed.title);
            candidates.push(parsed.fulltitle);
        }
        candidates.push(request.title);
        candidates.push(request.urlId);

        for (const candidate of candidates) {
            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (trimmed) {
                    return trimmed;
                }
            }
        }

        return '';
    }

    private buildFormatLabel(item: FormatListItem): string {
        const parts: string[] = [];
        if (item.resolution) {
            parts.push(item.resolution);
        }

        const bitrateLabel = this.formatBitrateLabel(item.tbr);
        if (bitrateLabel) {
            parts.push(bitrateLabel);
        }

        const sizeLabel = this.formatFilesizeLabel(item.filesize);
        if (sizeLabel) {
            parts.push(sizeLabel);
        }

        if (item.ext) {
          parts.push(item.ext);
        }

        return parts.join(' | ');
    }

    private createFormatOptionSummary(item: FormatListItem): FormatOptionSummary {
        return {
            id: item.formatId,
            label: this.buildFormatLabel(item),
            resolution: item.resolution,
            tbr: item.tbr,
            ext: item.ext,
            filesize: item.filesize,
            isAudioOnly: item.isAudioOnly
        };
    }

    private buildArgs(request: DownloadRequest): string[] {
        const runner = this.config.runner;
        const cookieFilePath = 'cookieFilePath' in runner ? runner.cookieFilePath : undefined;
        const chromePath = 'chromePath' in runner ? runner.chromePath : undefined;

        if (!cookieFilePath && !chromePath) {
            throw new Error('cookieFilePath or chromePath must be set');
        }

        const requestedFormat =
            typeof request.formatId === 'string' && request.formatId.trim()
                ? request.formatId.trim()
                : this.config.format;

        const args = [
            request.url,
            '-P',
            this.config.downloadDir,
            '-o',
            this.config.template,
            '-f',
            requestedFormat
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

        // if (this.config.qualityLimit != null) {
        //     args.push('--format-sort');
        //     args.push(`res:${this.config.qualityLimit}`);
        // }

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
