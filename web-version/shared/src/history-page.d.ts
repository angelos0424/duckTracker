export interface FormatOption {
    id: string;
    label: string;
    resolution?: string;
    tbr?: number | null;
    ext?: string;
    filesize?: number | null;
    isAudioOnly?: boolean | null;
}

export type AddDownloadDialogMode = 'url' | 'format';

export interface HistoryItemBase {
    urlId?: string | null;
    title?: string | null;
    url?: string | null;
    filePath?: string | null;
    status?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    fileSizeBytes?: number | null;
    percent?: number | null;
    formatOptions?: FormatOption[] | null;
    lastError?: string | null;
    error?: string | null;
}

export interface HistoryItem extends HistoryItemBase {}

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
