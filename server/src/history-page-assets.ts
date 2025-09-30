import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

let cachedHistoryCss: string | null = null;
let cachedReactScript: string | null = null;
let cachedReactDomScript: string | null = null;
let cachedHistoryClientScript: string | null = null;

const requireModule = createRequire(__filename);

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

function resolveHistoryClientScriptPath(): string {
    const candidates = [
        path.resolve(__dirname, 'history-client.js'),
        path.resolve(__dirname, '../src/history-client.js'),
        path.resolve(process.cwd(), 'src/history-client.js')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error('history-client.js not found');
}

function readUmdScript(moduleName: string, fileName: string): string {
    const packageJsonPath = requireModule.resolve(`${moduleName}/package.json`);
    const moduleDir = path.dirname(packageJsonPath);
    const scriptPath = path.join(moduleDir, 'umd', fileName);
    return fs.readFileSync(scriptPath, 'utf8');
}

export function getReactUmdScript(): string {
    if (!cachedReactScript) {
        cachedReactScript = readUmdScript('react', 'react.production.min.js');
    }
    return cachedReactScript;
}

export function getReactDomUmdScript(): string {
    if (!cachedReactDomScript) {
        cachedReactDomScript = readUmdScript('react-dom', 'react-dom.production.min.js');
    }
    return cachedReactDomScript;
}

export function getHistoryClientScript(): string {
    if (cachedHistoryClientScript) {
        return cachedHistoryClientScript;
    }

    const scriptPath = resolveHistoryClientScriptPath();
    cachedHistoryClientScript = fs.readFileSync(scriptPath, 'utf8');
    return cachedHistoryClientScript;
}
