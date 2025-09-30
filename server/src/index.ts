import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as url from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig, ServerConfig } from './config';
import { DownloadManager, DownloadSnapshot } from './download-manager';
import { createWebSocketServer, handleUpgrade, WebSocket } from './websocket-server';
import { getHistoryClientScript, getHistoryPageCss, getReactDomUmdScript, getReactUmdScript } from './history-page-assets';
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
} from './database';
import { renderHistoryPageToHtml } from './history-page';

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

downloadManager.on('state', (state) => {
    broadcast({ type: 'download', payload: state });
});

downloadManager.on('finished', (info) => {
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

        const scheduleResult = downloadManager.schedule({ url: targetUrl, urlId, title });
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

        const scheduleResult = downloadManager.schedule({ url: targetUrl, urlId: derivedId, title: '' });
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
            deleted.map(async ({ filePath, urlId: deletedId }) => {
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

        const record = getDownloadState(urlId);
        if (!record || !record.filePath) {
            console.warn('[history] File download missing record', { urlId });
            jsonResponse(res, 404, { error: 'File not available' });
            return;
        }

        let resolved = resolveWithinDownloadDir(record.filePath);
        if (!resolved) {
            console.warn('[history] File download outside directory', { urlId, filePath: record.filePath });
            jsonResponse(res, 403, { error: 'File outside of download directory' });
            return;
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
                    jsonResponse(res, 404, { error: 'File not found' });
                    return;
                }

                const normalisedFallback = resolveWithinDownloadDir(fallback);
                if (!normalisedFallback) {
                    console.warn('[history] File download fallback outside directory', { urlId, fallback });
                    jsonResponse(res, 403, { error: 'File outside of download directory' });
                    return;
                }

                try {
                    stats = await fs.promises.stat(normalisedFallback);
                    resolved = normalisedFallback;
                    recordDownloadFilePath({ urlId, filePath: resolved });
                } catch (fallbackError) {
                    const fallbackErr = fallbackError as NodeJS.ErrnoException;
                    console.error('[history] File download fallback stat failed', { urlId, error: fallbackErr.message });
                    jsonResponse(res, fallbackErr.code === 'ENOENT' ? 404 : 500, { error: 'File not found' });
                    return;
                }
            } else {
                console.error('[history] File stat failed', { urlId, error: err.message });
                jsonResponse(res, 500, { error: 'File not found' });
                return;
            }
        }

        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stats.size,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(resolved))}"`
        });

        const stream = fs.createReadStream(resolved);
        stream.on('error', () => {
            console.error('[history] File stream error', { urlId, filePath: resolved });
            if (!res.headersSent) {
                res.writeHead(500);
            }
            res.end();
        });
        stream.pipe(res);
    } catch (error) {
        const err = error as Error;
        jsonResponse(res, 500, { error: err.message });
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
        jsonResponse(res, 200, { urlId, filePath: '', status: record.status || 'unknown' });
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

        const scheduleResult = downloadManager.schedule({
            url: record.url,
            urlId,
            title: record.title || ''
        });

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

    let result: SearchDownloadsResult = searchDownloads({ searchTerm, page, pageSize });
    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

    if (page > totalPages && result.total > 0) {
        page = totalPages;
        result = searchDownloads({ searchTerm, page, pageSize });
    }

    const html = renderHistoryPageToHtml({
        items: result.items,
        total: result.total,
        page,
        pageSize: result.pageSize,
        searchTerm,
        wsPath: config.wsPath
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

    if (req.method === 'GET' && parsedUrl.pathname === '/history/assets/react.production.min.js') {
        const script = getReactUmdScript();
        res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=300'
        });
        res.end(script);
        return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/history/assets/react-dom.production.min.js') {
        const script = getReactDomUmdScript();
        res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=300'
        });
        res.end(script);
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
        if (segments.length === 3 && segments[2] === 'file') {
            void handleHistoryFileDownload(req, res, decodeURIComponent(segments[1]));
            return;
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

websocketServer.on('connection', (ws) => {
    websocketClients.add(ws);
    ws.on('close', () => {
        websocketClients.delete(ws);
    });
    ws.on('error', () => {
        websocketClients.delete(ws);
    });
    ws.on('message', (data) => {
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
