import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UrlWithParsedQuery } from 'node:url';
import { AuthManager } from '../../auth.js';

export function createAuthRoutes(authManager: AuthManager) {
    return async (req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery): Promise<boolean> => {
        const pathname = parsedUrl.pathname ?? '/';
        const method = req.method ?? 'GET';

        if (method === 'GET' && pathname === '/auth/login') {
            await authManager.handleLogin(req, res);
            return true;
        }

        if (method === 'GET' && pathname === '/auth/callback') {
            const currentUrl = new URL(req.url ?? '/auth/callback', 'http://localhost');
            await authManager.handleCallback(req, res, currentUrl);
            return true;
        }

        if (method === 'GET' && pathname === '/auth/logout') {
            authManager.handleLogout(res);
            return true;
        }

        return false;
    };
}
