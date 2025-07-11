import express, { Request, Response } from 'express';
import cors from 'cors';
import YTDlpWrap from 'yt-dlp-wrap';
import { WebSocket, WebSocketServer } from 'ws';
import { DownloadRequest, DownloadResponse, VideoInfo, ServerConfig } from './types';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigins: [
    'chrome-extension://*',
    'moz-extension://*',
    'http://localhost:*'
  ],
  maxConcurrentDownloads: 3
};

// CORS 설정
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// YT-DLP 래퍼 초기화
const ytDlpWrap = new YTDlpWrap();

// 현재 진행 중인 다운로드 추적
const activeDownloads = new Map<string, boolean>();

// 헬스 체크 엔드포인트
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeDownloads: activeDownloads.size
  });
});

// 비디오 정보 조회
app.post('/api/info', async (req: Request, res: Response<VideoInfo | { error: string }>) => {
  try {
    const { url }: { url: string } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const info = await ytDlpWrap.execPromise([
      url,
      '--dump-json',
      '--no-download'
    ]);

    const videoInfo = JSON.parse(info);

    res.json({
      title: videoInfo.title,
      duration: videoInfo.duration,
      url: videoInfo.webpage_url,
      formats: videoInfo.formats?.map((format: any) => ({
        format_id: format.format_id,
        ext: format.ext,
        quality: format.quality || format.height || 'unknown',
        filesize: format.filesize
      })) || []
    });
  } catch (error) {
    console.error('Info fetch error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 다운로드 엔드포인트
app.post('/api/download', async (req: Request, res: Response<DownloadResponse>) => {
  const { urlId } : DownloadRequest = req.body;

  try {
    if (!urlId) {
      console.log("!!!URL ", req.body);
    }

    if (activeDownloads.has(urlId)) {
      console.error("다운로드 중인 파일입니두")

      return res.status(422).json({
        success: false,
        error: '다운로드 중인 파일입니다.'
      })
    }

    activeDownloads.set(urlId, true);
    const url = "https://www.youtube.com/watch?v=" + urlId;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // 동시 다운로드 제한
    if (activeDownloads.size >= config.maxConcurrentDownloads) {
      return res.status(429).json({
        success: false,
        error: 'Too many concurrent downloads. Please try again later.'
      });
    }

    try {
      let ytDlpEventEmitter = ytDlpWrap.exec([
        url,
        '-f',
        // 'bv*[height>=1080][ext=webm]+ba*[ext=webm]/bv*[ext=mp4]+ba*/best',
        'bv*[height>=1080][ext=webm]+ba*[ext=webm]/bv*[height>=720][ext=webm]+ba*[ext=webm]/bv*[ext=mp4]+ba*[ext=m4a]/bv*[ext=mp4]+ba*[ext=aac]/best',
        '-P',
        '/Users/windows11/Downloads'

      ])
      .on('progress', progress => {
        console.log(progress.percent, progress.totalSize, progress.currentSpeed, progress.eta)
      })
      .on('ytDlpEvent', (eventType, eventData) => {
        console.log("ytDlpEvent", eventType, eventData);
      })
      .on('error', (error) => {
        console.error('Download process error:', error);
        activeDownloads.delete(urlId);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed during download process.'
          });
        }
      })
      .on('close', () => {
        activeDownloads.delete(urlId);
        console.log('Download complete', urlId);
        if (!res.headersSent) {
          res.json({
            success: true,
          });
        }
      });

      console.log('Download process started with PID:', ytDlpEventEmitter.ytDlpProcess?.pid);

    } catch (error) {
      activeDownloads.delete(urlId);
      console.error('Failed to start download process:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start download'
        });
      }
    }
  } catch (error) {
    console.error('Download error:', error);
    activeDownloads.delete(urlId);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Download failed'
    });
  }
});

// 활성 다운로드 목록
app.get('/api/downloads', (req: Request, res: Response) => {
  res.json({
    active: activeDownloads.size,
    maxConcurrent: config.maxConcurrentDownloads
  });
});

// WebSocket 서버 설정
const wss = new WebSocketServer({ port: 8080 });

interface ResponseMessage {
  status: string;
  url?: string;
  error?: string;
  title?: string;
  percent?: number;
}

wss.on('connection', (ws: WebSocket) => {
  const msg: ResponseMessage = {
    status: ''
  };
  ws.on('message', async (message: Buffer) => {
    const data = JSON.parse(message.toString()) as {
      action: string;
      url: string;
      urlId: string;
      options?: string[];
    };
    console.log('Received message:', data);

    msg.url = data.url;

    if (data.action !== 'download' || !data.url) {
      return ws.send(JSON.stringify({
        status: 'error',
        error: 'Invalid request. Action must be "download" and URL must be provided.'
      }));
    }

    // URL에서 videoId 추출 (YouTube URL 형식 가정)
    const urlId = data.urlId;

    if (!urlId) {
      return ws.send(JSON.stringify({
        status: 'error',
        error: 'UrlId is required. Please try again.'
      }));
    }

    // 동시 다운로드 제한 체크
    if (activeDownloads.size >= config.maxConcurrentDownloads) {
      return ws.send(JSON.stringify({
        status: 'error',
        url: data.url,
        error: 'Too many concurrent downloads. Please try again later.'
      }));
    }

    // 이미 다운로드 중인 파일인지 체크
    if (activeDownloads.has(urlId)) {
      return ws.send(JSON.stringify({
        status: 'error',
        url: data.url,
        error: 'This video is already being downloaded.'
      }));
    }

    activeDownloads.set(urlId, true);
    ws.send(JSON.stringify({ status: 'started', urlId: urlId }));

    const downloadOption = [
      data.url,
      '-f',
      process.env.FORMAT || 'bv*[height>=1080][ext=webm]+ba*[ext=webm]/bv*[height>=720][ext=webm]+ba*[ext=webm]/bv*[ext=mp4]+ba*[ext=m4a]/bv*[ext=mp4]+ba*[ext=aac]/best',
      '-P',
      process.env.OUTPUT_PATH || '/Users/windows11/Downloads', // 참고: 다운로드 경로는 필요에 따라 수정하세요.
      ...(data.options || [])
    ]

    try {
      ytDlpWrap.exec(downloadOption)
      .on('ytDlpEvent', (eventType, eventData) => {
        console.log("ytDlpEvent", eventType, eventData);
        if (eventType === 'download') {
          msg.status = 'progress';
          console.log('progress...', msg)
          if (eventData.startsWith(' Destination')) {
            // get title
            const title = eventData.split(` Destination: ${downloadOption[4]}/`)[1]
            msg.title = title;
            console.log('title...', msg, downloadOption[4])
            ws.send(JSON.stringify(msg));
          } else {
            const percent = eventData.split('%')[0];
            msg.percent = parseInt(percent);
            ws.send(JSON.stringify({...msg}));
          }
        }
      })
      .on('error', (error) => {
        console.error('Download process error:', error);
        activeDownloads.delete(urlId);
        ws.send(JSON.stringify({
          status: 'error',
          url: data.url,
          error: error.message || 'Failed during download process.'
        }));
      })
      .on('close', () => {
        console.log('Download complete:', data.url);
        activeDownloads.delete(urlId);
        ws.send(JSON.stringify({
          status: 'completed',
          url: data.url
        }));
      });
    } catch (error) {
      console.error('Failed to start download process:', error);
      activeDownloads.delete(urlId);
      ws.send(JSON.stringify({
        status: 'error',
        url: data.url,
        error: error instanceof Error ? error.message : 'Failed to start download'
      }));
    }
  });

  ws.on('close', () => {
    console.log('Extension disconnected');
  });
});

// 서버 시작
app.listen(config.port, () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`📡 WebSocket server running on ws://localhost:8080`);
});

// 종료 시 정리
process.on('SIGINT', () => {
  console.log('\n🔄 Shutting down server...');
  wss.close();
  process.exit(0);
});