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
