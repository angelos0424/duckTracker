import * as fs from 'node:fs';
import * as path from 'node:path';

let cachedHistoryCss: string | null = null;

function resolveCssPath(): string {
    const candidates = [
        path.resolve(__dirname, 'history-page.css'),
        path.resolve(__dirname, '../src/history-page.css'),
        path.resolve(process.cwd(), 'src/history-page.css')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error('history-page.css not found');
}

export function getHistoryPageCss(): string {
    if (cachedHistoryCss) {
        return cachedHistoryCss;
    }

    const cssPath = resolveCssPath();
    cachedHistoryCss = fs.readFileSync(cssPath, 'utf8');
    return cachedHistoryCss;
}
