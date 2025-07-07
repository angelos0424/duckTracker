import express, { Request, Response } from 'express';
import cors from 'cors';
import YTDlpWrap from 'yt-dlp-wrap';
import { WebSocket, WebSocketServer } from 'ws';
import { DownloadRequest, DownloadResponse, VideoInfo, ServerConfig } from './types';

const app = express();

const config: ServerConfig = {
  port: 3000,
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
  try {
    // const { urlId, options = [], format = 'best', quality }: DownloadRequest = req.body;

    const { urlId } : DownloadRequest = req.body;
    if (!urlId) {
      console.error("!!!URL ", req.body);
    }

    // check download list

    console.log('urlId ---------------', urlId, activeDownloads.size);
    console.log('check file ', activeDownloads.has(urlId));

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

    console.log("set activeDownloads.");

    const downloadOptions = [
      url,
      '-f',
    ];

    // if (quality) {
    //   downloadOptions.push('--format', `best[height<=${quality}]`);
    // }

    try {
      // const result = await ytDlpWrap.execPromise(downloadOptions);

      let ytDlpEventEmitter = ytDlpWrap.exec([
        url,
        '-f',
        // 'bv*[height>=1080][ext=webm]+ba*[ext=webm]/bv*[ext=mp4]+ba*/best',
        'bv*[height>=1080][ext=webm]+ba*[ext=webm]/bv*[height>=720][ext=webm]+ba*[ext=webm]/bv*[ext=mp4]+ba*[ext=m4a]/bv*[ext=mp4]+ba*[ext=aac]/best',
        '-P',
        '/Users/windows11/Downloads'


      ])
      .on('progress', progress => {
        // console.log(progress.percent, progress.totalSize, progress.currentSpeed, progress.eta)
      })
      .on('ytDlpEvent', (eventType, eventData) => {
        console.log("ytDlpEvent", eventType, eventData);
      })
      .on('error', (error) => {
        console.error(error)
        console.log(url)
        res.json({
          success: false,
        })
      })
      .on('close', () => {
        activeDownloads.delete(urlId)
        console.log('Download complete', urlId);
        res.json({
          success: true,
        })
      });

      // res.json({
      //   success: true,
      //   result: result.trim()
      // });
      console.log('****', ytDlpEventEmitter.ytDlpProcess?.pid);
    } finally {
      activeDownloads.delete(urlId);
    }
  } catch (error) {
    console.error('Download error:', error);
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

wss.on('connection', (ws: WebSocket) => {
  console.log('Extension connected via WebSocket');

  ws.on('message', async (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString()) as {
        action: string;
        url: string;
        options?: string[];
      };

      if (data.action === 'download') {
        ws.send(JSON.stringify({
          status: 'started',
          url: data.url
        }));

        const result = await ytDlpWrap.execPromise([
          data.url,
          '--format', 'best',
          ...(data.options || [])
        ]);

        ws.send(JSON.stringify({
          status: 'completed',
          result: result.trim()
        }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
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