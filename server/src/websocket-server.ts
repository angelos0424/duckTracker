import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

interface SimpleWebSocketEvents {
    message: (message: string) => void;
    close: () => void;
    error: (error: Error) => void;
    open: () => void;
}

export class SimpleWebSocket extends EventEmitter<SimpleWebSocketEvents> {
    private readonly socket: Socket;

    private buffer: Buffer = Buffer.alloc(0);

    private alive = true;

    constructor(socket: Socket) {
        super();
        this.socket = socket;

        socket.on('data', (chunk) => this.handleData(chunk));
        socket.on('close', () => this.handleClose());
        socket.on('end', () => this.handleClose());
        socket.on('error', (error) => {
            if (error instanceof Error) {
                this.emit('error', error);
            } else {
                this.emit('error', new Error(String(error)));
            }
        });
    }

    private handleClose(): void {
        if (!this.alive) return;
        this.alive = false;
        this.emit('close');
    }

    send(data: string | Buffer): void {
        if (!this.alive) return;
        const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        const frame = this.createFrame(payload);
        this.socket.write(frame);
    }

    private createFrame(payload: Buffer): Buffer {
        const payloadLength = payload.length;
        let headerLength = 2;
        if (payloadLength >= 126 && payloadLength <= 0xffff) {
            headerLength += 2;
        } else if (payloadLength > 0xffff) {
            headerLength += 8;
        }

        const frame = Buffer.alloc(headerLength + payloadLength);
        frame[0] = 0x81; // FIN + text frame

        let offset = 2;
        if (payloadLength < 126) {
            frame[1] = payloadLength;
        } else if (payloadLength <= 0xffff) {
            frame[1] = 126;
            frame.writeUInt16BE(payloadLength, offset);
            offset += 2;
        } else {
            frame[1] = 127;
            frame.writeBigUInt64BE(BigInt(payloadLength), offset);
            offset += 8;
        }

        payload.copy(frame, offset);
        return frame;
    }

    private handleData(chunk: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 2) {
            const firstByte = this.buffer[0];
            const secondByte = this.buffer[1];

            const fin = (firstByte & 0x80) !== 0;
            const opcode = firstByte & 0x0f;
            const masked = (secondByte & 0x80) !== 0;
            let payloadLength = secondByte & 0x7f;
            let headerLength = 2;

            if (payloadLength === 126) {
                if (this.buffer.length < 4) return;
                payloadLength = this.buffer.readUInt16BE(2);
                headerLength = 4;
            } else if (payloadLength === 127) {
                if (this.buffer.length < 10) return;
                const lengthBig = this.buffer.readBigUInt64BE(2);
                if (lengthBig > BigInt(Number.MAX_SAFE_INTEGER)) {
                    this.close();
                    return;
                }
                payloadLength = Number(lengthBig);
                headerLength = 10;
            }

            const maskOffset = headerLength;
            const totalLength = headerLength + (masked ? 4 : 0) + payloadLength;
            if (this.buffer.length < totalLength) {
                return;
            }

            let payloadStart = headerLength;
            let payload = this.buffer.slice(payloadStart, payloadStart + payloadLength);

            if (masked) {
                const mask = this.buffer.slice(maskOffset, maskOffset + 4);
                payloadStart += 4;
                payload = this.buffer.slice(payloadStart, payloadStart + payloadLength);
                for (let i = 0; i < payload.length; i += 1) {
                    payload[i] ^= mask[i % 4];
                }
            }

            this.buffer = this.buffer.slice(totalLength);

            if (!fin) {
                // Fragmented frames are not supported
                continue;
            }

            if (opcode === 0x8) {
                this.close();
                return;
            }

            if (opcode === 0x9) {
                // ping
                this.sendPong(payload);
                continue;
            }

            if (opcode === 0xA) {
                continue;
            }

            if (opcode === 0x1) {
                try {
                    const message = payload.toString('utf8');
                    this.emit('message', message);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.emit('error', err);
                }
            }
        }
    }

    private sendPong(payload: Buffer): void {
        if (!this.alive) return;
        const frame = Buffer.alloc(2 + payload.length);
        frame[0] = 0x8a; // FIN + pong
        frame[1] = payload.length;
        if (payload.length > 0) {
            payload.copy(frame, 2);
        }
        this.socket.write(frame);
    }

    close(): void {
        if (!this.alive) return;
        this.alive = false;
        try {
            this.socket.end(Buffer.from([0x88, 0x00]));
        } catch (error) {
            this.socket.destroy();
        }
        this.emit('close');
    }
}

export function handleUpgrade(
    request: IncomingMessage,
    socket: Socket,
    _head: Buffer,
    clients: Set<SimpleWebSocket>,
    pathFilter?: string
): SimpleWebSocket | null {
    if (request.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.destroy();
        return null;
    }

    const requestUrl = new URL(request.url ?? '', `http://${request.headers.host}`);
    if (pathFilter && requestUrl.pathname !== pathFilter) {
        socket.destroy();
        return null;
    }

    const acceptKey = request.headers['sec-websocket-key'];
    if (!acceptKey) {
        socket.destroy();
        return null;
    }

    const hash = crypto.createHash('sha1').update(`${acceptKey}${GUID}`).digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${hash}`,
        '\r\n'
    ];

    socket.write(headers.join('\r\n'));

    const ws = new SimpleWebSocket(socket);
    clients.add(ws);
    ws.on('close', () => {
        clients.delete(ws);
    });

    ws.emit('open');
    return ws;
}
