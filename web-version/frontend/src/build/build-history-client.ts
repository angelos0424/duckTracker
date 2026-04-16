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
const repoRoot = path.resolve(currentDir, '../../..');
const frontendDir = path.resolve(repoRoot, 'frontend');
const frontendSrcDir = path.resolve(frontendDir, 'src');
const tsconfigPath = path.resolve(frontendDir, 'tsconfig.json');
const outDir = path.resolve(repoRoot, 'dist/history/assets');
const srcEntry = path.resolve(frontendSrcDir, 'history-page/client/index.tsx');
const outFile = path.resolve(outDir, 'history-client.js');

ensureDir(outFile);

buildSync({
    entryPoints: [srcEntry],
    outfile: outFile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    sourcemap: false,
    minify: true,
    tsconfig: tsconfigPath
});
