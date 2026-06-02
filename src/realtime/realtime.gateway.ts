import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Authenticated realtime hub (JWT handshake). Rooms:
 *   user:<userId>      — per-user notifications
 *   booking:<bookingId> — per-booking status/chat/location
 *
 * For multi-instance scale, attach the Socket.IO Redis adapter in main.ts.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('Realtime');

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) throw new Error('no token');

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'access') throw new Error('bad token type');

      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.join(`user:${payload.sub}`);
    } catch {
      client.emit('error', { message: 'unauthorized' });
      client.disconnect(true);
    }
  }

  private async isParticipant(bookingId: string, userId: string): Promise<boolean> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { worker: { select: { userId: true } } },
    });
    if (!b) return false;
    return b.customerId === userId || b.worker?.userId === userId;
  }

  @SubscribeMessage('booking.join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { bookingId: string }) {
    if (!(await this.isParticipant(data.bookingId, client.data.userId))) {
      return { error: 'forbidden' };
    }
    client.join(`booking:${data.bookingId}`);
    return { joined: data.bookingId };
  }

  @SubscribeMessage('chat.send')
  async onChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { bookingId: string; body?: string; attachmentUrl?: string },
  ) {
    const userId = client.data.userId;
    if (!(await this.isParticipant(data.bookingId, userId))) return { error: 'forbidden' };
    const msg = await this.chat.create(data.bookingId, userId, data.body, data.attachmentUrl);
    this.server.to(`booking:${data.bookingId}`).emit('chat.message', msg);
    return { sent: true, id: msg.id };
  }

  @SubscribeMessage('chat.markRead')
  async onMarkRead(@ConnectedSocket() client: Socket, @MessageBody() data: { bookingId: string }) {
    const userId = client.data.userId;
    if (!(await this.isParticipant(data.bookingId, userId))) return { error: 'forbidden' };
    await this.chat.markRead(data.bookingId, userId);
    this.server.to(`booking:${data.bookingId}`).emit('chat.read', { bookingId: data.bookingId, by: userId });
    return { ok: true };
  }

  @SubscribeMessage('location.ping')
  async onPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { bookingId: string; lat: number; lng: number },
  ) {
    if (client.data.role !== 'WORKER') return { error: 'forbidden' };
    if (!(await this.isParticipant(data.bookingId, client.data.userId))) return { error: 'forbidden' };
    this.server.to(`booking:${data.bookingId}`).emit('booking.location_update', {
      bookingId: data.bookingId,
      lat: data.lat,
      lng: data.lng,
      at: Date.now(),
    });
    return { ok: true };
  }

  @SubscribeMessage('presence.heartbeat')
  onHeartbeat() {
    return { ok: true, at: Date.now() };
  }

  // ── Server → client helpers (called by services) ──────────────────────────
  emitToBooking(bookingId: string, event: string, payload: unknown): void {
    this.server?.to(`booking:${bookingId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
