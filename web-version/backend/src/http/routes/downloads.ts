import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UrlWithParsedQuery } from 'node:url';
import { createDownloadHandlers } from '../handlers/downloads.js';
import { AuthManager } from '../../auth.js';
import type { ServerConfig } from '../../config.js';
import type { DownloadManager } from '../../download-manager.js';

interface DownloadRouteDeps {
    config: ServerConfig;
    downloadManager: DownloadManager;
    authManager: AuthManager;
}

export function createDownloadRoutes(deps: DownloadRouteDeps) {
    const handlers = createDownloadHandlers(deps);
    const { authManager } = deps;

    function ensureAuthenticated(req: IncomingMessage, res: ServerResponse): boolean {
        if (!authManager.isEnabled() || authManager.isAuthenticated(req)) {
            return true;
        }

        authManager.sendUnauthorized(res);
        return false;
    }

    return async (req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery): Promise<boolean> => {
        const pathname = parsedUrl.pathname ?? '/';
        const method = req.method ?? 'GET';

        if (method === 'GET' && pathname === '/downloads') {
            handlers.sendCurrentState(res);
            return true;
        }

        if (method === 'POST' && pathname === '/download') {
            await handlers.handleScheduleDownload(req, res);
            return true;
        }

        if (method === 'POST' && pathname === '/stop_download') {
            await handlers.handleStopDownload(req, res);
            return true;
        }

        if (method === 'POST' && pathname === '/history/stop-download') {
            if (!ensureAuthenticated(req, res)) {
                return true;
            }
            await handlers.handleStopDownload(req, res);
            return true;
        }

        if (method === 'POST' && pathname === '/restart_download') {
            await handlers.handleRestartDownload(req, res);
            return true;
        }

        if (method === 'POST' && pathname === '/history/restart-download') {
            if (!ensureAuthenticated(req, res)) {
                return true;
            }
            await handlers.handleRestartDownload(req, res);
            return true;
        }

        return false;
    };
}
