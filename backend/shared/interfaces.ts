import {videoCodec, videoFormat, videoQuality} from "./types";

export interface ResponseMessage {
  status: string;
  url?: string;
  urlId?: string;
  error?: string;
  title?: string;
  percent?: number;
}

export interface DownloadRequest {
  action: string;
  url: string;
  urlId: string;
  options?: string[];
}

export interface FrontendMessage {
  type: string;
  data?: any;
  id?: string;
}

export interface BackendMessage {
  type: string;
  data?: any;
  id?: string;
}

export interface DownloadConfig {
  outputPath: string; // 다운로드 경로
  port: number; // 포트 충돌 시. 통신할 포트. extension의 port랑 동일해야함.
  // corsOrigins: string[]; 이건 왜 필요한겨.
  maxConcurrentDownloads: number;
  format: string;

  videoQuality: videoQuality;
  videoFormat: videoFormat; // Best, 4K, 1440p, 1080p, 720p, 480p, 360p
  videoCodec: videoCodec; // h264, av1, vp9
}

export interface ServerStatus {
  running: boolean;
  httpPort?: number;
  wsPort?: number;
  error?: string;
}
