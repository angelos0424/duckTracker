import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ServerResponse } from 'node:http';
import type { ServerConfig } from '../config.js';
import type { DownloadManager } from '../download-manager.js';
import { getDownloadState, recordDownloadFilePath } from '../database.js';

export class HistoryFileError extends Error {
    public readonly statusCode: number;
    public readonly payload: { error: string };

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.payload = { error: message };
        this.name = 'HistoryFileError';
    }
}

export interface HistoryFileResolution {
    record: NonNullable<ReturnType<typeof getDownloadState>>;
    resolvedPath: string;
    stats: fs.Stats;
}

export interface HistoryFileContext {
    config: ServerConfig;
    downloadManager: DownloadManager;
}

function isPathInside(baseDir: string, candidatePath: string): boolean {
    const relative = path.relative(baseDir, candidatePath);
    if (relative === '') {
        return true;
    }
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function resolveWithinDownloadDir(context: HistoryFileContext, filePath: string | null | undefined): string {
    if (!filePath) {
        return '';
    }

    const trimmed = filePath.trim();
    if (!trimmed) {
        return '';
    }

    const normalised = path.normalize(trimmed);
    const absolute = path.isAbsolute(normalised)
        ? normalised
        : path.resolve(context.config.downloadDir, normalised);

    if (!isPathInside(context.config.downloadDir, absolute)) {
        return '';
    }

    return absolute;
}

export async function resolveHistoryFileOrThrow(
    context: HistoryFileContext,
    urlId: string
): Promise<HistoryFileResolution> {
    const record = getDownloadState(urlId);

    if (!record) {
        throw new HistoryFileError(404, '다운로드 정보를 찾을 수 없습니다.');
    }

    let resolved = resolveWithinDownloadDir(context, record.filePath);

    if (!resolved) {
        console.warn('[history] File download outside directory', { urlId, filePath: record.filePath });
        throw new HistoryFileError(403, 'File outside of download directory');
    }

    let stats: fs.Stats;
    try {
        stats = await fs.promises.stat(resolved);
    } catch (statError) {
        const err = statError as NodeJS.ErrnoException;
        if (err && err.code === 'ENOENT') {
            const fallback = context.downloadManager.findExistingFileById(urlId);
            if (!fallback) {
                console.warn('[history] File download fallback not found', { urlId });
                throw new HistoryFileError(404, 'File not found');
            }

            const normalisedFallback = resolveWithinDownloadDir(context, fallback);
            if (!normalisedFallback) {
                console.warn('[history] File download fallback outside directory', { urlId, fallback });
                throw new HistoryFileError(403, 'File outside of download directory');
            }

            try {
                stats = await fs.promises.stat(normalisedFallback);
                resolved = normalisedFallback;
                const relative = path.relative(context.config.downloadDir, resolved);
                const clientPath =
                    relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : resolved;
                recordDownloadFilePath({
                    urlId,
                    filePath: clientPath,
                    fileSizeBytes: stats.size
                });
            } catch (fallbackError) {
                const fallbackErr = fallbackError as NodeJS.ErrnoException;
                console.error('[history] File download fallback stat failed', {
                    urlId,
                    error: fallbackErr.message
                });
                throw new HistoryFileError(fallbackErr.code === 'ENOENT' ? 404 : 500, 'File not found');
            }
        } else {
            console.error('[history] File stat failed', { urlId, error: err?.message });
            throw new HistoryFileError(500, 'File not found');
        }
    }

    return { record, resolvedPath: resolved, stats };
}

export function getContentTypeForPath(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
        case '.mp4':
            return 'video/mp4';
        case '.mkv':
        case '.mk3d':
        case '.mka':
        case '.mks':
            return 'video/x-matroska';
        case '.webm':
            return 'video/webm';
        case '.mov':
        case '.qt':
            return 'video/quicktime';
        case '.avi':
            return 'video/x-msvideo';
        case '.mp3':
            return 'audio/mpeg';
        case '.m4a':
        case '.mp4a':
            return 'audio/mp4';
        case '.ogg':
        case '.oga':
            return 'audio/ogg';
        case '.wav':
            return 'audio/wav';
        case '.flac':
            return 'audio/flac';
        default:
            return 'application/octet-stream';
    }
}

const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001F]/gu;
const MAX_FILENAME_BASE_LENGTH = 180;

export function normaliseDownloadBaseName(candidate: string | undefined | null): string | null {
    if (!candidate) {
        return null;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
        return null;
    }
    const cleaned = trimmed.replace(INVALID_FILENAME_CHARACTERS, '_').replace(/\s+/gu, ' ');
    const withoutTrailingDots = cleaned.replace(/\.+$/u, '').trim();
    if (!withoutTrailingDots) {
        return null;
    }
    if (withoutTrailingDots.length <= MAX_FILENAME_BASE_LENGTH) {
        return withoutTrailingDots;
    }
    return withoutTrailingDots.slice(0, MAX_FILENAME_BASE_LENGTH).trim();
}

function encodeRFC5987Value(str: string): string {
    return encodeURIComponent(str)
        .replace(/['()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%(?:7C|60|5E)/gu, (match) => match.toUpperCase());
}

export function formatContentDisposition(filename: string): string {
    const fallback = filename
        .replace(/[^\x20-\x7E]/gu, '_')
        .replace(/["\\]/gu, '_')
        .trim() || 'download';
    const encoded = encodeRFC5987Value(filename);
    return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function deriveDownloadFileName(options: {
    requestedBaseName: string | undefined | null;
    recordTitle: string | undefined;
    resolvedPath: string;
}): string {
    const extension = path.extname(options.resolvedPath) || '';
    const candidates = [
        options.requestedBaseName,
        options.recordTitle,
        extension ? path.basename(options.resolvedPath, extension) : path.basename(options.resolvedPath)
    ];
    const normalisedBase =
        candidates
            .map((candidate) => normaliseDownloadBaseName(candidate))
            .find((candidate): candidate is string => Boolean(candidate)) || 'download';
    if (extension && normalisedBase.toLowerCase().endsWith(extension.toLowerCase())) {
        return normalisedBase;
    }
    return `${normalisedBase}${extension}`;
}

export function attachStreamErrorHandler(
    res: ServerResponse,
    stream: fs.ReadStream,
    context: Record<string, unknown>
): void {
    stream.on('error', () => {
        console.error('[history] Stream error', context);
        if (!res.headersSent) {
            res.writeHead(500);
        }
        res.end();
    });
}
