import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

function ensureDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(currentDir, '..');
const projectRoot = path.resolve(distDir, '..');
const srcEntry = path.resolve(projectRoot, 'src/history-page/client/index.tsx');
const outFile = path.resolve(distDir, 'history-client.js');

ensureDir(outFile);

buildSync({
    entryPoints: [srcEntry],
    outfile: outFile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    sourcemap: false,
    minify: true
});
