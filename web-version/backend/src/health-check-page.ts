import * as fs from 'node:fs';
import * as path from 'node:path';

let cachedHealthCheckHtml: string | null = null;

const healthCheckPath = path.resolve(process.cwd(), 'dist/index.html');

function readHealthCheckPage(): string {
    if (!fs.existsSync(healthCheckPath)) {
        throw new Error(`Health check HTML not found at ${healthCheckPath}. Run "npm run build" to generate assets.`);
    }
    return fs.readFileSync(healthCheckPath, 'utf8');
}

export function getHealthCheckHtml(): string {
    if (cachedHealthCheckHtml === null) {
        cachedHealthCheckHtml = readHealthCheckPage();
    }
    return cachedHealthCheckHtml;
}
