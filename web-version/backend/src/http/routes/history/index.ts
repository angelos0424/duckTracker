import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UrlWithParsedQuery } from 'node:url';
import { AuthManager } from '../../../auth.js';
import { createHistoryHandlers } from '../../handlers/history.js';
import type { ServerConfig } from '../../../config.js';
import type { DownloadManager } from '../../../download-manager.js';
import { htmlResponse } from '../../responses.js';
import { renderLoginPageToHtml } from '../../../history-page.js';

interface HistoryRouteDeps {
    config: ServerConfig;
    downloadManager: DownloadManager;
    authManager: AuthManager;
}

export function createHistoryRoutes(deps: HistoryRouteDeps) {
    const handlers = createHistoryHandlers(deps);
    const { authManager } = deps;

    return async (req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery): Promise<boolean> => {
        const pathname = parsedUrl.pathname ?? '/';
        const method = req.method ?? 'GET';
        const isAuthenticated = authManager.isAuthenticated(req);

        if (method === 'GET' && pathname === '/') {
            if (authManager.isEnabled() && !isAuthenticated) {
                const authError = typeof parsedUrl.query?.auth_error === 'string'
                    ? parsedUrl.query.auth_error
                    : undefined;
                const html = renderLoginPageToHtml({
                    loginPath: '/auth/login',
                    errorMessage: authError
                });
                htmlResponse(res, 200, html);
                return true;
            }

            handlers.handleHistoryPage(req, res, parsedUrl.query || {}, authManager.getViewer(req));
            return true;
        }

        if (method === 'POST' && pathname === '/history/request-download') {
            if (authManager.isEnabled() && !isAuthenticated) {
                authManager.sendUnauthorized(res);
                return true;
            }
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
                if (authManager.isEnabled() && !isAuthenticated) {
                    authManager.sendUnauthorized(res);
                    return true;
                }
                await handlers.handleHistoryFileDelete(req, res, urlId);
                return true;
            }
            if (segments.length === 2) {
                if (authManager.isEnabled() && !isAuthenticated) {
                    authManager.sendUnauthorized(res);
                    return true;
                }
                await handlers.handleHistoryDelete(req, res, urlId);
                return true;
            }
        }

        if (method === 'GET') {
            if (segments.length === 3) {
                const action = segments[2];
                if (action === 'file') {
                    if (authManager.isEnabled() && !isAuthenticated) {
                        authManager.sendUnauthorized(res);
                        return true;
                    }
                    await handlers.handleHistoryFileDownload(req, res, urlId);
                    return true;
                }
                if (action === 'stream') {
                    if (authManager.isEnabled() && !isAuthenticated) {
                        authManager.sendUnauthorized(res);
                        return true;
                    }
                    await handlers.handleHistoryFileStream(req, res, urlId);
                    return true;
                }
            }
        }

        return false;
    };
}
