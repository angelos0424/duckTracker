import type { ServerResponse } from 'node:http';
import { getAdsTxt, getHistoryClientScript, getHistoryPageCss } from '../../history-page-assets.js';

export function serveHistoryCss(res: ServerResponse): void {
    const css = getHistoryPageCss();
    res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
    });
    res.end(css);
}

export function serveHistoryClient(res: ServerResponse): void {
    const clientScript = getHistoryClientScript();
    res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=120'
    });
    res.end(clientScript);
}

export function serveAdsTxt(res: ServerResponse): void {
    const adsTxt = getAdsTxt();
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
    });
    res.end(adsTxt);
}
