import { io } from 'socket.io-client';
import { session } from './api';

const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/api\/v1\/?$/, '');

/** Connect to the realtime gateway with the current access token in the handshake. */
export function connectSocket() {
  return io(WS_BASE, {
    transports: ['websocket'],
    auth: { token: session.access() },
    reconnectionAttempts: 5,
  });
}
