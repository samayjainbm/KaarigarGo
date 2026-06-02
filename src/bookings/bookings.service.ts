import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { SettlementService } from '../money/settlement.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RedisService } from '../redis/redis.service';
import { WorkerDiscoveryService } from '../workers/worker-discovery.service';
import { canWorkerTransition, TERMINAL_STATUSES } from './booking-status';
import {
  AcceptQuoteDto,
  CancelDto,
  CreateBookingDto,
  QuoteDto,
  StatusUpdateDto,
  TrackDto,
} from './dto/booking.schemas';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: WorkerDiscoveryService,
    private readonly realtime: RealtimeGateway,
    private readonly settlement: SettlementService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  private event(bookingId: string, type: string, actorId: string | null, payload?: unknown) {
    return this.prisma.bookingEvent.create({
      data: {
        bookingId,
        type,
        actorId: actorId ?? undefined,
        payload: (payload as object) ?? undefined,
      },
    });
  }

  private emitStatus(
    customerId: string,
    workerUserId: string | null,
    bookingId: string,
    status: string,
  ) {
    this.realtime.emitToUser(customerId, 'booking.status_changed', { bookingId, status });
    if (workerUserId) {
      this.realtime.emitToUser(workerUserId, 'booking.status_changed', { bookingId, status });
    }
    this.realtime.emitToBooking(bookingId, 'booking.status_changed', { bookingId, status });
  }

  private notifyCustomerStatus(customerId: string, bookingId: string, status: string) {
    const map: Record<string, [string, string]> = {
      ACCEPTED: ['Booking accepted ✅', 'Your pro accepted the job.'],
      EN_ROUTE: ['Pro on the way 🚗', 'Your pro is heading to you.'],
      IN_PROGRESS: ['Work started 🔧', 'Your pro has started the job.'],
      COMPLETED: ['Job completed 🎉', 'All done — please rate your pro.'],
    };
    const m = map[status];
    if (m) void this.notifications.notify(customerId, `booking.${status.toLowerCase()}`, m[0], m[1], { bookingId });
  }

  private async workerProfileForUser(userId: string) {
    const wp = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (!wp) throw new ForbiddenException('No worker profile');
    return wp;
  }

  /** Nudge a worker's reliability score, clamped to [0, 100]. */
  private async adjustReliability(workerId: string, delta: number) {
    const wp = await this.prisma.workerProfile.findUnique({ where: { id: workerId } });
    if (!wp) return;
    const next = Math.max(0, Math.min(100, wp.reliabilityScore + delta));
    await this.prisma.workerProfile.update({
      where: { id: workerId },
      data: { reliabilityScore: next },
    });
  }

  async create(customerId: string, dto: CreateBookingDto) {
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      include: { category: true },
    });
    if (!service || !service.isActive) throw new BadRequestException('Unknown or inactive service');

    let workerId: string | null = null;
    if (dto.workerId) {
      const wp = await this.prisma.workerProfile.findUnique({
        where: { id: dto.workerId },
        include: { skills: true },
      });
      if (!wp || wp.kycStatus !== 'APPROVED') throw new BadRequestException('Worker unavailable');
      if (!wp.skills.some((s) => s.categoryId === service.categoryId)) {
        throw new BadRequestException('Worker does not offer this service');
      }
      workerId = wp.id;
    } else {
      workerId = await this.discovery.findBestWorkerId(service.categoryId, dto.lat, dto.lng);
    }

    const booking = await this.prisma.booking.create({
      data: {
        customerId,
        workerId: workerId ?? undefined,
        serviceId: service.id,
        addressId: dto.addressId,
        status: 'REQUESTED',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        priceEstimate: service.basePrice,
        paymentMode: dto.paymentMode,
        isRecurring: dto.isRecurring ?? false,
        recurrenceRule: dto.recurrenceRule,
      },
    });

    await this.prisma.$executeRawUnsafe(
      `UPDATE bookings SET location = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id = $3`,
      dto.lng,
      dto.lat,
      booking.id,
    );
    await this.event(booking.id, 'created', customerId, {
      workerId,
      instant: !dto.scheduledAt,
      notes: dto.notes,
    });

    if (workerId) {
      const wp = await this.prisma.workerProfile.findUnique({ where: { id: workerId } });
      if (wp) {
        this.realtime.emitToUser(wp.userId, 'booking.worker_assigned', { bookingId: booking.id });
        void this.notifications.notify(
          wp.userId,
          'job.new',
          'New job request 🛠️',
          `${service.name} nearby — tap to accept`,
          { bookingId: booking.id },
        );
      }
    }
    this.realtime.emitToUser(customerId, 'booking.status_changed', {
      bookingId: booking.id,
      status: 'REQUESTED',
    });

    return this.getDetailById(booking.id);
  }

  listForUser(user: AuthUser, status?: BookingStatus) {
    if (user.role === 'WORKER') {
      return this.prisma.workerProfile
        .findUnique({ where: { userId: user.id } })
        .then((wp) =>
          wp
            ? this.prisma.booking.findMany({
                where: { workerId: wp.id, ...(status ? { status } : {}) },
                orderBy: { createdAt: 'desc' },
                include: { service: { select: { name: true } } },
              })
            : [],
        );
    }
    return this.prisma.booking.findMany({
      where: { customerId: user.id, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { service: { select: { name: true } } },
    });
  }

  async assertParticipant(bookingId: string, user: AuthUser) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { worker: { select: { userId: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    const isCustomer = b.customerId === user.id;
    const isWorker = b.worker?.userId === user.id;
    const isAdmin = user.role === 'OPS_ADMIN' || user.role === 'SUPER_ADMIN';
    if (!isCustomer && !isWorker && !isAdmin) throw new ForbiddenException('Not your booking');
    return b;
  }

  async getDetail(bookingId: string, user: AuthUser) {
    await this.assertParticipant(bookingId, user);
    return this.getDetailById(bookingId);
  }

  private async getDetailById(bookingId: string) {
    const b = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        service: { include: { category: { select: { name: true, slug: true } } } },
        worker: {
          select: {
            id: true,
            userId: true,
            ratingAvg: true,
            user: { select: { name: true, avatarUrl: true } },
          },
        },
        events: { orderBy: { createdAt: 'asc' } },
        quotes: { orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    const loc = await this.prisma.$queryRawUnsafe<{ lat: number | null; lng: number | null }[]>(
      `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM bookings WHERE id = $1`,
      bookingId,
    );
    return { ...b, location: loc[0]?.lat != null ? { lat: loc[0].lat, lng: loc[0].lng } : null };
  }

  async accept(bookingId: string, user: AuthUser) {
    const wp = await this.workerProfileForUser(user.id);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.workerId !== wp.id) throw new ForbiddenException('Not assigned to you');
    if (b.status !== 'REQUESTED') throw new ConflictException(`Cannot accept from ${b.status}`);

    await this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'ACCEPTED' } });
    await this.event(bookingId, 'accepted', user.id);
    this.emitStatus(b.customerId, wp.userId, bookingId, 'ACCEPTED');
    this.notifyCustomerStatus(b.customerId, bookingId, 'ACCEPTED');
    return this.getDetailById(bookingId);
  }

  async reject(bookingId: string, user: AuthUser) {
    const wp = await this.workerProfileForUser(user.id);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.workerId !== wp.id) throw new ForbiddenException('Not assigned to you');
    if (b.status !== 'REQUESTED') throw new ConflictException(`Cannot reject from ${b.status}`);

    await this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'REJECTED' } });
    await this.event(bookingId, 'rejected', user.id);
    await this.adjustReliability(wp.id, -3);
    this.emitStatus(b.customerId, wp.userId, bookingId, 'REJECTED');
    return this.getDetailById(bookingId);
  }

  async updateStatus(bookingId: string, user: AuthUser, dto: StatusUpdateDto) {
    const wp = await this.workerProfileForUser(user.id);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.workerId !== wp.id) throw new ForbiddenException('Not assigned to you');
    if (!canWorkerTransition(b.status, dto.status)) {
      throw new ConflictException(`Illegal transition ${b.status} -> ${dto.status}`);
    }

    const data: { status: BookingStatus; finalPrice?: number } = { status: dto.status };
    if (dto.status === 'COMPLETED') {
      data.finalPrice = dto.finalPrice ?? b.finalPrice ?? b.priceEstimate ?? 0;
    }
    await this.prisma.booking.update({ where: { id: bookingId }, data });
    await this.event(bookingId, dto.status.toLowerCase(), user.id, { photoUrls: dto.photoUrls });
    this.emitStatus(b.customerId, wp.userId, bookingId, dto.status);
    this.notifyCustomerStatus(b.customerId, bookingId, dto.status);

    if (dto.status === 'COMPLETED') {
      await this.prisma.workerProfile.update({
        where: { id: wp.id },
        data: { completedJobs: { increment: 1 } },
      });
      await this.adjustReliability(wp.id, 1);
      await this.settlement.settleIfReady(bookingId);
    }
    return this.getDetailById(bookingId);
  }

  async cancel(bookingId: string, user: AuthUser, dto: CancelDto) {
    const b = await this.assertParticipant(bookingId, user);
    if (TERMINAL_STATUSES.includes(b.status)) {
      throw new ConflictException(`Cannot cancel a ${b.status} booking`);
    }
    const isWorkerActor = b.worker?.userId === user.id;
    if (isWorkerActor) {
      if (!['ACCEPTED', 'EN_ROUTE'].includes(b.status)) {
        throw new ConflictException(`Worker cannot cancel from ${b.status}`);
      }
    } else if (!['REQUESTED', 'ACCEPTED'].includes(b.status)) {
      throw new ConflictException(`Customer cannot cancel from ${b.status}`);
    }

    const status: BookingStatus = isWorkerActor ? 'CANCELLED_BY_WORKER' : 'CANCELLED_BY_CUSTOMER';
    await this.prisma.booking.update({ where: { id: bookingId }, data: { status } });
    await this.event(bookingId, 'cancelled', user.id, {
      by: isWorkerActor ? 'worker' : 'customer',
      reason: dto.reason,
    });
    if (isWorkerActor && b.workerId) await this.adjustReliability(b.workerId, -5);
    this.emitStatus(b.customerId, b.worker?.userId ?? null, bookingId, status);
    return this.getDetailById(bookingId);
  }

  async createQuote(bookingId: string, user: AuthUser, dto: QuoteDto) {
    const wp = await this.workerProfileForUser(user.id);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.workerId !== wp.id) throw new ForbiddenException('Not your booking');
    if (!['ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS'].includes(b.status)) {
      throw new ConflictException('Quote not allowed in current state');
    }
    const quote = await this.prisma.quote.create({
      data: { bookingId, workerId: wp.id, amount: dto.amount, notes: dto.notes },
    });
    await this.event(bookingId, 'quote_proposed', user.id, { quoteId: quote.id, amount: dto.amount });
    this.realtime.emitToUser(b.customerId, 'booking.quote_proposed', { bookingId, quote });
    return quote;
  }

  async acceptQuote(bookingId: string, user: AuthUser, dto: AcceptQuoteDto) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.customerId !== user.id) throw new ForbiddenException('Not your booking');
    const quote = await this.prisma.quote.findUnique({ where: { id: dto.quoteId } });
    if (!quote || quote.bookingId !== bookingId) throw new NotFoundException('Quote not found');

    await this.prisma.$transaction([
      this.prisma.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } }),
      this.prisma.quote.updateMany({
        where: { bookingId, id: { not: quote.id }, status: 'PROPOSED' },
        data: { status: 'DECLINED' },
      }),
      this.prisma.booking.update({
        where: { id: bookingId },
        data: { finalPrice: quote.amount, priceEstimate: quote.amount },
      }),
    ]);
    await this.event(bookingId, 'quote_accepted', user.id, { quoteId: quote.id, amount: quote.amount });

    if (b.workerId) {
      const wp = await this.prisma.workerProfile.findUnique({ where: { id: b.workerId } });
      if (wp) this.realtime.emitToUser(wp.userId, 'booking.quote_accepted', { bookingId, amount: quote.amount });
    }
    return this.getDetailById(bookingId);
  }

  async track(bookingId: string, user: AuthUser, dto: TrackDto) {
    const wp = await this.workerProfileForUser(user.id);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.workerId !== wp.id) throw new ForbiddenException('Not your booking');
    if (b.status !== 'EN_ROUTE') throw new ConflictException('Tracking only during EN_ROUTE');

    const payload = { bookingId, lat: dto.lat, lng: dto.lng, at: Date.now() };
    await this.redis.client.set(`booking:loc:${bookingId}`, JSON.stringify(payload), 'EX', 120);
    this.realtime.emitToBooking(bookingId, 'booking.location_update', payload);
    this.realtime.emitToUser(b.customerId, 'booking.location_update', payload);
    return { ok: true };
  }

  async cashConfirm(bookingId: string, user: AuthUser) {
    const wp = await this.workerProfileForUser(user.id);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.workerId !== wp.id) throw new ForbiddenException('Not your booking');
    if (b.paymentMode !== 'CASH') throw new BadRequestException('Booking is not cash mode');
    if (b.status !== 'COMPLETED') throw new ConflictException('Complete the job before confirming cash');

    const result = await this.settlement.settleCash(bookingId);
    this.emitStatus(b.customerId, wp.userId, bookingId, 'SETTLED');
    return result;
  }

  /** In-job safety alert: records an event and broadcasts to the booking room. */
  async sos(bookingId: string, user: AuthUser, location?: { lat: number; lng: number }) {
    await this.assertParticipant(bookingId, user);
    await this.event(bookingId, 'sos', user.id, { location });
    this.realtime.emitToBooking(bookingId, 'safety.sos', {
      bookingId,
      raisedBy: user.id,
      role: user.role,
      location,
      at: Date.now(),
    });
    return { ok: true, alerted: true };
  }
}
