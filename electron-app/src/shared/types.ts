// Shared types between main and renderer processes

export interface DownloadRecord {
  id: string;
  url: string;
  urlId: string;
  title: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'queued' | 'check';
  progress: number;
  filePath?: string;
  fileSize?: number;
  errorMessage?: string;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
}

export interface AppSettings {
  language: 'en' | 'ko';
  downloadPath: string;
  videoQuality: 'best' | '1080p' | '720p' | '480p';
  outputTemplate: string;
  maxConcurrentDownloads: number;
  httpPort: number;
  wsPort: number;
  minimizeToTray: boolean;
  showNotifications: boolean;
}

export interface ServerStatus {
  running: boolean;
  httpPort: number | undefined;
  wsPort: number | undefined;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// IPC Event types
export interface MainToRendererEvents {
  'download-updated': (record: DownloadRecord) => void;
  'download-retried': (record: DownloadRecord) => void;
  'server-status-changed': (status: ServerStatus) => void;
  'settings-updated': (settings: AppSettings) => void;
}

export interface RendererToMainEvents {
  'get-downloads': () => Promise<DownloadRecord[]>;
  'delete-downloads': (ids: string[]) => Promise<void>;
  'open-file-location': (filePath: string) => Promise<void>;
  'retry-download': (id: string) => Promise<void>;
  'get-settings': () => Promise<AppSettings>;
  'save-settings': (settings: AppSettings) => Promise<void>;
  'reset-settings': () => Promise<AppSettings>;
  'restart-server': () => Promise<void>;
}

type UrlType = 'Video' | 'Playlist' | 'Shorts' | 'Unknown'; //Todo 'Live Stream'
export interface UrlInfo {
  type: UrlType;
  urlId: string;
}

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
  wsPort: number;
  corsOrigins: string[];
  maxConcurrentDownloads: number;
  outputPath: string;
  format: string;
  outputTemplate: string;
}

export interface ResponseMessage {
  status: string;
  url?: string;
  urlId?: string;
  error?: string;
  title?: string;
  percent?: number;
}

export interface DownloadEventData {
  urlId: string;
  url: string;
  title?: string | undefined;
  status: 'downloading' | 'completed' | 'failed' | 'stopped';
  progress: number;
  filePath?: string;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  fileSize?: number;
}

export interface DownloadEvent {
  type: 'started' | 'progress' | 'completed' | 'failed' | 'stopped';
  urlId: string;
  url: string;
  title?: string;
  status: 'downloading' | 'completed' | 'failed' | 'stopped';
  progress: number;
  filePath?: string;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface DatabaseMigration {
  version: number;
  description: string;
  sql: string;
}