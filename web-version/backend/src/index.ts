import * as http from 'node:http';
import { AuthManager } from './auth.js';
import { loadConfig, type ServerConfig } from './config.js';
import { DownloadManager } from './download-manager.js';
import { createWebSocketServer, handleUpgrade, WebSocket } from './websocket-server.js';
import { initDatabase } from './database.js';
import { createRequestHandler } from './http/router.js';
import { createWebSocketMessageHandler } from './websocket/message-handler.js';

const config: ServerConfig = loadConfig();
initDatabase(config.dbPath);

const downloadManager = new DownloadManager(config);
const authManager = new AuthManager(config.auth);
const requestHandler = createRequestHandler({ config, downloadManager });
const server = http.createServer(requestHandler);

const websocketServer = createWebSocketServer();
const websocketClients = new Set<WebSocket>();
const handleWebSocketMessage = createWebSocketMessageHandler();

function broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const client of websocketClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

downloadManager.on('state', (state) => {
    broadcast({ type: 'download', payload: state });
});

downloadManager.on('finished', (info) => {
    broadcast({ type: 'download-finished', payload: info });
});

websocketServer.on('connection', (ws: WebSocket) => {
    websocketClients.add(ws);
    ws.on('close', () => {
        websocketClients.delete(ws);
    });
    ws.on('error', () => {
        websocketClients.delete(ws);
    });
    ws.on('message', (data: WebSocket.RawData) => {
        const message = typeof data === 'string' ? data : data.toString();
        handleWebSocketMessage(ws, message);
    });
});

server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '', `http://${request.headers.host}`);
    const isHistorySocket = requestUrl.pathname === config.historyWsPath;
    if (isHistorySocket && authManager.isEnabled() && !authManager.isAuthenticated(request)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
    }

    const ws = handleUpgrade(websocketServer, request, socket, head, [config.wsPath, config.historyWsPath]);
    if (ws) {
        websocketServer.emit('connection', ws, request);
    }
});

server.listen(config.httpPort, () => {
    console.log(`[server] Listening on port ${config.httpPort}`);
    console.log(`[server] Download directory: ${config.downloadDir}`);
    console.log(`[server] Max concurrent downloads: ${config.maxConcurrent}`);
    console.log(`[server] Format: ${config.format}`);
    if (config.qualityLimit) {
        console.log(`[server] Quality limit: ${config.qualityLimit}p`);
    }
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    server.close(() => process.exit(0));
});
