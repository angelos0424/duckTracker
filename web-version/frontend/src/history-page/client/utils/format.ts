import type { FormatOption, HistoryItem } from '../types.js';

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
    if (item && Number.isFinite(item.percent)) {
        return formatProgress(item.percent as number);
    }
    return item && item.status === 'completed' ? 100 : 0;
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

export function validateUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_error) {
        return false;
    }
}

export function deriveUrlId(value: string): string {
    try {
        const parsed = new URL(value);
        if (parsed.searchParams.has('list')) {
            return parsed.searchParams.get('list') || '';
        }
        const pathname = parsed.pathname || '';
        const shortsMatch = pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/u);
        if (shortsMatch && shortsMatch[1]) {
            return shortsMatch[1];
        }
        const watchId = parsed.searchParams.get('v');
        if (watchId) {
            return watchId;
        }
        if (parsed.hostname === 'youtu.be') {
            const parts = pathname.split('/');
            if (parts.length > 1 && parts[1]) {
                return parts[1];
            }
        }
        return parsed.href;
    } catch (_error) {
        return '';
    }
}

export function normaliseFormatOptions(options: unknown): FormatOption[] {
    if (!Array.isArray(options)) {
        return [];
    }

    const result: FormatOption[] = [];
    for (const item of options) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const raw = item as Record<string, unknown>;
        if (!raw.id) {
            continue;
        }

        const id = String(raw.id);
        const resolution = typeof raw.resolution === 'string' ? raw.resolution : '';
        const rawTbr = typeof raw.tbr === 'number' && Number.isFinite(raw.tbr) ? (raw.tbr as number) : null;
        const ext = typeof raw.ext === 'string' ? raw.ext : '';
        const rawFilesize = typeof raw.filesize === 'number' && Number.isFinite(raw.filesize) ? (raw.filesize as number) : null;
        const isAudioOnly = raw.isAudioOnly === true;
        const label =
            typeof raw.label === 'string' && raw.label.trim()
                ? raw.label.trim()
                : [resolution, rawTbr !== null ? String(rawTbr) : '', ext, rawFilesize !== null ? String(rawFilesize) : '']
                      .filter((part) => part !== '')
                      .join('|');

        result.push({
            id,
            label: label || id,
            resolution,
            tbr: rawTbr,
            ext,
            filesize: rawFilesize,
            isAudioOnly
        });
    }

    return result;
}

export function extractFilename(response: Response, fallback: string): string {
    const disposition = response.headers.get('Content-Disposition');
    if (!disposition) {
        return fallback;
    }
    const encodedMatch = /filename\*=UTF-8''([^;]+)/iu.exec(disposition);
    const quotedMatch = /filename="?([^";]+)"?/iu.exec(disposition);
    const raw = (encodedMatch && encodedMatch[1]) || (quotedMatch && quotedMatch[1]);
    if (!raw) {
        return fallback;
    }
    try {
        return decodeURIComponent(raw.trim());
    } catch (_error) {
        return raw.trim();
    }
}
