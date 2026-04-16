import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UrlWithParsedQuery } from 'node:url';
import { AuthManager } from '../../auth.js';

function redirectToLoginError(res: ServerResponse, message: string): void {
    const search = new URLSearchParams({ auth_error: message });
    res.writeHead(302, { Location: `/?${search.toString()}` });
    res.end();
}

export function createAuthRoutes(authManager: AuthManager) {
    return async (req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery): Promise<boolean> => {
        const pathname = parsedUrl.pathname ?? '/';
        const method = req.method ?? 'GET';

        if (method === 'GET' && pathname === '/auth/login') {
            try {
                await authManager.handleLogin(req, res);
            } catch (errorValue) {
                const message = errorValue instanceof Error ? errorValue.message : 'Failed to start login.';
                redirectToLoginError(res, message);
            }
            return true;
        }

        if (method === 'GET' && pathname === '/auth/callback') {
            const currentUrl = new URL(req.url ?? '/auth/callback', 'http://localhost');
            try {
                await authManager.handleCallback(req, res, currentUrl);
            } catch (errorValue) {
                const message = errorValue instanceof Error ? errorValue.message : 'Failed to complete login.';
                redirectToLoginError(res, message);
            }
            return true;
        }

        if (method === 'GET' && pathname === '/auth/logout') {
            authManager.handleLogout(res);
            return true;
        }

        return false;
    };
}
