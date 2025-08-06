export interface ServerConfig {
  downloadPath: string;
  maxConcurrentDownloads: number;
  preferredQuality: string;
  autoStartDownload: boolean;
  autoOpenFolder: boolean;
  // Add other settings as needed
}

export interface ServerStatus {
  running: boolean;
  httpPort?: number;
  wsPort?: number;
  error?: string;
}

export interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonColor?: 'danger' | 'warning' | 'info';
  icon?: string;
}

export interface UrlInputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
  getUrlFromClipboard: () => Promise<string>;
}

export interface DownloadRecord {
  id: number; // Auto-incrementing primary key
  url: string;
  url_id: string; // Unique identifier for the URL
  title: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'check';
  progress: number; // 0-100
  file_path?: string;
  file_size?: number;
  downloadedBytes?: number;
  speed?: number;
  eta?: number;
  error_message?: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
}

type UrlType = 'Video' | 'Playlist' | 'Shorts' | 'Unknown'; //Todo 'Live Stream'
export interface UrlInfo {
  type: UrlType;
  urlId: string;
}
