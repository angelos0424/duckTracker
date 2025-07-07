export interface DownloadRequest {
  urlId: string;
  options?: string[];
  format?: string;
  quality?: string;
}

export interface DownloadResponse {
  success: boolean;
  result?: string;
  error?: string;
  progress?: number;
}

export interface VideoInfo {
  title: string;
  duration: number;
  url: string;
  formats: VideoFormat[];
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  quality: string;
  filesize?: number;
}

export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  maxConcurrentDownloads: number;
}