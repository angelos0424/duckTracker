
import { BehaviorSubject } from 'rxjs';

export enum ConnectionStatus {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED,
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private messageQueue: string[] = [];
  public readonly connectionStatus$ = new BehaviorSubject<ConnectionStatus>(ConnectionStatus.CLOSED);

  constructor(private url: string) {
    this.connect();
  }

  private connect() {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      return;
    }

    this.connectionStatus$.next(ConnectionStatus.CONNECTING);
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.connectionStatus$.next(ConnectionStatus.OPEN);
      this.messageQueue.forEach(message => this.socket?.send(message));
      this.messageQueue = [];
    };

    this.socket.onmessage = (event) => {
      // This part will be handled by listeners
    };

    this.socket.onclose = () => {
      this.connectionStatus$.next(ConnectionStatus.CLOSED);
      this.socket = null;
      setTimeout(() => this.connect(), 5000); // Reconnect after 5 seconds
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.connectionStatus$.next(ConnectionStatus.CLOSED);
      this.socket?.close();
    };
  }

  public sendMessage(message: object) {
    const messageString = JSON.stringify(message);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(messageString);
    } else {
      this.messageQueue.push(messageString);
      if (this.socket?.readyState !== WebSocket.CONNECTING) {
        this.connect();
      }
    }
  }

  public addMessageListener(handler: (event: MessageEvent) => void) {
    if (this.socket) {
      this.socket.addEventListener('message', handler);
    }
  }

  public removeMessageListener(handler: (event: MessageEvent) => void) {
    if (this.socket) {
      this.socket.removeEventListener('message', handler);
    }
  }
}

export const webSocketService = new WebSocketService('ws://localhost:8080');
