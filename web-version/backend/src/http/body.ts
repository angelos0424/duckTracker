import type { IncomingMessage } from 'node:http';
import type { JsonObject } from './responses.js';

const DEFAULT_BODY_LIMIT = 5 * 1024 * 1024;

export async function collectRequestBody(req: IncomingMessage, limit = DEFAULT_BODY_LIMIT): Promise<JsonObject> {
    return new Promise((resolve, reject) => {
        let rawData = '';
        req.on('data', (chunk: Buffer) => {
            rawData += chunk.toString();
            if (rawData.length > limit) {
                reject(new Error('Request body too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (!rawData) {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(rawData) as JsonObject;
                resolve(parsed);
            } catch (error) {
                reject(new Error('Invalid JSON payload'));
            }
        });
        req.on('error', reject);
    });
}
