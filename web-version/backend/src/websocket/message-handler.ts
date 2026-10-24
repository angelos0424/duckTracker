import { ensureUrlIds, collectServerOnlyUrlIds } from '../database.js';
import type { WebSocket } from '../websocket-server.js';

interface SyncHistoryPayload {
    type?: string;
    data?: {
        data?: unknown[];
    };
}

export function createWebSocketMessageHandler() {
    return (ws: WebSocket, rawMessage: string): void => {
        try {
            const parsed = JSON.parse(rawMessage) as SyncHistoryPayload;

            if (parsed.type === 'sync-history') {
                const incoming = Array.isArray(parsed.data?.data) ? parsed.data?.data : [];
                const ensured = ensureUrlIds(incoming);
                const serverOnly = collectServerOnlyUrlIds(ensured);

                ws.send(JSON.stringify({ type: 'sync-history', data: serverOnly }));
                return;
            }
        } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message payload' }));
        }
    };
}
