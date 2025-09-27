
export type ServerMessageStatus = 'started' | 'stop' | 'error' | 'progress' | 'completed';

export type DownloadItem = {
  title: string;
  date: string;
  status: ServerMessageStatus;
  error?: string;
  percent?: number;
  fileName?: string;
};

export interface IResponse {
  success: boolean;
  error?: string;
}

export interface HistoryType {
  data: string[]; // Todo add create_at.
}

export interface DownloadStatusPayload {
  status: ServerMessageStatus | 'queued' | 'pending';
  url: string;
  urlId: string;
  error?: string;
  percent?: number;
  title?: string;
  fileName?: string;
  filePath?: string;
}

export interface DownloadRequestPayload {
  url: string;
  urlId: string;
  options?: string[];
}

export interface DownloadInitiationResponse {
  success: boolean;
  data: {
    status: ServerMessageStatus | 'queued' | 'completed';
    urlId: string;
    error?: string;
    fileName?: string;
  };
}
