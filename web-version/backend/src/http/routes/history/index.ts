import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UrlWithParsedQuery } from 'node:url';
import { createHistoryHandlers } from '../../handlers/history.js';
import type { ServerConfig } from '../../../config.js';
import type { DownloadManager } from '../../../download-manager.js';

interface HistoryRouteDeps {
    config: ServerConfig;
    downloadManager: DownloadManager;
}

export function createHistoryRoutes(deps: HistoryRouteDeps) {
    const handlers = createHistoryHandlers(deps);

    return async (req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery): Promise<boolean> => {
        const pathname = parsedUrl.pathname ?? '/';
        const method = req.method ?? 'GET';

        if (method === 'GET' && pathname === '/history') {
            handlers.handleHistoryPage(req, res, parsedUrl.query || {});
            return true;
        }

        if (method === 'POST' && pathname === '/history/request-download') {
            await handlers.handleHistoryDownloadRequest(req, res);
            return true;
        }

        if (method === 'POST' && pathname === '/save_history') {
            await handlers.handleSaveHistory(req, res);
            return true;
        }

        if (!pathname.startsWith('/history/')) {
            return false;
        }

        const segments = pathname.split('/').filter(Boolean);
        if (segments.length < 2) {
            return false;
        }

        const urlId = decodeURIComponent(segments[1]);

        if (method === 'DELETE') {
            if (segments.length === 3 && segments[2] === 'file') {
                await handlers.handleHistoryFileDelete(req, res, urlId);
                return true;
            }
            if (segments.length === 2) {
                await handlers.handleHistoryDelete(req, res, urlId);
                return true;
            }
        }

        if (method === 'GET') {
            if (segments.length === 3) {
                const action = segments[2];
                if (action === 'file') {
                    await handlers.handleHistoryFileDownload(req, res, urlId);
                    return true;
                }
                if (action === 'stream') {
                    await handlers.handleHistoryFileStream(req, res, urlId);
                    return true;
                }
            }
        }

        return false;
    };
}
