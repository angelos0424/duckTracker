import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

function ensureDirForPath(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../..');
const frontendSrcDir = path.resolve(repoRoot, 'frontend/src');
const assetsDir = path.resolve(repoRoot, 'dist/history/assets');

function copyAsset(relativeSource: string, fileName: string): void {
    const sourcePath = path.resolve(frontendSrcDir, relativeSource);
    const destinationPath = path.resolve(assetsDir, fileName);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing history asset at ${sourcePath}`);
    }

    ensureDirForPath(destinationPath);
    fs.copyFileSync(sourcePath, destinationPath);
}

copyAsset('history-page.css', 'history-page.css');
