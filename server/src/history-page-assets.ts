import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let cachedHistoryCss: string | null = null;
let cachedHistoryClientScript: string | null = null;

const moduleUrl = import.meta.url;
const currentDir = path.dirname(fileURLToPath(moduleUrl));
const requireModule = createRequire(moduleUrl);

function resolveCssPath(): string {
    const candidates = [
        path.resolve(currentDir, 'history-page.css'),
        path.resolve(currentDir, '../src/history-page.css'),
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

function readHistoryClientFromDist(): string | null {
    const candidates = [
        path.resolve(currentDir, 'history-client.js'),
        path.resolve(currentDir, '../history-client.js'),
        path.resolve(process.cwd(), 'dist/history-client.js')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return fs.readFileSync(candidate, 'utf8');
        }
    }

    return null;
}

function resolveClientEntryPoint(): string {
    const candidates = [
        path.resolve(currentDir, 'history-page/client/index.tsx'),
        path.resolve(currentDir, '../src/history-page/client/index.tsx'),
        path.resolve(process.cwd(), 'src/history-page/client/index.tsx')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error('history client entry not found');
}

function buildHistoryClientScript(): string {
    try {
        const esbuild = requireModule('esbuild') as typeof import('esbuild');
        const entryPoint = resolveClientEntryPoint();
        const result = esbuild.buildSync({
            entryPoints: [entryPoint],
            bundle: true,
            format: 'iife',
            platform: 'browser',
            target: ['es2019'],
            write: false,
            sourcemap: false,
            minify: true
        });
        if (!result.outputFiles || result.outputFiles.length === 0) {
            throw new Error('History client build produced no output');
        }
        return result.outputFiles[0].text;
    } catch (error) {
        throw new Error(`Failed to build history client: ${(error as Error).message}`);
    }
}

export function getHistoryClientScript(): string {
    if (cachedHistoryClientScript) {
        return cachedHistoryClientScript;
    }

    const fromDist = readHistoryClientFromDist();
    if (fromDist !== null) {
        cachedHistoryClientScript = fromDist;
        return cachedHistoryClientScript;
    }

    cachedHistoryClientScript = buildHistoryClientScript();
    return cachedHistoryClientScript;
}
