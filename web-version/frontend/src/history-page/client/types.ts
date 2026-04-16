import type { AuthenticatedViewer, FormatOption, HistoryItemBase, HistoryPageViewProps } from '../shared/types.js';

export interface HistoryItem extends HistoryItemBase {}

export interface FormatSelectionPayload {
    urlId: string;
    formatId: string;
}

export interface RequestDownloadPayload {
    url: string;
    formatId?: string;
}

export type HistoryPageBootstrap = Omit<HistoryPageViewProps, 'items'> & {
    items: HistoryItem[];
    viewer?: AuthenticatedViewer | null;
};

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
