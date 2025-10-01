import { useEffect, useRef } from 'react';
import type { HistoryItem, WebSocketMessage } from '../types';

function isHistoryItemCandidate(value: unknown): value is HistoryItem {
    return Boolean(
        value &&
            typeof value === 'object' &&
            Object.prototype.hasOwnProperty.call(value, 'urlId') &&
            typeof (value as { urlId?: unknown }).urlId === 'string'
    );
}

function extractHistoryItem(message: WebSocketMessage): HistoryItem | null {
    if (!message || typeof message !== 'object') {
        return null;
    }

    if (isHistoryItemCandidate(message.item)) {
        return message.item;
    }

    const payload = message.payload;
    if (isHistoryItemCandidate(payload)) {
        return payload;
    }

    if (
        payload &&
        typeof payload === 'object' &&
        Object.prototype.hasOwnProperty.call(payload, 'item') &&
        isHistoryItemCandidate((payload as { item?: unknown }).item)
    ) {
        return (payload as { item?: HistoryItem }).item ?? null;
    }

    return null;
}

export type ItemUpdater = (item: HistoryItem) => void;

export function useHistoryWebSocket(wsPath: string, onUpdate: ItemUpdater) {
    const updaterRef = useRef(onUpdate);
    updaterRef.current = onUpdate;

    useEffect(() => {
        if (!wsPath) {
            return;
        }
        let closed = false;
        let socket: WebSocket | null = null;

        function connect() {
            if (closed) {
                return;
            }
            const url = new URL(wsPath, window.location.origin);
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(url.toString());

            socket.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data as string) as WebSocketMessage;
                    const item = extractHistoryItem(data);
                    if (item) {
                        updaterRef.current(item);
                    }
                } catch (error) {
                    console.error('Failed to parse websocket message', error);
                }
            });

            socket.addEventListener('close', () => {
                socket = null;
                if (!closed) {
                    window.setTimeout(connect, 1000);
                }
            });
        }

        connect();

        return () => {
            closed = true;
            if (socket) {
                socket.close();
                socket = null;
            }
        };
    }, [wsPath]);
}
