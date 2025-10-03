import * as fs from 'node:fs';
import * as path from 'node:path';

let cachedHistoryCss: string | null = null;
let cachedHistoryClientScript: string | null = null;

const assetsDir = path.resolve(process.cwd(), 'dist/history/assets');

function readAsset(fileName: string): string {
    const assetPath = path.join(assetsDir, fileName);
    if (!fs.existsSync(assetPath)) {
        throw new Error(`History asset not found at ${assetPath}. Run "npm run build" to generate assets.`);
    }
    return fs.readFileSync(assetPath, 'utf8');
}

export function getHistoryPageCss(): string {
    if (cachedHistoryCss === null) {
        cachedHistoryCss = readAsset('history-page.css');
    }
    return cachedHistoryCss;
}

export function getHistoryClientScript(): string {
    if (cachedHistoryClientScript === null) {
        cachedHistoryClientScript = readAsset('history-client.js');
    }
    return cachedHistoryClientScript;
}
