import { useEffect, useRef } from 'react';
import type { HistoryItem, WebSocketMessage } from '../types';

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
                    if (data && data.item) {
                        updaterRef.current(data.item);
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
