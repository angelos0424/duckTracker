import type { ServerResponse } from 'node:http';
import type { DownloadSnapshot } from '../download-manager.js';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

export type ResponsePayload =
    | JsonObject
    | JsonValue[]
    | DownloadSnapshot
    | DownloadSnapshot[]
    | { [key: string]: unknown };

export function jsonResponse(res: ServerResponse, statusCode: number, payload: ResponsePayload): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(body);
}

export function htmlResponse(res: ServerResponse, statusCode: number, body: string): void {
    res.writeHead(statusCode, {
        'Content-Type': 'text/html; charset=utf-8'
    });
    res.end(body);
}

export function sendOptionsResponse(res: ServerResponse): void {
    res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    });
    res.end();
}
