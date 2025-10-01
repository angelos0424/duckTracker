import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildSync } from 'esbuild';

function ensureDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const distDir = path.resolve(__dirname, '..');
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
    minify: true,
    external: ['react', 'react-dom'],
    banner: {
        js: 'const React=window.React; const ReactDOM=window.ReactDOM;'
    }
});
