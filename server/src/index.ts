import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as url from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig, ServerConfig } from './config.js';
import { DownloadManager, DownloadSnapshot } from './download-manager.js';
import { createWebSocketServer, handleUpgrade, WebSocket } from './websocket-server.js';
import { getHistoryClientScript, getHistoryPageCss } from './history-page-assets.js';
import {
    initDatabase,
    ensureUrlIds,
    collectServerOnlyUrlIds,
    searchDownloads,
    getDownloadState,
    recordDownloadFilePath,
    clearDownloadFilePath,
    deleteDownloads,
    type SearchDownloadsResult
} from './database.js';
import { renderHistoryPageToHtml } from './history-page.js';

const config: ServerConfig = loadConfig();
initDatabase(config.dbPath);
const downloadManager = new DownloadManager(config);
const websocketServer = createWebSocketServer();
const websocketClients = new Set<WebSocket>();

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

type ResponsePayload = JsonObject | JsonValue[] | DownloadSnapshot | DownloadSnapshot[] | { [key: string]: unknown };

function jsonResponse(res: ServerResponse, statusCode: number, payload: ResponsePayload): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(body);
}

function htmlResponse(res: ServerResponse, statusCode: number, body: string): void {
    res.writeHead(statusCode, {
        'Content-Type': 'text/html; charset=utf-8'
    });
    res.end(body);
}

function handleOptions(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    });
    res.end();
}

async function collectRequestBody(req: IncomingMessage): Promise<JsonObject> {
    return new Promise((resolve, reject) => {
        let rawData = '';
        req.on('data', (chunk: Buffer) => {
            rawData += chunk.toString();
            if (rawData.length > 5 * 1024 * 1024) {
                reject(new Error('Request body too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (!rawData) {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(rawData) as JsonObject;
                resolve(parsed);
            } catch (error) {
                reject(new Error('Invalid JSON payload'));
            }
        });
        req.on('error', reject);
    });
}

function broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const client of websocketClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

function isPathInside(baseDir: string, candidatePath: string): boolean {
    const relative = path.relative(baseDir, candidatePath);
    if (relative === '') {
        return true;
    }
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveWithinDownloadDir(filePath: string | null | undefined): string {
    if (!filePath) {
        return '';
    }

    const trimmed = filePath.trim();
    if (!trimmed) {
        return '';
    }

    const normalised = path.normalize(trimmed);
    const absolute = path.isAbsolute(normalised) ? normalised : path.resolve(config.downloadDir, normalised);

    if (!isPathInside(config.downloadDir, absolute)) {
        return '';
    }

    return absolute;
}

class HistoryFileError extends Error {
    public readonly statusCode: number;
    public readonly payload: { error: string };

    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.payload = { error: message };
        this.name = 'HistoryFileError';
    }
}

type DownloadRecord = NonNullable<ReturnType<typeof getDownloadState>>;

interface HistoryFileResolution {
    record: DownloadRecord;
    resolvedPath: string;
    stats: fs.Stats;
}

async function resolveHistoryFileOrThrow(urlId: string): Promise<HistoryFileResolution> {
    const record = getDownloadState(urlId);

    if (!record) {
        throw new HistoryFileError(404, '다운로드 정보를 찾을 수 없습니다.');
    }

    let resolved = resolveWithinDownloadDir(record.filePath);

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
            const fallback = downloadManager.findExistingFileById(urlId);
            if (!fallback) {
                console.warn('[history] File download fallback not found', { urlId });
                throw new HistoryFileError(404, 'File not found');
            }

            const normalisedFallback = resolveWithinDownloadDir(fallback);
            if (!normalisedFallback) {
                console.warn('[history] File download fallback outside directory', { urlId, fallback });
                throw new HistoryFileError(403, 'File outside of download directory');
            }

            try {
                stats = await fs.promises.stat(normalisedFallback);
                resolved = normalisedFallback;
                const relative = path.relative(config.downloadDir, resolved);
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

function getContentTypeForPath(filePath: string): string {
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

function handleWebSocketMessage(ws: WebSocket, rawMessage: string): void {
    try {
        const parsed = JSON.parse(rawMessage) as { type?: string; data?: { data?: unknown[] } };

        if (parsed.type === 'sync-history') {
            const incoming = Array.isArray(parsed.data?.data) ? parsed.data?.data : [];
            const ensured = ensureUrlIds(incoming);
            const serverOnly = collectServerOnlyUrlIds(ensured);

            ws.send(JSON.stringify({ type: 'sync-history', data: serverOnly }));
            return;
        }
    } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message payload' }));
    }
}

downloadManager.on('state', (state: DownloadSnapshot) => {
    broadcast({ type: 'download', payload: state });
});

downloadManager.on('finished', (info: DownloadSnapshot) => {
    broadcast({ type: 'download-finished', payload: info });
});

function sendCurrentState(res: ServerResponse): void {
    const list = downloadManager.getStateList();
    jsonResponse(res, 200, list);
}

async function handleDownload(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await collectRequestBody(_req);
        const targetUrl = body.url as string | undefined;
        const urlId = body.urlId as string | undefined;
        const title = (body.title as string | undefined) ?? '';
        // 외부에서 오는 요청.
        const skipFormatCheck = true
        const enforceFormatCheck = false;

        if (!targetUrl || !urlId) {
            jsonResponse(res, 400, { error: 'url and urlId are required' });
            return;
        }

        const existing = downloadManager.getState(urlId);
        if (existing && (existing.status === 'downloading' || existing.status === 'queued')) {
            jsonResponse(res, 200, existing);
            return;
        }

        console.info('[history] Received download schedule request', { urlId, targetUrl, title });

        const formatId = typeof body.formatId === 'string' ? body.formatId : undefined;

        const scheduleResult = await downloadManager.schedule({
            url: targetUrl,
            urlId,
            title,
            formatId,
            skipFormatCheck
        });

        if (enforceFormatCheck && scheduleResult.requiresFormatSelection) {
            const selectionState =
                downloadManager.getState(urlId) || ({
                    url: targetUrl,
                    urlId,
                    title: scheduleResult.title || title || '',
                    status: 'format-select',
                    percent: 0,
                    formatOptions: scheduleResult.formatOptions || []
                } as DownloadSnapshot);

            jsonResponse(res, 200, {
                ...selectionState,
                requiresFormatSelection: true,
                queued: false
            });
            console.info('[history] Format selection required', {
                urlId,
                formatCount: scheduleResult.formatOptions?.length ?? 0
            });
            return;
        }

        const updatedState = downloadManager.getState(urlId);
        jsonResponse(res, 200, {
            ...(updatedState ?? {}),
            queued: scheduleResult.queued
        });
        console.info('[history] Download scheduled', { urlId, queued: scheduleResult.queued });
    } catch (error) {
        const err = error as Error;
        console.error('[history] handleDownload failed', { error: err.message, stack: err.stack });
        jsonResponse(res, 500, { error: err.message });
    }
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

        console.info('[history] Download request received', { urlId: derivedId, targetUrl });

        const existing = downloadManager.getState(derivedId);
        if (existing && (existing.status === 'downloading' || existing.status === 'queued')) {
            jsonResponse(res, 200, existing);
            console.info('[history] Download already active', { urlId: derivedId, status: existing.status });
            return;
        }

        const formatId = typeof body.formatId === 'string' ? body.formatId : undefined;

        const scheduleResult = await downloadManager.schedule({
            url: targetUrl,
            urlId: derivedId,
            title: '',
            formatId,
            skipFormatCheck
        });

        if (enforceFormatCheck && scheduleResult.requiresFormatSelection) {
            const selectionState =
                downloadManager.getState(derivedId) || ({
                    url: targetUrl,
                    urlId: derivedId,
                    title: scheduleResult.title ?? '',
                    status: 'format-select',
                    percent: 0,
                    formatOptions: scheduleResult.formatOptions || []
                } as DownloadSnapshot);

            const options = scheduleResult.formatOptions ?? selectionState.formatOptions ?? [];
            const responsePayload = {
                requiresFormatSelection: true,
                queued: false,
                item: selectionState,
                options,
                title: selectionState.title,
                url: targetUrl,
                formatOptions: selectionState.formatOptions ?? options
            };

            jsonResponse(res, 200, responsePayload);
            console.info('[history] Format selection required', {
                urlId: derivedId,
                formatCount: scheduleResult.formatOptions?.length ?? 0
            });
            return;
        }

        const updatedState =
            downloadManager.getState(derivedId) || ({
                url: targetUrl,
                urlId: derivedId,
                status: scheduleResult.queued ? 'queued' : 'downloading',
                percent: 0
            } as DownloadSnapshot);
        jsonResponse(res, 200, {
            ...updatedState,
            queued: scheduleResult.queued
        });
        console.info('[history] Download scheduled', { urlId: derivedId, queued: scheduleResult.queued });
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
            deleted.map(async ({ filePath, urlId: deletedId }): Promise<{ urlId: string; fileRemoved: boolean; reason?: string }> => {
                if (!filePath) {
                    return { urlId: deletedId, fileRemoved: false };
                }

                console.log('delete file', filePath);
                console.log('delete urlId', deletedId);
                const resolved = resolveWithinDownloadDir(filePath);
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

async function handleHistoryFileDownload(_req: IncomingMessage, res: ServerResponse, urlId: string | undefined): Promise<void> {
    try {
        if (!urlId) {
            console.warn('[history] File download without urlId');
            jsonResponse(res, 400, { error: 'urlId is required' });
            return;
        }

        const { resolvedPath, stats } = await resolveHistoryFileOrThrow(urlId);
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

function writeStreamError(res: ServerResponse, stream: fs.ReadStream, context: Record<string, unknown>): void {
    stream.on('error', () => {
        console.error('[history] Stream error', context);
        if (!res.headersSent) {
            res.writeHead(500);
        }
        res.end();
    });
}

async function handleHistoryFileStream(req: IncomingMessage, res: ServerResponse, urlId: string | undefined): Promise<void> {
    try {
        if (!urlId) {
            jsonResponse(res, 400, { error: 'urlId is required' });
            return;
        }

        const { resolvedPath, stats } = await resolveHistoryFileOrThrow(urlId);
        const totalSize = Math.max(0, stats.size);
        const contentType = getContentTypeForPath(resolvedPath);

        if (totalSize === 0) {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': 0,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store'
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
                'Cache-Control': 'no-store'
            });

            const stream = fs.createReadStream(resolvedPath, { start: safeStart, end: safeEnd });
            writeStreamError(res, stream, { urlId, filePath: resolvedPath, start: safeStart, end: safeEnd });
            stream.pipe(res);
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': totalSize,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store'
        });
        const stream = fs.createReadStream(resolvedPath);
        writeStreamError(res, stream, { urlId, filePath: resolvedPath });
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

async function handleHistoryFileDelete(_req: IncomingMessage, res: ServerResponse, urlId: string | undefined): Promise<void> {
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

        const resolved = resolveWithinDownloadDir(filePath);
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

async function handleStop(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await collectRequestBody(req);
        const urlId = body.urlId as string | undefined;
        if (!urlId) {
            jsonResponse(res, 400, { error: 'urlId is required' });
            return;
        }

        const success = downloadManager.stop(urlId);
        if (!success) {
            jsonResponse(res, 404, { error: 'Download not found' });
            return;
        }

        const state = downloadManager.getState(urlId);
        jsonResponse(res, 200, state || { status: 'stop', urlId });
    } catch (error) {
        const err = error as Error;
        jsonResponse(res, 500, { error: err.message });
    }
}

async function handleRestart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await collectRequestBody(req);
        const urlId = body.urlId as string | undefined;
        if (!urlId) {
            jsonResponse(res, 400, { error: 'urlId is required' });
            return;
        }

        const currentState = downloadManager.getState(urlId);
        if (currentState && (currentState.status === 'downloading' || currentState.status === 'queued')) {
            jsonResponse(res, 200, currentState);
            return;
        }

        const record = getDownloadState(urlId);
        if (!record || !record.url) {
            jsonResponse(res, 404, { error: '다운로드 정보를 찾을 수 없습니다.' });
            return;
        }

        const scheduleResult = await downloadManager.schedule({
            url: record.url,
            urlId,
            title: record.title || ''
        });

        if (config.checkFormatList && scheduleResult.requiresFormatSelection) {
            const selectionState =
                downloadManager.getState(urlId) || ({
                    url: record.url,
                    urlId,
                    title: scheduleResult.title ?? record.title ?? '',
                    status: 'format-select',
                    percent: 0,
                    formatOptions: scheduleResult.formatOptions || []
                } as DownloadSnapshot);

            const options = scheduleResult.formatOptions ?? selectionState.formatOptions ?? [];
            jsonResponse(res, 200, {
                requiresFormatSelection: true,
                queued: false,
                item: selectionState,
                options,
                title: selectionState.title,
                url: record.url,
                formatOptions: selectionState.formatOptions ?? options
            });
            return;
        }

        const updatedState =
            downloadManager.getState(urlId) || ({
                url: record.url,
                urlId,
                title: record.title || '',
                status: scheduleResult.queued ? 'queued' : 'downloading',
                percent: 0
            } as DownloadSnapshot);

        jsonResponse(res, 200, { ...updatedState, queued: scheduleResult.queued });
    } catch (error) {
        const err = error as Error;
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

function parseInteger(value: unknown, fallback: number): number {
    const candidate = Array.isArray(value) ? value[0] : value;
    const numeric = typeof candidate === 'string' ? Number.parseInt(candidate, 10) : Number.NaN;
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    return fallback;
}

type HistoryQuery = Record<string, string | string[] | undefined>;

function handleHistory(_req: IncomingMessage, res: ServerResponse, query: HistoryQuery): void {
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

            const hasSize = typeof item.fileSizeBytes === 'number' && Number.isFinite(item.fileSizeBytes) && item.fileSizeBytes >= 0;
            if (hasSize) {
                return item;
            }

            const resolved = resolveWithinDownloadDir(item.filePath);
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

    let result: SearchDownloadsResult = searchDownloads({ searchTerm, page, pageSize });
    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

    if (page > totalPages && result.total > 0) {
        page = totalPages;
        result = searchDownloads({ searchTerm, page, pageSize });
    }

    const itemsWithSize = attachFileSizes(result.items);

    console.log('config.checkFormatList', config.checkFormatList);
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

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || '/', true);
    if (req.method === 'OPTIONS') {
        handleOptions(req, res);
        return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/history/assets/history-page.css') {
        const css = getHistoryPageCss();
        res.writeHead(200, {
            'Content-Type': 'text/css; charset=utf-8',
            'Cache-Control': 'public, max-age=300'
        });
        res.end(css);
        return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/history/assets/history-client.js') {
        const clientScript = getHistoryClientScript();
        res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=120'
        });
        res.end(clientScript);
        return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/history') {
        handleHistory(req, res, parsedUrl.query || {});
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/history/request-download') {
        void handleHistoryDownloadRequest(req, res);
        return;
    }

    if (req.method === 'DELETE' && parsedUrl.pathname && parsedUrl.pathname.startsWith('/history/')) {
        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        if (segments.length === 3 && segments[2] === 'file') {
            void handleHistoryFileDelete(req, res, decodeURIComponent(segments[1]));
            return;
        }
        if (segments.length === 2) {
            void handleHistoryDelete(req, res, decodeURIComponent(segments[1]));
            return;
        }
    }

    if (req.method === 'GET' && parsedUrl.pathname && parsedUrl.pathname.startsWith('/history/')) {
        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        if (segments.length === 3) {
            const action = segments[2];
            const urlId = decodeURIComponent(segments[1]);
            if (action === 'file') {
                void handleHistoryFileDownload(req, res, urlId);
                return;
            }
            if (action === 'stream') {
                void handleHistoryFileStream(req, res, urlId);
                return;
            }
        }
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/downloads') {
        sendCurrentState(res);
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/download') {
        void handleDownload(req, res);
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/stop_download') {
        void handleStop(req, res);
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/restart_download') {
        void handleRestart(req, res);
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/save_history') {
        void handleSaveHistory(req, res);
        return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
});

websocketServer.on('connection', (ws: WebSocket) => {
    websocketClients.add(ws);
    ws.on('close', () => {
        websocketClients.delete(ws);
    });
    ws.on('error', () => {
        websocketClients.delete(ws);
    });
    ws.on('message', (data: WebSocket.RawData) => {
        const message = typeof data === 'string' ? data : data.toString();
        handleWebSocketMessage(ws, message);
    });
});

server.on('upgrade', (request, socket, head) => {
    const ws = handleUpgrade(websocketServer, request, socket, head, config.wsPath);
    if (ws) {
        websocketServer.emit('connection', ws, request);
    }
});

server.listen(config.httpPort, () => {
    console.log(`[server] Listening on port ${config.httpPort}`);
    console.log(`[server] Download directory: ${config.downloadDir}`);
    console.log(`[server] Max concurrent downloads: ${config.maxConcurrent}`);
    console.log(`[server] Format: ${config.format}`);
    if (config.qualityLimit) {
        console.log(`[server] Quality limit: ${config.qualityLimit}p`);
    }
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    server.close(() => process.exit(0));
});
