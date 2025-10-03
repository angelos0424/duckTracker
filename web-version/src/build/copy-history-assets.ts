import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

function ensureDirForPath(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyAsset(relativeSource: string, relativeDestination: string): void {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const distDir = path.resolve(currentDir, '..');
    const sourcePath = path.resolve(distDir, '../src', relativeSource);
    const destinationPath = path.resolve(distDir, relativeDestination);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing history asset at ${sourcePath}`);
    }

    ensureDirForPath(destinationPath);
    fs.copyFileSync(sourcePath, destinationPath);
}

copyAsset('history-page.css', 'history/assets/history-page.css');
