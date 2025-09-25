const { spawn } = require('node:child_process');
const path = require('node:path');
const EventEmitter = require('node:events');
const readline = require('node:readline');
const fs = require('node:fs');

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

    ensureDirectory(this.config.downloadDir);

    const ytArgs = this.buildArgs(request.url);
    const child = spawn(this.config.ytDlpBinary, ytArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const downloadEntry = {
      request,
      child,
      filePath: '',
      stoppedManually: false
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

    const updateState = (partial) => {
      const existing = this.state.get(request.urlId) || baseState;
      const nextState = { ...existing, ...partial };
      this.state.set(request.urlId, nextState);
      this.emit('state', nextState);
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
        }
      }

      if (/has already been downloaded/u.test(line)) {
        updateState({
          status: 'completed',
          percent: 100,
          filePath: downloadEntry.filePath || this.deriveFilePath(request.title || request.urlId)
        });
        this.finish(request.urlId, 0);
      }
    };

    const stdoutReader = readline.createInterface({ input: child.stdout });
    stdoutReader.on('line', parseLine);
    const stderrReader = readline.createInterface({ input: child.stderr });
    stderrReader.on('line', parseLine);

    child.on('error', (error) => {
      updateState({ status: 'error', error: error.message });
      this.cleanup(request.urlId);
      this.tryStart();
    });

    child.on('close', (code) => {
      stdoutReader.close();
      stderrReader.close();

      if (downloadEntry.stoppedManually) {
        updateState({ status: 'stop', percent: 0 });
        this.cleanup(request.urlId);
        this.tryStart();
        return;
      }

      if (code === 0) {
        const finalPath = downloadEntry.filePath || this.deriveFilePath(request.title || request.urlId);
        updateState({ status: 'completed', percent: 100, filePath: finalPath });
        this.emit('finished', {
          urlId: request.urlId,
          url: request.url,
          filePath: finalPath
        });
      } else {
        updateState({ status: 'error', error: `yt-dlp exited with code ${code}` });
      }

      this.cleanup(request.urlId);
      this.tryStart();
    });

    return true;
  }

  deriveFilePath(fallback) {
    const safeName = fallback.replace(/[^a-z0-9\-_. ]+/giu, '_');
    const outputName = this.config.template.replace('%(title)s', safeName).replace('%(ext)s', 'mp4');
    return path.join(this.config.downloadDir, outputName);
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

  schedule(request) {
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
      active.child.kill('SIGTERM');
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
}

module.exports = { DownloadManager };
