import type { IncomingMessage, ServerResponse } from 'node:http';
import * as url from 'node:url';
import type { ServerConfig } from '../config.js';
import type { DownloadManager } from '../download-manager.js';
import { jsonResponse, sendOptionsResponse } from './responses.js';
import { createHistoryRoutes } from './routes/history/index.js';
import { createDownloadRoutes } from './routes/downloads.js';
import { createAssetRoutes } from './routes/assets/index.js';

export interface RouterDependencies {
    config: ServerConfig;
    downloadManager: DownloadManager;
}

export function createRequestHandler(deps: RouterDependencies) {
    const assetRoutes = createAssetRoutes();
    const historyRoutes = createHistoryRoutes(deps);
    const downloadRoutes = createDownloadRoutes(deps);

    return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const parsedUrl = url.parse(req.url || '/', true);
        const method = req.method ?? 'GET';

        if (method === 'OPTIONS') {
            sendOptionsResponse(res);
            return;
        }

        if (assetRoutes(req, res, parsedUrl)) {
            return;
        }

        if (await historyRoutes(req, res, parsedUrl)) {
            return;
        }

        if (await downloadRoutes(req, res, parsedUrl)) {
            return;
        }

        jsonResponse(res, 404, { error: 'Not found' });
    };
}
