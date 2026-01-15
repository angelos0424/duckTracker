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

function copyAsset(relativeSource: string, destinationPath: string): void {
    const sourcePath = path.resolve(frontendSrcDir, relativeSource);
    const resolvedDestination = path.resolve(destinationPath);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing frontend asset at ${sourcePath}`);
    }

    ensureDirForPath(resolvedDestination);
    fs.copyFileSync(sourcePath, resolvedDestination);
}

copyAsset('history-page.css', path.join(assetsDir, 'history-page.css'));
