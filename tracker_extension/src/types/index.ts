
export type ServerMessageStatus = 'started' | 'stop' | 'error' | 'progress' | 'completed';

export type DownloadItem = {
  title: string;
  date: string;
  status: ServerMessageStatus;
  error?: string;
  percent?: number;
};

export interface IResponse {
  success: boolean;
  error?: string;
}

export interface HistoryType {
  data: string[]; // Todo add create_at.
}
