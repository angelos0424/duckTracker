import * as fs from 'node:fs';
import * as path from 'node:path';

function copyAsset(relativeSource: string, relativeDestination: string): void {
    const distDir = path.resolve(__dirname, '..');
    const sourcePath = path.resolve(distDir, '../src', relativeSource);
    const destinationPath = path.resolve(distDir, relativeDestination);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing history asset at ${sourcePath}`);
    }

    fs.copyFileSync(sourcePath, destinationPath);
}

copyAsset('history-client.js', 'history-client.js');
copyAsset('history-page.css', 'history-page.css');
