import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';

export { WebSocketServer, WebSocket };

export function createWebSocketServer(): WebSocketServer {
    return new WebSocketServer({ noServer: true });
}

export function handleUpgrade(
    server: WebSocketServer,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    pathFilter?: string | readonly string[]
): WebSocket | null {
    if (request.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.destroy();
        return null;
    }

    const requestUrl = new URL(request.url ?? '', `http://${request.headers.host}`);
    const pathFilters = typeof pathFilter === 'string' ? [pathFilter] : pathFilter;
    if (pathFilters && !pathFilters.includes(requestUrl.pathname)) {
        socket.destroy();
        return null;
    }

    let accepted: WebSocket | null = null;
    server.handleUpgrade(request, socket, head, (ws) => {
        accepted = ws;
    });

    return accepted;
}
