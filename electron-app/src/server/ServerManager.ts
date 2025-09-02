import { app } from 'electron';
import express from 'express';
import {DownloadManager} from './DownloadManager';
import cors from 'cors';
import YTDlpWrap from 'yt-dlp-wrap';
import {WebSocket, WebSocketServer} from 'ws';
import {Server} from 'http';
import {EventEmitter} from 'events';
import * as net from 'net';
import {DownloadRecord, ServerConfig, ServerStatus} from '../shared/types';
import path from 'path';
import {ErrorCategory, ErrorHandler, ErrorSeverity} from '../main/ErrorHandler';
import {DatabaseManager} from "./DatabaseManager";
import Database from "better-sqlite3";
import * as fs from "node:fs";

interface ExistUrls {
  url_id: string;
}

export class ServerManager extends EventEmitter {
  private httpServer: Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private app: express.Application;
  private ytDlpWrap: YTDlpWrap;
  private activeDownloads = new Map<string, AbortController>();
  private downloadsState: Map<string, {
    status: string;
    url: string;
    urlId: string;
    error?: string;
    percent?: number;
    title?: string | undefined
  }> = new Map();
  private config: ServerConfig | null = null;
  private errorHandler: ErrorHandler;

  private downloadManager: DownloadManager;
  private db: Database.Database;

  constructor(ytDlpWrap: YTDlpWrap, downloadManager: DownloadManager, databaseManager: DatabaseManager) {
    super();
    this.app = express();
    this.ytDlpWrap = ytDlpWrap;
    this.errorHandler = ErrorHandler.getInstance();
    this.downloadManager = downloadManager;
    this.db = databaseManager.getDatabase();
    this.setupExpressApp();
    this.setupEventListeners();
  }

  public setYtDlpWrap(ytDlpWrap: YTDlpWrap): void {
    this.ytDlpWrap = ytDlpWrap;
  }

  private setupExpressApp(): void {
    this.app.use(express.json());
    console.log('Setting up Express app...');
  }

  private setupEventListeners(): void {
    this.downloadManager.on('download-finished', (data) => {
      this.broadcastWsMessage('download-finished', data);
      // Todo send ws message to browser
      
    });
  }

  private setupRoutes(): void {
    this.app.post('/download', async (req, res) => {
      try {
        console.log('Received download request:', req.body);
        if (!this.config) {
          return res.status(500).json({ error: 'Server not configured' });
        }
        const { url, urlId, options } = req.body || {};
        if (!url || !urlId) {
          return res.status(400).json({ error: 'url and urlId are required' });
        }

        this.downloadsState.set(urlId, {
          status: 'started',
          url,
          urlId,
          percent: 0
        });

        const data = { url, urlId, options: Array.isArray(options) ? options : [] };
        const started = await this.startDownload(data);

        if (started) {
          return res.json({ success: true, data: { status: 'completed', urlId: urlId} });
        } else {
          return res.json({ success: false, data: { status: 'completed', urlId: urlId, error: 'This video is already being downloaded.' }});
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: message });
      }
    });

    this.app.post('/stop_download', (req, res) => {
      try {
        console.log('Received stop download request:', req.body);
        const {urlId, url} = req.body || {};
        if (!urlId) {
          return res.status(400).json({error: 'urlId is required'});
        }
        const stopped = this.stopDownload(urlId);
        if (stopped) {
          const prev = this.downloadsState.get(urlId) || {url: url || '', urlId};
          this.downloadsState.set(urlId, {...prev, status: 'stop', error: 'Download stopped'});
        }
        return res.json({success: stopped});
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({error: message});
      }
    });

    this.app.post('/save_history', (_req, res) => {
      console.log('Received save history request', _req.body);
      return res.json({success: true});
    });

    this.app.get('/downloads', (_req, res) => {
      console.log('Received downloads request', _req.body);
      const list = Array.from(this.downloadsState.values());
      console.log('Sending downloads response', list);
      return res.json(list);
    });
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });
      server.on('error', () => resolve(false));
    });
  }

  private async checkPortsAvailability(config: ServerConfig): Promise<{ available: boolean; conflicts: string[] }> {
    const conflicts: string[] = [];
    if (!(await this.isPortAvailable(config.port))) {
      conflicts.push(`HTTP port ${config.port}`);
    }
    if (!(await this.isPortAvailable(config.wsPort))) {
      conflicts.push(`WebSocket port ${config.wsPort}`);
    }
    return { available: conflicts.length === 0, conflicts };
  }

  private setupCors(config: ServerConfig): void {
    const allowedOriginRegexes = [
      /^chrome-extension:\/\/.*/i,
      /^moz-extension:\/\/.*/i,
      /^http:\/\/localhost(?::\d+)?$/i
    ];
    this.app.use((req, res, next) => {
      res.header('Vary', 'Origin');
      next();
    });
    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOriginRegexes.some((re) => re.test(origin)) || 
                          (Array.isArray(config.corsOrigins) && config.corsOrigins.includes(origin));
        if (isAllowed) {
          return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    this.app.options('*', cors());
  }

  private async startDownload(
    data: { url: string; urlId: string; title?: string | ''; options?: string[] }
  ): Promise<boolean> {
    if (!this.config) {
      this.emit('download-failed', { urlId: data.urlId, url: data.url, title: data.title, status: 'failed', error: 'Server not configured' });
      return false;
    }
    const config = this.config;

    // Ensure the output directory exists before starting the download
    try {
      if (!fs.existsSync(config.outputPath)) {
        console.log(`Download directory does not exist. Creating: ${config.outputPath}`);
        fs.mkdirSync(config.outputPath, { recursive: true });
      }
    } catch (error) {
      console.error(`Failed to create output directory: ${config.outputPath}`, error);
      const appError = this.errorHandler.getErrorTemplate('DIRECTORY_ACCESS', {
          dirPath: config.outputPath,
          originalError: error instanceof Error ? error.message : 'Unknown error'
      });
      this.errorHandler.handle(appError);
      this.emit('download-failed', { urlId: data.urlId, url: data.url, title: data.title, status: 'failed', error: 'Failed to create download directory.' });
      return false;
    }

    if (this.activeDownloads.has(data.urlId)) {
      this.emit('download-failed', { urlId: data.urlId, url: data.url, title: data.title, status: 'failed', error: 'This video is already being downloaded.' });
      return false;
    }

    const downloadRecord: DownloadRecord|null = this.downloadManager.getDownloadByUrlId(data.urlId)
    if (downloadRecord) {
      if (downloadRecord.status === 'completed') {
        this.activeDownloads.delete(data.urlId);
        this.downloadsState.set(data.urlId, { status: 'completed', url: downloadRecord.url, urlId: downloadRecord.urlId, title: downloadRecord.title, percent: 100 });
        this.emit('download-completed', { urlId: data.urlId, url: downloadRecord.url, title: downloadRecord.title, status: 'completed', progress: 100, filePath: downloadRecord.filePath });
        this.broadcastWsMessage('download-completed', { urlId: data.urlId });
        return false;
      }
    }

    if (this.activeDownloads.size >= config.maxConcurrentDownloads) {
      await this.downloadManager.createDownloadRecord(data.url, data.urlId, data.title, 'queued');
      this.emit('download-queued', { urlId: data.urlId, url: data.url, title: data.title, status: 'queued' });
      return true;
    }

    const controller = new AbortController();
    this.activeDownloads.set(data.urlId, controller);

    // Let's try to get the title from metadata first
    let currentTitle = data.title || '';

    // Check if the download was cancelled while fetching metadata
    if (!this.activeDownloads.has(data.urlId)) {
      console.log(`Download ${data.urlId} was cancelled during metadata fetch. Aborting start.`);
      return false; // Return false to indicate it didn't actually start
    }

    this.downloadsState.set(data.urlId, { status: 'started', url: data.url, urlId: data.urlId, percent: 0, title: currentTitle });
    this.emit('download-started', { urlId: data.urlId, url: data.url, title: currentTitle, status: 'downloading' });

    const downloadOptions = [data.url, '-f', config.format, '-P', config.outputPath, '-o', config.outputTemplate, ...(data.options || [])];
    let currentFilePath = '';

    try {
      console.log(`Starting download for ${data.urlId}: ${currentTitle} with options: ${downloadOptions.join(' ')}`);

      try {
        if (currentTitle === '') {
          const metadata = await this.ytDlpWrap.getVideoInfo(data.url);
          if (metadata.title) {
            currentTitle = metadata.title;
          }
        }
      } catch (error) {
        console.error('Failed to fetch metadata:', error);
      }

      this.ytDlpWrap.exec(downloadOptions, { shell: false, detached: true, windowsHide: true, windowsVerbatimArguments: true }, controller.signal)
        .on('ytDlpEvent', (eventType, eventData) => {
          if (eventType === 'download') {
            if (eventData.endsWith('has already been downloaded')) {
              console.log(eventData);
              const existingFile = eventData.split('has already been downloaded')[0]?.trim() || '';
              this.activeDownloads.delete(data.urlId);
              this.downloadsState.set(data.urlId, { status: 'completed', url: data.url, urlId: data.urlId, title: currentTitle, percent: 100 });
              this.emit('download-completed', { urlId: data.urlId, url: data.url, title: currentTitle, status: 'completed', progress: 100, filePath: existingFile });
              this.processDownloadQueue();
              return;
            }

            const destMarker = 'Destination: ';
            const destIndex = eventData.indexOf(destMarker);
            if (destIndex !== -1) {
              currentFilePath = eventData.substring(destIndex + destMarker.length).trim();

              console.log('currentFilePath set from Destination:', currentFilePath);
              console.log(eventData)
            }

            const percentMatch = eventData.match(/(\d+(?:\.\d+)?)%/);
            if (percentMatch && percentMatch[1]) {
              const percent = parseFloat(percentMatch[1]);
              this.downloadsState.set(data.urlId, {
                status: 'progress',
                url: data.url,
                urlId: data.urlId,
                title: currentTitle,
                percent: percent
              });
              this.emit('download-progress', {
                urlId: data.urlId,
                url: data.url,
                title: currentTitle,
                status: 'downloading',
                progress: percent
              });
            }
          } else if (eventType === 'Merger') {
            const mergerMarker = 'into ';
            const mergerIndex = eventData.indexOf(mergerMarker);
            if (mergerIndex !== -1) {
                console.log('Merger event:', eventData);
                const filePath = eventData.substring(mergerIndex + mergerMarker.length).replace(/"/g, '').trim();
                console.log('Merged file path:', filePath);
                currentFilePath = filePath;
            }
          }
        })
        .on('error', async (error: Error) => {
          // Don't treat aborts as failures. The 'download-stopped' event handles the state.
          if (error.message.includes('AbortError')) {
            console.log(`Download ${data.urlId} was aborted.`);
            // The process will still fire 'close', which will handle queue processing.
            return;
          }

          console.error('Download process error:', error);
          this.activeDownloads.delete(data.urlId);
          const errorMessage = error.message || 'Failed during download process.';
          this.downloadsState.set(data.urlId, { status: 'error', url: data.url, urlId: data.urlId, title: currentTitle, error: errorMessage });
          this.emit('download-failed', { urlId: data.urlId, url: data.url, title: currentTitle, status: 'failed', error: errorMessage });
          this.processDownloadQueue();
        })
        .on('close', async () => {
          this.activeDownloads.delete(data.urlId);
          const currentState = this.downloadsState.get(data.urlId);
          if (currentState?.status !== 'stop' && currentState?.status !== 'error') {
            // If currentFilePath is still empty, try to determine it post-download.
            if (!currentFilePath) {
              try {
                console.log("Not Exist file path:");
                // Use --get-filename to reliably get the final filename & no download
                const filename = await this.ytDlpWrap.execPromise([
                  data.url,
                  '--get-filename',
                  '--skip-download'
                ]);
                currentFilePath = path.join(config.outputPath, filename.trim());
              } catch (e) {
                console.error('Could not determine filename after download:', e);
                // Fallback if getting filename fails
                currentFilePath = path.join(config.outputPath, currentTitle || data.urlId);
              }
            }

            this.downloadsState.set(data.urlId, { status: 'completed', url: data.url, urlId: data.urlId, title: currentTitle, percent: 100 });

            const fileStat = fs.statSync(currentFilePath);
            const fileSize = fileStat.size;

            this.emit('download-completed', { urlId: data.urlId, url: data.url, title: currentTitle, status: 'completed', progress: 100, filePath: currentFilePath, fileSize });
            this.broadcastWsMessage('download-completed', { urlId: data.urlId });
          }
          this.processDownloadQueue();
        });
    } catch (error) {
      console.error('Failed to start download process:', error);
      this.activeDownloads.delete(data.urlId);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start download';
      this.emit('download-failed', { urlId: data.urlId, url: data.url, title: currentTitle, status: 'failed', error: errorMessage });
    }
    return true;
  }

  private broadcastWsMessage(type: string, payload: any): void {
    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type, payload }));
        }
      });
    }
  }

  async start(config: ServerConfig): Promise<void> {
    if (this.httpServer) {
      throw new Error('Server is already running');
    }
    const portCheck = await this.checkPortsAvailability(config);
    if (!portCheck.available) {
      throw new Error(`Ports are not available: ${portCheck.conflicts.join(', ')}`);
    }
    this.config = config;

    console.log('Starting ServerManager...', config);

    try {
      this.setupCors(config);
      this.setupRoutes();
      await new Promise<void>((resolve, reject) => {
        console.log('Starting HTTP server... Port :: ', config.port);
        this.httpServer = this.app.listen(config.port, () => { // Use config.port for HTTP
          this.wsServer = new WebSocketServer({ server: this.httpServer! }); // Attach WS to HTTP server
          this.wsServer.on('connection', this.handleWsConnection.bind(this));
          this.wsServer.on('error', (error) => {
            const appError = this.errorHandler.createError(
              'WEBSOCKET_SERVER_ERROR', // A new error code for this specific error
              ErrorCategory.SYSTEM,
              ErrorSeverity.CRITICAL,
              'WebSocket server error',
              'An unexpected error occurred with the WebSocket server. Please restart the application.', // User-friendly message
              ['Restart the application', 'Check your network connection'], // Actionable steps
              { originalError: error.message } // Details
            );
            this.errorHandler.handle(appError); // Pass the created AppError
          });

          resolve();
        });
        this.httpServer.on('error', (err: Error) => reject(err));
      });
      this.emit('server-started', { httpPort: config.port, wsPort: config.wsPort });
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }
  private removeDuplicates = (url_ids:string[]) => {
    return [...new Set(url_ids)];
  };

  private handleWsConnection(ws: WebSocket): void {
    // 연결이 확인되면 클라이언트에서 체크된 urlId를 받아서, DB에 Insert 처리 한다.
    ws.on('message', (message: string) => {
      const { type, data } = JSON.parse(message);

      if (type === 'sync-history') {
        // 1. 브라우저의 ids 가져오기
        // 2. db에서 조회 후, db에 없는 항목(브라우저에만 있는 것들) 'check'로 insert
        // 3. 브라우저에는 없고, db에만 있는 항목들 브라우저로 전송.

        try {
          // Todo 브라우저 항목 중복 제거 기능 필요 여부 판단. (존재하지 않아야함.)
          const url_ids: string[] = this.removeDuplicates(data.data);

          // DB에 없는 항목 insert
          const insertStmt = this.db.prepare(`
            INSERT INTO downloads (url_id, url, status, start_time, end_time)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(url_id) DO NOTHING
          `);

          const getExistingStmt = this.db.prepare(`
            SELECT url_id FROM downloads WHERE url_id IN (${url_ids.map(() => '?').join(',')})
          `);

          const existing = new Set((getExistingStmt.all(...url_ids) as ExistUrls[]).map(row => row.url_id));

          const newUrlIds = url_ids.filter(id => !existing.has(id));

          const bulkInsert = this.db.transaction((url_ids: string[]) => {
            let insertedCount = 0;
            let ignoredCount = 0;
            const start_time = new Date().toISOString(); // 현재 시간

            for (const url_id of url_ids) {
              const result = insertStmt.run(url_id, `https://www.youtube.com/watch?v=${url_id}`, 'check', start_time, start_time);
              if (result.changes > 0) {
                insertedCount++;
                console.log(`✅ Inserted: ${url_id}`);
              } else {
                ignoredCount++;
                console.log(`⚠️ Ignored (duplicate): ${url_id}`);
              }
            }
          });

          // Browser에만 있는 ids insert
          bulkInsert(newUrlIds);

          // DB에만 존재하는 ids
          const missingUrlIds = this.db.prepare(
            `SELECT url_id FROM downloads WHERE url_id NOT IN (${url_ids.map(() => '?').join(',')})`
          ).all(...url_ids);

          console.log('Missing url_ids:', missingUrlIds.length);
          const filteredMissingUrlIds = missingUrlIds.map((item: any) => item.url_id);

          ws.send(JSON.stringify({ type: 'sync-history', data: filteredMissingUrlIds }));
        } catch (error) {
          console.error('Error syncing history:', error);
          ws.send(JSON.stringify({ type: 'sync-history', error: 'Failed to sync history' }));
        } finally {
          this.emit('refresh-history');
        }
        return;
      }

      console.log(`Received message type: ${type} ${ JSON.stringify(data)}`);
      // Optionally handle messages from the client
    });
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
    ws.on('error', (error) => {
      const appError = this.errorHandler.createError(
        'WEBSOCKET_CONNECTION_ERROR',
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM,
        `WebSocket connection error: ${error.message}`,
        'The WebSocket connection encountered an error.',
        ['Check your network connection', 'Restart the application'],
        { originalError: error.message, stack: error.stack }
      );
      this.errorHandler.handle(appError);
    });
  }

  private processDownloadQueue(): void {
    if (this.config && this.activeDownloads.size < this.config.maxConcurrentDownloads) {
      this.emit('request-next-download');
    }
  }

  getStatus(): ServerStatus {
    return {
      running: !!this.httpServer,
      httpPort: this.config?.port,
      wsPort: this.config?.wsPort
    };
  }

  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }

  stopDownload(urlId: string): boolean {
    const controller = this.activeDownloads.get(urlId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(urlId);
      const currentState = this.downloadsState.get(urlId);
      this.downloadsState.set(urlId, { 
        ...(currentState || { url: '', urlId }),
        status: 'stop', 
        error: 'Download stopped'
      });
      this.emit('download-stopped', { urlId, url: currentState?.url || '', status: 'stopped', error: 'Download stopped' });
      return true;
    }
    return false;
  }

  public async stop(): Promise<void> {
    await this.cleanup();
    this.emit('server-stopped');
  }

  public async restart(config: ServerConfig): Promise<void> {
    await this.stop();
    await this.start(config);
    this.emit('server-restarted');
  }

  async startDownloadFromMain(url: string, urlId: string, title: string): Promise<void> {
    if (!this.config) {
      throw new Error('Server not configured. Cannot start download.');
    }
    const data = { url, urlId, title, options: [] };
    await this.startDownload(data);
  }

  public async cleanup(): Promise<void> {
    console.log('Cleaning up ServerManager resources...');
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer?.close((err?: Error) => {
          if (err) {
            console.error('Error closing HTTP server:', err);
            return reject(err);
          }
          console.log('HTTP server closed.');
          resolve();
        });
      });
      this.httpServer = null;
    }

    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      await new Promise<void>((resolve) => {
        this.wsServer?.close(() => {
          console.log('WebSocket server closed.');
          resolve();
        });
      });
      this.wsServer = null;
    }

    this.activeDownloads.clear();
    this.downloadsState.clear();
    this.config = null;
    console.log('ServerManager cleanup complete.');
  }
}