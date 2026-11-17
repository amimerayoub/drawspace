import type { Socket } from 'socket.io-client';
import { ApiError } from './apiClient';
import { backendAuthService } from './backendAuth.service';

const serverUrl = import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:3001';

class SocketClient {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const { io } = await import('socket.io-client');
      await new Promise<void>((resolve, reject) => {
        const socket = io(serverUrl, {
          autoConnect: false,
          transports: ['websocket', 'polling'],
          timeout: 10_000,
          reconnection: true,
          auth: async (callback) => {
            const jwt = await backendAuthService.getAuthJWT();
            callback({ jwt });
          },
        });
        this.socket = socket;
        const timeout = setTimeout(() => { socket.disconnect(); reject(new ApiError('Could not connect to the game server.', 0, 'SOCKET_TIMEOUT')); }, 12_000);
        socket.once('connect', () => { clearTimeout(timeout); resolve(); });
        socket.once('connect_error', (error) => { clearTimeout(timeout); reject(new ApiError(error.message || 'Game server connection failed.', 0, 'SOCKET_CONNECTION_FAILED')); });
        socket.connect();
      });
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async request<T>(event: string, payload: unknown): Promise<T> {
    await this.connect();
    const socket = this.socket;
    if (!socket?.connected) throw new ApiError('Game server is disconnected.', 0, 'SOCKET_DISCONNECTED');
    return new Promise<T>((resolve, reject) => {
      socket.timeout(10_000).emit(event, payload, (timeoutError: Error | null, response: { success?: boolean; data?: T; error?: string; code?: string }) => {
        if (timeoutError) { reject(new ApiError('The game server did not respond in time.', 0, 'SOCKET_TIMEOUT')); return; }
        if (!response?.success) { reject(new ApiError(response?.error || 'Game action failed.', 400, response?.code)); return; }
        resolve(response.data as T);
      });
    });
  }

  on<T>(event: string, listener: (payload: T) => void): () => void {
    this.socket?.on(event, listener);
    return () => { this.socket?.off(event, listener); };
  }

  onReconnect(listener: () => void): () => void {
    const manager = this.socket?.io;
    if (!manager) return () => undefined;
    manager.on('reconnect', listener);
    return () => { manager.off('reconnect', listener); };
  }

  emit(event: string, payload?: unknown): void { this.socket?.emit(event, payload); }
  get connected(): boolean { return Boolean(this.socket?.connected); }
  disconnect(): void { this.socket?.disconnect(); this.socket = null; }
}

export const socketClient = new SocketClient();
