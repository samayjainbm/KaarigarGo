import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  create(bookingId: string, senderId: string, body?: string, attachmentUrl?: string) {
    return this.prisma.chatMessage.create({
      data: { bookingId, senderId, body, attachmentUrl },
    });
  }

  async list(bookingId: string, limit = 50, cursor?: string) {
    const items = await this.prisma.chatMessage.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    return { items: page.reverse(), nextCursor };
  }

  async markRead(bookingId: string, userId: string) {
    await this.prisma.chatMessage.updateMany({
      where: { bookingId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
