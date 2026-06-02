import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DisputeStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { WalletService } from '../money/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RaiseDisputeDto, ResolveDisputeDto } from './dto/dispute.schemas';

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async raise(bookingId: string, user: AuthUser, dto: RaiseDisputeDto) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { worker: { select: { userId: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customerId !== user.id && b.worker?.userId !== user.id) {
      throw new ForbiddenException('Not your booking');
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        bookingId,
        raisedById: user.id,
        reason: dto.reason,
        evidenceUrls: dto.evidenceUrls ?? [],
      },
    });
    await this.prisma.bookingEvent.create({
      data: { bookingId, type: 'dispute_raised', actorId: user.id, payload: { disputeId: dispute.id } },
    });

    this.realtime.emitToUser(b.customerId, 'dispute.updated', { disputeId: dispute.id, status: 'OPEN' });
    if (b.worker?.userId) {
      this.realtime.emitToUser(b.worker.userId, 'dispute.updated', { disputeId: dispute.id, status: 'OPEN' });
    }
    return dispute;
  }

  async get(id: string, user: AuthUser) {
    const d = await this.prisma.dispute.findUnique({
      where: { id },
      include: { booking: { include: { worker: { select: { userId: true } } } } },
    });
    if (!d) throw new NotFoundException('Dispute not found');

    const isParty =
      d.booking.customerId === user.id ||
      d.booking.worker?.userId === user.id ||
      d.raisedById === user.id;
    const isAdmin = user.role === 'OPS_ADMIN' || user.role === 'SUPER_ADMIN';
    if (!isParty && !isAdmin) throw new ForbiddenException('Not allowed');
    return d;
  }

  adminList(status?: DisputeStatus) {
    return this.prisma.dispute.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: { id: true, status: true, finalPrice: true, priceEstimate: true, customerId: true },
        },
      },
    });
  }

  async assign(id: string, adminId: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Dispute not found');
    return this.prisma.dispute.update({
      where: { id },
      data: { assignedTo: adminId, status: 'UNDER_REVIEW' },
    });
  }

  async resolve(id: string, adminId: string, dto: ResolveDisputeDto) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { booking: true } });
    if (!d) throw new NotFoundException('Dispute not found');
    if (d.status === 'RESOLVED') throw new ConflictException('Dispute already resolved');

    if (dto.resolution !== 'DISMISS') {
      const amount = dto.amount ?? d.booking.finalPrice ?? d.booking.priceEstimate ?? 0;
      if (amount > 0) {
        const w = await this.wallet.getOrCreate(d.booking.customerId, 'CUSTOMER');
        await this.prisma.$transaction(async (tx) => {
          await this.wallet.record(tx, w.id, 'REFUND', amount, d.bookingId);
        });
      }
    }

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedBy: adminId,
        resolutionNotes: dto.notes ?? dto.resolution,
      },
    });
    await this.prisma.bookingEvent.create({
      data: {
        bookingId: d.bookingId,
        type: 'dispute_resolved',
        actorId: adminId,
        payload: { resolution: dto.resolution, amount: dto.amount },
      },
    });

    this.realtime.emitToUser(d.booking.customerId, 'dispute.updated', { disputeId: id, status: 'RESOLVED' });
    return updated;
  }
}
