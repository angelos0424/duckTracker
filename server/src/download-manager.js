const { spawn } = require('node:child_process');
const path = require('node:path');
const EventEmitter = require('node:events');
const readline = require('node:readline');
const fs = require('node:fs');
const {
  recordDownloadQueued,
  recordDownloadStart,
  recordDownloadCompleted,
  recordDownloadError,
  recordDownloadStopped,
  recordDownloadTitle,
  recordDownloadFilePath
} = require('./database');

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

class DownloadManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.activeDownloads = new Map();
    this.queue = [];
    this.state = new Map();
  }

  isPathInsideDownloadDir(candidate) {
    if (!candidate) {
      return false;
    }

    const relative = path.relative(this.config.downloadDir, candidate);
    if (relative === '') {
      return true;
    }

    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  resolveDownloadPath(rawPath) {
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

  sanitisePathSegment(value, fallback) {
    const base = (value || '').toString().trim();
    const cleaned = base
      .replace(/[^a-z0-9\-_. \[\]\(\)]+/giu, '_')
      .replace(/\s+/gu, ' ')
      .trim();
    const candidate = cleaned || fallback || '';
    return candidate.replace(/^[.\s]+|[.\s]+$/gu, '') || fallback || '';
  }

  deriveFilePath({ titleCandidate, urlId, ext }) {
    const rawExt = this.sanitisePathSegment(ext || 'mp4', 'mp4');
    const safeExt = rawExt.replace(/^\.+/u, '') || 'mp4';
    const safeTitle = this.sanitisePathSegment(titleCandidate || urlId || 'download', 'download');
    const safeId = this.sanitisePathSegment(urlId || '', '');

    const replacements = new Map([
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
      .map((segment, index) => this.sanitisePathSegment(segment, index === 0 ? safeTitle : safeTitle))
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

  findExistingFileById(urlId) {
    if (!urlId) {
      return '';
    }

    const upperBound = 2000;
    const stack = [this.config.downloadDir];
    let inspected = 0;

    while (stack.length > 0) {
      const currentDir = stack.pop();
      let entries;
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
        if (entry.isSymbolicLink && entry.isSymbolicLink()) {
          continue;
        }

        if (entry.isDirectory && entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }

        if (entry.isFile && entry.isFile() && entry.name.includes(urlId)) {
          const resolved = this.resolveDownloadPath(entryPath);
          if (resolved) {
            return resolved;
          }
        }
      }
    }

    return '';
  }

  getStateList() {
    return Array.from(this.state.values()).map((entry) => ({ ...entry }));
  }

  getState(urlId) {
    return this.state.get(urlId);
  }

  enqueue(request) {
    this.queue.push(request);
    this.state.set(request.urlId, {
      status: 'queued',
      url: request.url,
      urlId: request.urlId,
      title: request.title || '',
      percent: 0
    });
    this.emit('state', this.getState(request.urlId));
  }

  tryStart() {
    while (this.activeDownloads.size < this.config.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      this.start(next);
    }
  }

  start(request) {
    if (this.activeDownloads.has(request.urlId)) {
      return false;
    }

    console.log("Downloading " + request.urlId);

    ensureDirectory(this.config.downloadDir);

    const ytArgs = this.buildArgs(request.url);

    console.log('ytArgs', ytArgs);
    let spawnResult;
    try {
      spawnResult = this.spawnDownloadProcess(ytArgs, request);
    } catch (error) {
      const errorState = {
        status: 'error',
        url: request.url,
        urlId: request.urlId,
        title: request.title || '',
        percent: 0,
        error: error.message
      };
      this.state.set(request.urlId, errorState);
      this.emit('state', errorState);
      console.log('Download failed', error, errorState);
      recordDownloadError({ urlId: request.urlId, url: request.url, error: error.message });
      return false;
    }

    const { child, containerName } = spawnResult;

    const downloadEntry = {
      request,
      child,
      filePath: '',
      stoppedManually: false,
      dockerContainerName: containerName || null,
      finishedEmitted: false,
      resolvedTitle: request.title || ''
    };

    this.activeDownloads.set(request.urlId, downloadEntry);
    const baseState = {
      status: 'downloading',
      url: request.url,
      urlId: request.urlId,
      title: request.title || '',
      percent: 0
    };
    this.state.set(request.urlId, baseState);
    this.emit('state', baseState);
    recordDownloadStart(request);

    const updateState = (partial) => {
      const existing = this.state.get(request.urlId) || baseState;
      const nextState = { ...existing, ...partial };
      if (partial.status && partial.status !== 'error') {
        delete nextState.error;
      }
      this.state.set(request.urlId, nextState);
      this.emit('state', nextState);
    };

    const emitFinished = (overrides = {}) => {
      if (downloadEntry.finishedEmitted) {
        return;
      }

      const snapshot = {
        ...(this.state.get(request.urlId) || {}),
        ...overrides
      };

      downloadEntry.finishedEmitted = true;
      this.emit('finished', snapshot);
    };

    const captureResolvedTitle = (titleCandidate) => {
      const normalised = typeof titleCandidate === 'string' ? titleCandidate.trim() : '';
      if (!normalised || normalised === downloadEntry.resolvedTitle) {
        return;
      }

      downloadEntry.resolvedTitle = normalised;
      updateState({ title: normalised });
      recordDownloadTitle({ urlId: request.urlId, title: normalised });
    };

    const parseLine = (line) => {
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

      if (/has already been downloaded/u.test(line)) {
        const inferredPath = downloadEntry.filePath
          || this.findExistingFileById(request.urlId)
          || this.deriveFilePath({
            titleCandidate: downloadEntry.resolvedTitle || request.title || request.urlId,
            urlId: request.urlId,
            ext: 'mp4'
          });
        captureResolvedTitle(downloadEntry.resolvedTitle || this.deriveTitleFromPath(inferredPath));
        recordDownloadFilePath({ urlId: request.urlId, filePath: inferredPath });
        emitFinished({ status: 'completed', percent: 100, filePath: inferredPath, title: downloadEntry.resolvedTitle });
        this.finish(request.urlId);
      }
    };

    const stdoutReader = readline.createInterface({ input: child.stdout });
    stdoutReader.on('line', (line) => {
      if (!line) return;
      console.log('[yt-dlp][stdout]', line);
      parseLine(line);
    });
    const stderrReader = readline.createInterface({ input: child.stderr });
    stderrReader.on('line', (line) => {
      if (!line) return;
      console.log('[yt-dlp][stderr]', line);
      parseLine(line);
    });

    child.on('error', (error) => {
      console.error('Download failed', error);
      updateState({ status: 'error', error: error.message, percent: 0 });
      recordDownloadError({ urlId: request.urlId, url: request.url, error: error.message });
      emitFinished({ status: 'error', error: error.message, percent: 0 });
      this.cleanup(request.urlId);
      this.tryStart();
    });

    child.on('close', (code) => {
      stdoutReader.close();
      stderrReader.close();

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
        const finalPath = downloadEntry.filePath
          || this.findExistingFileById(request.urlId)
          || this.deriveFilePath({
            titleCandidate: downloadEntry.resolvedTitle || request.title || request.urlId,
            urlId: request.urlId,
            ext: path.extname(downloadEntry.filePath || '') || 'mp4'
          });
        const finalTitle = downloadEntry.resolvedTitle || this.deriveTitleFromPath(finalPath);
        captureResolvedTitle(finalTitle);
        // updateState({ status: 'completed', percent: 100, filePath: finalPath, title: downloadEntry.resolvedTitle, error: undefined });
        recordDownloadCompleted({ urlId: request.urlId, url: request.url, filePath: finalPath });
        emitFinished({ percent: 100, status: 'completed', filePath: finalPath, title: downloadEntry.resolvedTitle, error: undefined });
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

  buildArgs(url) {
    const cookieFilePath = this.config.runner.cookieFilePath;
    const chromePath = this.config.runner.chromePath;

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

    if (this.config.qualityLimit) {
      args.push('--format-sort');
      args.push(`res:${this.config.qualityLimit}`);
    }

    return args;
  }

  deriveTitleFromPath(filePath) {
    if (!filePath) {
      return '';
    }

    const parsed = path.parse(filePath);
    return parsed.name || parsed.base || '';
  }

  schedule(request) {
    recordDownloadQueued(request);
    if (this.activeDownloads.size >= this.config.maxConcurrent) {
      this.enqueue(request);
      return { queued: true };
    }

    this.start(request);
    return { queued: false };
  }

  stop(urlId) {
    const active = this.activeDownloads.get(urlId);
    if (active) {
      active.stoppedManually = true;
      recordDownloadStopped({ urlId, url: active.request.url, error: 'stop requested' });

      if (active.dockerContainerName && this.config.runner?.type === 'docker') {
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
      this.state.set(urlId, {
        status: 'stop',
        url: entry.url,
        urlId: entry.urlId,
        title: entry.title || '',
        percent: 0
      });
      this.emit('state', this.state.get(urlId));
      recordDownloadStopped({ urlId, url: entry.url, error: 'removed from queue' });
      return true;
    }

    return false;
  }

  cleanup(urlId) {
    this.activeDownloads.delete(urlId);
  }

  finish(urlId) {
    this.cleanup(urlId);
  }

  spawnDownloadProcess(ytArgs, request) {
    let runner = this.config.runner || { type: 'binary', ytDlpBinary: 'yt-dlp' };
    try {
      if (runner.type === 'docker') {
        if (!runner.volumesFrom) {
          throw new Error('SERVER_CONTAINER_NAME must be set when using the docker runner.');
        }

        const safeId = (request.urlId || 'job')
          .toLowerCase()
          .replace(/[^a-z0-9_.-]+/gu, '-');
        const containerName = `ducktracker-dl-${safeId}-${Date.now()}`.slice(0, 63);
        const dockerArgs = ['run', '--rm'];

        if (runner.volumesFrom) {
          dockerArgs.push('--volumes-from', runner.volumesFrom);
        }

        if (runner.workDir) {
          dockerArgs.push('-w', runner.workDir);
        }

        dockerArgs.push('--name', containerName);
        dockerArgs.push(runner.dockerImage);

        // dockerArgs.push(runner.dockerCommand || 'yt-dlp');
        dockerArgs.push(...ytArgs);

        console.log('dockerArgs', dockerArgs);
        const child = spawn(runner.dockerBin, dockerArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        return { child, containerName };
      }
    } catch (e) {
      console.error('spawnDownloadProcess', e);
    }

    const binary = runner.ytDlpBinary || 'yt-dlp';
    const child = spawn(binary, ytArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { child, containerName: null };
  }
}

module.exports = { DownloadManager };
