export type ServerMessageStatus =
  | 'started'
  | 'stop'
  | 'error'
  | 'progress'
  | 'completed'
  | 'queued'
  | 'downloading';

export type BrowserDownloadStatus = 'complete' | 'completed' | 'error' | 'progress';

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

export enum ElementTypes {
  VIDEO = 'VIDEO',
  SHORTS = 'SHORTS',
  PLAYLIST = 'PLAYLIST',
  VIDEOPLAYER = 'VIDEOPLAYER',
}

export enum FromType {
  MAIN = 'MAIN',
  SEARCH = 'SEARCH',
  PLAYLIST = 'PLAYLIST',
  CHANNEL = 'CHANNEL',
  SUBSCRIPT = 'SUBSCRIPT',
  VIDEO = 'VIDEO',
  SHORTS = 'SHORTS',
}

export interface DownloadObject {
  type: ElementTypes;
  from: FromType;
  url: string;
  urlId?: string | null;
}
