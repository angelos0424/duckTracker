import type { FormatOption, HistoryItemBase } from '../shared/types.js';

export interface HistoryItem extends HistoryItemBase {}

export interface FormatSelectionPayload {
    urlId: string;
    formatId: string;
}

export interface RequestDownloadPayload {
    url: string;
    formatId?: string;
}

export interface HistoryPageBootstrap {
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

export interface WebSocketMessage {
    type?: string;
    item?: HistoryItem;
    urlId?: string;
    payload?: unknown;
}

export interface DownloadRequestResponse {
    success?: boolean;
    error?: string;
    mode?: 'url' | 'format';
    item?: HistoryItem;
    options?: FormatOption[];
    formatOptions?: FormatOption[];
    title?: string;
    url?: string;
    requiresFormatSelection?: boolean;
}

export type { FormatOption } from '../shared/types.js';
