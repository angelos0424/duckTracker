import type { HistoryItem } from '../types.js';

export function formatProgress(value: unknown): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    if (numeric <= 0) {
        return 0;
    }
    if (numeric >= 100) {
        return 100;
    }
    return Math.round(numeric);
}

export function getProgressFromItem(item: HistoryItem): number {
    if (Number.isFinite(item.percent)) {
        return formatProgress(item.percent as number);
    }
    return item.status === 'completed' ? 100 : 0;
}

export function formatFileSize(bytes: unknown): string | null {
    if (bytes === null || bytes === undefined) {
        return null;
    }
    const numeric = typeof bytes === 'number' ? bytes : Number(bytes);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }
    const megabytes = numeric / (1024 * 1024);
    if (megabytes >= 1000) {
        const gigabytes = megabytes / 1024;
        return `${gigabytes.toFixed(2)} GB`;
    }
    return `${megabytes.toFixed(2)} MB`;
}
