import NeutralinoApp from "node-neutralino"
import dotenv from 'dotenv';
import * as path from 'path';
import { YtdlpService } from './services/YtdlpService';
import {DatabaseManager, DownloadRecord} from './database/DatabaseManager';
import { handleFrontendMessage } from './utils/eventHandlers';
import { FrontendMessage, BackendMessage } from './shared/interfaces';
import { DownloadConfig, ServerStatus } from './shared/interfaces';
import express from 'express';
import cors from 'cors';

dotenv.config();

async function main() {
  const app = new NeutralinoApp({
    url: "/",
    windowOptions: {
      enableInspector: true,
      frontendLibrary: {
        patchFile: "/react-src/public/index.html",
        devUrl: "http://localhost:3000",
        projectPath: "/react-src/",
        resourcesPath: "/react-src/build/",
        devCommand: "npm run start",
      }
    }
  });

  app.init();

  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json());

  const dbPath = path.join(process.cwd(), 'data', 'app.db');
  const databaseManager = new DatabaseManager(dbPath);

  const config: DownloadConfig = await databaseManager.getSettings();

  const ytdlpService = new YtdlpService(config, app, databaseManager);

  app.events.on('front-send', async (ev) => {
    console.log('Received message from frontend:', ev);
    await handleFrontendMessage(app, databaseManager, ytdlpService, config, ev as FrontendMessage);
  });

  // REST API Endpoints for Chrome Extension
  expressApp.get('/downloads', async (req, res) => {
    try {
      const downloads = await databaseManager.getDownloads();
      res.json(downloads);
    } catch (error) {
      console.error('Error fetching downloads:', error);
      res.status(500).json({ error: 'Failed to fetch downloads' });
    }
  });


  interface DownloadRequest {
    action: 'stop' | 'getDownloads';
    url: string;
    urlId: string;
  }
  expressApp.post('/download', async (req, res) => {
    try {
      const { url, urlId } = req.body;
      console.log('Received download request:', url, urlId);
      if (!url || !urlId) {
        return res.status(400).json({ error: 'URL and urlId are required' });
      }
      await ytdlpService.startDownload(url, urlId);
      res.status(200).json({ message: 'Download started', urlId });
    } catch (error) {
      console.error('Error starting download:', error);
      res.status(500).json({ error: 'Failed to start download' });
    }
  });

  expressApp.post('/downloads/stop', async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Download ID is required' });
      }
      await ytdlpService.stopDownload(id);
      res.status(200).json({ message: 'Download stopped', id });
    } catch (error) {
      console.error('Error stopping download:', error);
      res.status(500).json({ error: 'Failed to stop download' });
    }
  });

  expressApp.post('/save_history', async (req, res) => {
    try {
      const {url, urlId} = req.body;
      if (!(url || urlId)) {
        return res.status(400).json({ error: 'URL and urlId are required' });
      }

      const tmpDownloadRecord: Omit<DownloadRecord, 'id' | 'created_at'> = {
        url,
        url_id: urlId,
        title: '',
        status: 'check',
        progress: 0,
        file_path: '',
        error_message: '',
        end_time: '',
        start_time: new Date().toISOString(),
      }

      await databaseManager.upsertDownload(tmpDownloadRecord)
      // todo front에 추가된거 알려줘야함.

      app.events.broadcast('download-update', tmpDownloadRecord);

      res.status(200).json({ message: 'Download saved', urlId });
    } catch (error) {
      console.error('Error saving download:', error);
      res.status(500).json({ error: 'Failed to save download' });
    }
  })

  const port = config.port || 8080;
  expressApp.listen(port, () => {
    console.log(`Express server listening on port ${port}`);
  });
}

main();