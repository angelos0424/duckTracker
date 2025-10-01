import type { DownloadRecordRow } from '../database.js';
import type { FormatOption, HistoryItemBase } from './shared/types.js';

export type HistoryItem = Omit<DownloadRecordRow, keyof HistoryItemBase> & HistoryItemBase;

export interface PaginationState {
    page: number;
    totalPages: number;
    pageSize: number;
    searchTerm?: string;
}

export interface HistoryPageViewProps {
    items: HistoryItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
    searchTerm?: string;
    wsPath: string;
    checkFormatList: boolean;
}

export type { FormatOption } from './shared/types.js';
