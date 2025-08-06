import * as path from 'path';
import YTDlpWrap from 'yt-dlp-wrap';
import { WebSocket } from 'ws';
import NeutralinoApp from 'node-neutralino';
import { DatabaseManager, DownloadRecord } from '../database/DatabaseManager';
import { ResponseMessage, DownloadRequest, DownloadConfig } from '../shared/interfaces';
import {downloadStatus} from "../shared/types";

export class YtdlpService {
  private ytDlpWrap: YTDlpWrap;
  private activeDownloads: Map<string, AbortController>;
  private config: DownloadConfig;
  private app: NeutralinoApp;
  private dbManager: DatabaseManager;

  constructor(config: DownloadConfig, app: NeutralinoApp, dbManager: DatabaseManager) {
    this.ytDlpWrap = new YTDlpWrap();
    this.activeDownloads = new Map<string, AbortController>();
    this.config = config;
    this.app = app;
    this.dbManager = dbManager;
  }

  // Public method to handle requests from WebSocket clients (e.g., Chrome Extension)
  public async handleDownloadRequest(data: DownloadRequest, ws: WebSocket) {
    if (data.action === 'stop') {
      await this.stopDownload(data.urlId, ws);
      return;
    }

    if (data.action === 'getDownloads') {
      const downloads = await this.dbManager.getDownloads();
      ws.send(JSON.stringify({ status: 'downloads', payload: downloads }));
      return;
    }

    if (data.action === 'download' && data.url && data.urlId) {
      await this.startDownload(data.url, data.urlId, data.options, ws);
    } else {
      ws.send(JSON.stringify({
        status: 'error',
        error: 'Invalid request. Action must be "download" and URL/urlId must be provided.'
      }));
    }
  }

  // Public method to stop a download
  public async stopDownload(urlId: string, ws?: WebSocket) {
    const controller = this.activeDownloads.get(urlId);
    if (controller) {
      controller.abort();
      const msg = { status: 'stop', urlId, error: 'Download stopped by user.' };
      
      // Notify client if available
      ws?.send(JSON.stringify(msg));
      
      // Notify frontend app
      this.app.events.broadcast('download-update', msg);

      await this.dbManager.updateDownload({ url_id: urlId, status: 'cancelled', end_time: new Date().toISOString() });
      console.log(`Download stopped for urlId: ${urlId}`);
    }
  }

  // Unified method to start a download process
  public async startDownload(url: string, urlId: string, options?: string[], ws?: WebSocket) {
    const msg: ResponseMessage = { status: '', url, urlId };

    if (this.activeDownloads.size >= this.config.maxConcurrentDownloads) {
      msg.status = 'error';
      msg.error = 'Too many concurrent downloads. Please try again later.';
      ws?.send(JSON.stringify(msg));
      // No broadcast for this, as it's a pre-check failure
      return;
    }

    if (this.activeDownloads.has(urlId)) {
      msg.status = 'error';
      msg.error = 'This video is already being downloaded.';
      ws?.send(JSON.stringify(msg));
      return;
    }

    const controller = new AbortController();
    this.activeDownloads.set(urlId, controller);

    const newDownloadRecord: Omit<DownloadRecord, 'id' | 'created_at'> = {
      url,
      url_id: urlId,
      title: '',
      status: 'pending',
      progress: 0,
      file_path: '',
      error_message: '',
      end_time: '',
      start_time: new Date().toISOString(),
    };

    // Notify that download is starting
    ws?.send(JSON.stringify({ status: 'started', urlId }));
    this.app.events.broadcast('backend-send', { type: 'download-update', data: newDownloadRecord });

    await this.dbManager.upsertDownload(newDownloadRecord);

    const downloadOptions = [
      url,
      '-f',
      this.config.format,
      '-P',
      this.config.outputPath,
      ...(options || [])
    ];

    try {
      this.ytDlpWrap.exec(downloadOptions, { shell: false, detached: true }, controller.signal)
        .on('ytDlpEvent', async (eventType: string, eventData: string) => {
          console.log(`ytDlpEvent: ${eventType} - ${eventData}`);
          await this.handleYtDlpEvent(eventType, eventData, url, urlId, ws);
        })
        .on('error', async (error: Error) => {
          console.error(`Download process error for ${urlId}:`, error);
          this.activeDownloads.delete(urlId);
          const errorMsg = {
            status: 'error',
            url,
            urlId,
            error: error.message || 'Failed during download process.',
          };
          ws?.send(JSON.stringify(errorMsg));
          this.app.events.broadcast('download-update', errorMsg);
          await this.dbManager.updateDownload({ url_id: urlId, status: 'failed', error_message: errorMsg.error, end_time: new Date().toISOString() });
        })
        .on('close', async () => {
          this.activeDownloads.delete(urlId);
          // Check status because 'close' also fires on abort/error
          const finalRecord = await this.dbManager.getDownloadByUrlId(urlId);
          if (finalRecord && finalRecord.status !== 'failed' && finalRecord.status !== 'cancelled') {
            console.log(`Download complete: ${urlId}`);
            const successMsg = { status: 'completed', url, urlId, title: finalRecord.title, filePath: finalRecord.file_path };
            ws?.send(JSON.stringify(successMsg));
            this.app.events.broadcast('download-update', successMsg);
            await this.dbManager.updateDownload({ url_id: urlId, status: 'completed', end_time: new Date().toISOString() });
          }
        });
    } catch (error) {
      console.error(`Failed to start download process for ${urlId}:`, error);
      this.activeDownloads.delete(urlId);
      const errorMsg = {
        status: 'error',
        url,
        urlId,
        error: error instanceof Error ? error.message : 'Failed to start download'
      };
      ws?.send(JSON.stringify(errorMsg));
      this.app.events.broadcast('download-update', errorMsg);
      await this.dbManager.updateDownload({ url_id: urlId, status: 'failed', error_message: errorMsg.error, end_time: new Date().toISOString() });
    }
  }

  private async handleYtDlpEvent(eventType: string, eventData: string, url: string, urlId: string, ws?: WebSocket) {
    const progressUpdate = (update: Partial<DownloadRecord>) => {
        const message = { status: 'progress', url, urlId, ...update };
        ws?.send(JSON.stringify(message));
        this.app.events.broadcast('backend-send', update);
    };

    if (eventType === 'download') {
        // Example: [download] Destination: video.mp4
        if (eventData.includes('Destination:')) {
            const title = path.basename(eventData.split('Destination:')[1].trim());
            progressUpdate({ title });
            await this.dbManager.updateDownload({ url_id: urlId, title, status: 'downloading' });
        }
        // Example: [download]   0.0% of ...
        else if (eventData.includes('%')) {
            try {
                const progress = parseFloat(eventData.trim().split('%')[0]);
                if (!isNaN(progress)) {
                    progressUpdate({ progress });
                    await this.dbManager.updateDownload({ url_id: urlId, progress });
                }
            } catch (e) {
                // ignore parse errors
            }
        }
    }
    // Example: [Merger] Merging formats into "video.mp4"
    else if (eventType === 'Merger') {
        if(eventData.includes('Merging formats into')) {
            const title = path.basename(eventData.split('"')[1].trim());
            const filePath = path.join(this.config.outputPath, title);
            progressUpdate({ title, file_path: filePath });
            await this.dbManager.updateDownload({ url_id: urlId, title, file_path: filePath });
        }
    }
  }

  public broadcastDownloadUpdate(type: downloadStatus, data: DownloadRecord) {
    this.app.events.broadcast('backend-send', { type, data });
  }
}
