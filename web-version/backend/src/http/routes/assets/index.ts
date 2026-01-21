import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UrlWithParsedQuery } from 'node:url';
import { serveAdsTxt, serveHistoryClient, serveHistoryCss } from '../../handlers/assets.js';

export function createAssetRoutes() {
    return (req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery): boolean => {
        if (req.method !== 'GET') {
            return false;
        }

        if (parsedUrl.pathname === '/ads.txt') {
            serveAdsTxt(res);
            return true;
        }

        if (parsedUrl.pathname === '/history/assets/history-page.css') {
            serveHistoryCss(res);
            return true;
        }

        if (parsedUrl.pathname === '/history/assets/history-client.js') {
            serveHistoryClient(res);
            return true;
        }

        return false;
    };
}
