import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectRequestBody } from '../body.js';
import { htmlResponse, jsonResponse } from '../responses.js';
import type { ServerConfig } from '../../config.js';
import type { DownloadManager, DownloadSnapshot } from '../../download-manager.js';
import {
    searchDownloads,
    getDownloadState,
    deleteDownloads,
    clearDownloadFilePath,
    type SearchDownloadsResult
} from '../../database.js';
import { renderHistoryPageToHtml } from '../../history-page.js';
import {
    HistoryFileError,
    attachStreamErrorHandler,
    deriveDownloadFileName,
    formatContentDisposition,
    getContentTypeForPath,
    resolveHistoryFileOrThrow,
    resolveWithinDownloadDir
} from '../../history/files.js';

interface HistoryHandlerDeps {
    config: ServerConfig;
    downloadManager: DownloadManager;
}

function isValidUrl(candidate: string): boolean {
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function deriveUrlIdFromUrl(targetUrl: string): string | null {
    try {
        const parsed = new URL(targetUrl);
        if (parsed.searchParams.has('list')) {
            return parsed.searchParams.get('list');
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

        const youtuMatch = pathname.match(/\/([a-zA-Z0-9_-]{11})$/u);
        if (parsed.hostname === 'youtu.be' && youtuMatch && youtuMatch[1]) {
            return youtuMatch[1];
        }

        return parsed.href;
    } catch (error) {
        return null;
    }
}

function parseInteger(value: unknown, fallback: number): number {
    const candidate = Array.isArray(value) ? value[0] : value;
    const numeric = typeof candidate === 'string' ? Number.parseInt(candidate, 10) : Number.NaN;
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    return fallback;
}

type HistoryQuery = Record<string, string | string[] | undefined>;

export function createHistoryHandlers({ config, downloadManager }: HistoryHandlerDeps) {
    const fileContext = { config, downloadManager } as const;

    function handleHistoryPage(_req: IncomingMessage, res: ServerResponse, query: HistoryQuery): void {
        const searchTerm = typeof query.search === 'string' ? query.search.trim() : '';
        let page = parseInteger(query.page, 1);
        let pageSize = parseInteger(query.pageSize, 20);
        pageSize = Math.min(pageSize, 100);

        type SearchDownloadItem = SearchDownloadsResult['items'][number];

        const attachFileSizes = (items: SearchDownloadsResult['items']): SearchDownloadsResult['items'] =>
            items.map((item: SearchDownloadItem) => {
                if (!item.filePath) {
                    return item;
                }

                const hasSize =
                    typeof item.fileSizeBytes === 'number' &&
                    Number.isFinite(item.fileSizeBytes) &&
                    item.fileSizeBytes >= 0;
                if (hasSize) {
                    return item;
                }

                const resolved = resolveWithinDownloadDir(fileContext, item.filePath);
                if (!resolved) {
                    return item;
                }

                try {
                    const stats = fs.statSync(resolved);
                    if (typeof stats.isFile === 'function' && !stats.isFile()) {
                        return item;
                    }
                    return { ...item, fileSizeBytes: stats.size };
                } catch (error) {
                    return item;
                }
            });

        let result = searchDownloads({ searchTerm, page, pageSize });
        const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

        if (page > totalPages && result.total > 0) {
            page = totalPages;
            result = searchDownloads({ searchTerm, page, pageSize });
        }

        const itemsWithSize = attachFileSizes(result.items);

        const html = renderHistoryPageToHtml({
            items: itemsWithSize,
            total: result.total,
            page,
            pageSize: result.pageSize,
            searchTerm,
            wsPath: config.wsPath,
            checkFormatList: config.checkFormatList
        });

        htmlResponse(res, 200, html);
    }

    async function handleHistoryDownloadRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = await collectRequestBody(req);
            const targetUrl = body.url;
            const skipFormatCheck =
                body?.skipFormatCheck === true ||
                (config.checkFormatList && body?.enforceFormatCheck === false);
            const enforceFormatCheck = config.checkFormatList && !skipFormatCheck;

            if (typeof targetUrl !== 'string' || !isValidUrl(targetUrl)) {
                console.warn('[history] Invalid download request url', { targetUrl });
                jsonResponse(res, 400, { error: 'A valid URL is required.' });
                return;
            }

            const derivedId = deriveUrlIdFromUrl(targetUrl);
            if (!derivedId) {
                console.warn('[history] Unable to derive urlId', { targetUrl });
                jsonResponse(res, 400, { error: 'Could not determine URL identifier.' });
                return;
            }

            const existing = downloadManager.getState(derivedId);
            if (existing) {
                const requiresFormatSelection = existing.status === 'format-select';
                if (existing.status === 'queued' || existing.status === 'downloading') {
                    jsonResponse(res, 200, {
                        ...existing,
                        queued: existing.status === 'queued',
                        requiresFormatSelection
                    });
                    return;
                }
            }

            const formatId = typeof body?.formatId === 'string' ? body.formatId : undefined;
            const scheduleResult = await downloadManager.schedule({
                url: targetUrl,
                urlId: derivedId,
                title: typeof body.title === 'string' ? body.title : undefined,
                formatId,
                skipFormatCheck
            });

            if (enforceFormatCheck && scheduleResult.requiresFormatSelection) {
                const selectionState =
                    downloadManager.getState(derivedId) || ({
                        url: targetUrl,
                        urlId: derivedId,
                        title: scheduleResult.title || '',
                        status: 'format-select',
                        percent: 0,
                        formatOptions: scheduleResult.formatOptions || []
                    } as DownloadSnapshot);

                jsonResponse(res, 200, {
                    requiresFormatSelection: true,
                    queued: false,
                    item: selectionState,
                    options: scheduleResult.formatOptions || [],
                    title: selectionState.title,
                    url: selectionState.url,
                    formatOptions: selectionState.formatOptions ?? []
                });
                return;
            }

            const updatedState = downloadManager.getState(derivedId);
            jsonResponse(res, 200, {
                ...(updatedState ?? {}),
                queued: scheduleResult.queued
            });
        } catch (error) {
            const err = error as Error;
            console.error('[history] handleHistoryDownloadRequest failed', { error: err.message, stack: err.stack });
            jsonResponse(res, 500, { error: err.message });
        }
    }

    async function handleHistoryDelete(_req: IncomingMessage, res: ServerResponse, urlId: string | undefined): Promise<void> {
        try {
            if (!urlId) {
                jsonResponse(res, 400, { error: 'urlId is required' });
                return;
            }

            const existingState = downloadManager.getState(urlId);
            if (existingState && (existingState.status === 'downloading' || existingState.status === 'queued')) {
                downloadManager.stop(urlId);
            }

            const deleted = deleteDownloads([urlId]);
            if (!deleted || deleted.length === 0) {
                console.warn('[history] Delete requested for missing urlId', { urlId });
                jsonResponse(res, 404, { error: 'Record not found' });
                return;
            }

            const results = await Promise.all(
                deleted.map(async ({ filePath, urlId: deletedId }): Promise<{
                    urlId: string;
                    fileRemoved: boolean;
                    reason?: string;
                }> => {
                    if (!filePath) {
                        return { urlId: deletedId, fileRemoved: false };
                    }

                    const resolved = resolveWithinDownloadDir(fileContext, filePath);
                    if (!resolved) {
                        return { urlId: deletedId, fileRemoved: false, reason: 'outside-download-dir' };
                    }

                    try {
                        await fs.promises.unlink(resolved);
                        return { urlId: deletedId, fileRemoved: true };
                    } catch (error) {
                        const err = error as NodeJS.ErrnoException;
                        if (err && err.code === 'ENOENT') {
                            return { urlId: deletedId, fileRemoved: false, reason: 'not-found' };
                        }
                        return { urlId: deletedId, fileRemoved: false, reason: 'unlink-failed' };
                    }
                })
            );

            jsonResponse(res, 200, { success: true, results });
            console.info('[history] Record and file delete completed', { urlId, results });
        } catch (error) {
            const err = error as Error;
            console.error('[history] handleHistoryDelete failed', { urlId, error: err.message, stack: err.stack });
            jsonResponse(res, 500, { error: err.message });
        }
    }

    async function handleHistoryFileDownload(
        _req: IncomingMessage,
        res: ServerResponse,
        urlId: string | undefined
    ): Promise<void> {
        try {
            if (!urlId) {
                console.warn('[history] File download without urlId');
                jsonResponse(res, 400, { error: 'urlId is required' });
                return;
            }

            const { resolvedPath, stats } = await resolveHistoryFileOrThrow(fileContext, urlId);
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': stats.size,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(resolvedPath))}"`
            });

            const stream = fs.createReadStream(resolvedPath);
            stream.on('error', () => {
                console.error('[history] File stream error', { urlId, filePath: resolvedPath });
                if (!res.headersSent) {
                    res.writeHead(500);
                }
                res.end();
            });
            stream.pipe(res);
        } catch (error) {
            if (error instanceof HistoryFileError) {
                jsonResponse(res, error.statusCode, error.payload);
                return;
            }
            const err = error as Error;
            console.error('[history] handleHistoryFileDownload failed', { urlId, error: err.message });
            jsonResponse(res, 500, { error: err.message });
        }
    }

    async function handleHistoryFileStream(
        req: IncomingMessage,
        res: ServerResponse,
        urlId: string | undefined
    ): Promise<void> {
        try {
            if (!urlId) {
                jsonResponse(res, 400, { error: 'urlId is required' });
                return;
            }

            const requestUrl = (() => {
                try {
                    const href = req.url || '';
                    return new URL(href, 'http://localhost');
                } catch (error) {
                    return null;
                }
            })();
            const requestedBaseName = requestUrl?.searchParams.get('downloadName');

            const { resolvedPath, stats, record } = await resolveHistoryFileOrThrow(fileContext, urlId);
            const totalSize = Math.max(0, stats.size);
            const contentType = getContentTypeForPath(resolvedPath);
            const downloadFileName = deriveDownloadFileName({
                requestedBaseName,
                recordTitle: record.title || undefined,
                resolvedPath
            });
            const contentDisposition = formatContentDisposition(downloadFileName);

            if (totalSize === 0) {
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Length': 0,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-store',
                    'Content-Disposition': contentDisposition
                });
                res.end();
                return;
            }

            const rangeHeader = req.headers.range;
            if (rangeHeader) {
                const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
                if (!match) {
                    res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                    res.end();
                    return;
                }

                let start: number;
                let end: number;
                const startRaw = match[1];
                const endRaw = match[2];

                if (startRaw === '' && endRaw !== '') {
                    const suffixLength = Number.parseInt(endRaw, 10);
                    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
                        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                        res.end();
                        return;
                    }
                    end = totalSize - 1;
                    start = Math.max(0, totalSize - suffixLength);
                } else {
                    start = startRaw ? Number.parseInt(startRaw, 10) : 0;
                    end = endRaw ? Number.parseInt(endRaw, 10) : totalSize - 1;
                    if (!Number.isFinite(start) || !Number.isFinite(end)) {
                        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                        res.end();
                        return;
                    }
                }

                if (start < 0 || end < 0 || start > end || start >= totalSize) {
                    res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                    res.end();
                    return;
                }

                const safeEnd = Math.min(end, totalSize - 1);
                const safeStart = Math.min(start, safeEnd);
                const chunkSize = safeEnd - safeStart + 1;

                res.writeHead(206, {
                    'Content-Type': contentType,
                    'Content-Length': chunkSize,
                    'Content-Range': `bytes ${safeStart}-${safeEnd}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-store',
                    'Content-Disposition': contentDisposition
                });

                const stream = fs.createReadStream(resolvedPath, { start: safeStart, end: safeEnd });
                attachStreamErrorHandler(res, stream, { urlId, filePath: resolvedPath, start: safeStart, end: safeEnd });
                stream.pipe(res);
                return;
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': totalSize,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
                'Content-Disposition': contentDisposition
            });
            const stream = fs.createReadStream(resolvedPath);
            attachStreamErrorHandler(res, stream, { urlId, filePath: resolvedPath });
            stream.pipe(res);
        } catch (error) {
            if (error instanceof HistoryFileError) {
                jsonResponse(res, error.statusCode, error.payload);
                return;
            }
            const err = error as Error;
            console.error('[history] handleHistoryFileStream failed', { urlId, error: err.message });
            jsonResponse(res, 500, { error: err.message || '재생을 시작할 수 없습니다.' });
        }
    }

    async function handleHistoryFileDelete(
        _req: IncomingMessage,
        res: ServerResponse,
        urlId: string | undefined
    ): Promise<void> {
        try {
            if (!urlId) {
                jsonResponse(res, 400, { error: 'urlId is required' });
                return;
            }

            const record = getDownloadState(urlId);

            if (!record) {
                jsonResponse(res, 404, { error: '다운로드 정보를 찾을 수 없습니다.' });
                return;
            }

            const filePath = record.filePath;
            if (!filePath) {
                jsonResponse(res, 404, { error: '삭제할 파일이 없습니다.' });
                return;
            }

            const resolved = resolveWithinDownloadDir(fileContext, filePath);
            if (!resolved) {
                jsonResponse(res, 403, { error: '다운로드 폴더 밖의 파일입니다.' });
                return;
            }

            try {
                await fs.promises.unlink(resolved);
                console.info('[history] File removed', { urlId, filePath: resolved });
            } catch (error) {
                const err = error as NodeJS.ErrnoException;
                if (err.code !== 'ENOENT') {
                    console.error('[history] File removal failed', { urlId, filePath: resolved, error: err.message });
                    jsonResponse(res, 500, { error: '파일 삭제에 실패했습니다.' });
                    return;
                } else {
                    console.error('[history] File not found', { urlId, filePath: resolved, error: err.message });
                }
            }

            clearDownloadFilePath(urlId);
            jsonResponse(res, 200, { urlId, filePath: '', fileSizeBytes: null, status: record.status || 'unknown' });
            console.info('[history] Cleared filePath metadata', { urlId });
        } catch (error) {
            const err = error as Error;
            console.error('[history] handleHistoryFileDelete failed', { urlId, error: err.message, stack: err.stack });
            jsonResponse(res, 500, { error: err.message });
        }
    }

    async function handleSaveHistory(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            await collectRequestBody(req);
            jsonResponse(res, 200, { success: true });
        } catch (error) {
            const err = error as Error;
            jsonResponse(res, 500, { error: err.message });
        }
    }

    return {
        handleHistoryPage,
        handleHistoryDownloadRequest,
        handleHistoryDelete,
        handleHistoryFileDownload,
        handleHistoryFileStream,
        handleHistoryFileDelete,
        handleSaveHistory
    };
}
