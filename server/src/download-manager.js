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
  recordDownloadTitle
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
        if (candidate) {
          downloadEntry.filePath = candidate;
          captureResolvedTitle(this.deriveTitleFromPath(candidate));
        }
      }

      if (/has already been downloaded/u.test(line)) {
        const inferredPath = downloadEntry.filePath || this.deriveFilePath(request.title || request.urlId);
        captureResolvedTitle(downloadEntry.resolvedTitle || this.deriveTitleFromPath(inferredPath));
        // updateState({
        //   status: 'completed',
        //   percent: 100,
        //   filePath: inferredPath,
        //   title: downloadEntry.resolvedTitle
        // });
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
        const finalPath = downloadEntry.filePath || this.deriveFilePath(downloadEntry.resolvedTitle || request.title || request.urlId);
        const finalTitle = downloadEntry.resolvedTitle || this.deriveTitleFromPath(finalPath);
        captureResolvedTitle(finalTitle);
        // updateState({ status: 'completed', percent: 100, filePath: finalPath, title: downloadEntry.resolvedTitle, error: undefined });
        recordDownloadCompleted({ urlId: request.urlId, url: request.url });
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
    const args = [
      url,
      '-P',
      this.config.downloadDir,
      '-o',
      this.config.template,
      '-f',
      this.config.format,
      '--newline'
    ];

    if (this.config.qualityLimit) {
      args.push('--format-sort');
      args.push(`res:${this.config.qualityLimit}`);
    }

    return args;
  }

  deriveFilePath(fallbackTitle) {
    const safeName = (fallbackTitle || 'download')
      .toString()
      .replace(/[^a-z0-9\-_. ]+/giu, '_');
    const outputName = this.config.template
      .replace('%(title)s', safeName)
      .replace('%(ext)s', 'mp4');
    return path.join(this.config.downloadDir, outputName);
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
