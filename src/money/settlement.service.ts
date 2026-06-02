import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CommissionService } from './commission.service';
import { WalletService } from './wallet.service';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger('Settlement');

  constructor(
    private readonly prisma: PrismaService,
    private readonly commission: CommissionService,
    private readonly wallet: WalletService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /** Settle an online booking once it's both COMPLETED and PAID (whichever lands last). */
  async settleIfReady(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, payments: true },
    });
    if (!b) return { skipped: 'not_found' };
    if (b.status === 'SETTLED') return { alreadySettled: true };
    if (b.status !== 'COMPLETED') return { pending: 'not_completed' };
    if (b.paymentMode === 'CASH') return { pending: 'awaiting_cash_confirm' };

    const paid = b.payments.find((p) => p.status === 'PAID');
    if (!paid) return { pending: 'awaiting_payment' };

    return this.doSettle(b.id, b.workerId, b.customerId, b.service.categoryId, paid.amount, 'online');
  }

  /** Cash flow: worker collected cash; record the platform commission owed against their wallet. */
  async settleCash(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status === 'SETTLED') return { alreadySettled: true };
    if (b.paymentMode !== 'CASH') throw new BadRequestException('Not a cash booking');
    if (!b.workerId) throw new BadRequestException('No worker assigned');

    const amount = b.finalPrice ?? b.priceEstimate ?? 0;
    const commission = await this.commission.compute(b.service.categoryId, amount);
    const workerUserId = (
      await this.prisma.workerProfile.findUniqueOrThrow({ where: { id: b.workerId } })
    ).userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: { bookingId: b.id, provider: 'RAZORPAY', amount, status: 'PAID', method: 'CASH' },
      });
      const w = await this.wallet.getOrCreate(workerUserId, 'WORKER', tx);
      await this.wallet.record(tx, w.id, 'COMMISSION', -commission, b.id);
      await tx.booking.update({
        where: { id: b.id },
        data: { status: 'SETTLED', commissionAmount: commission, finalPrice: amount },
      });
      await tx.bookingEvent.create({
        data: { bookingId: b.id, type: 'settled', payload: { mode: 'cash', amount, commission } },
      });
    });

    this.realtime.emitToUser(workerUserId, 'booking.status_changed', {
      bookingId: b.id,
      status: 'SETTLED',
    });
    void this.notifications.notify(
      workerUserId,
      'earning',
      'Cash collected 💰',
      `Job settled — commission ₹${Math.round(commission / 100)} recorded`,
      { bookingId: b.id },
    );
    return { settled: true, amount, commission, workerEarning: amount - commission, mode: 'cash' };
  }

  private async doSettle(
    bookingId: string,
    workerId: string | null,
    customerId: string,
    categoryId: string,
    amount: number,
    mode: 'online',
  ) {
    if (!workerId) {
      this.logger.warn(`Booking ${bookingId} completed without a worker; cannot settle`);
      return { error: 'no_worker' };
    }
    const commission = await this.commission.compute(categoryId, amount);
    const workerEarning = amount - commission;
    const workerUserId = (
      await this.prisma.workerProfile.findUniqueOrThrow({ where: { id: workerId } })
    ).userId;

    await this.prisma.$transaction(async (tx) => {
      const w = await this.wallet.getOrCreate(workerUserId, 'WORKER', tx);
      await this.wallet.record(tx, w.id, 'CREDIT', workerEarning, bookingId);
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'SETTLED', commissionAmount: commission, finalPrice: amount },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId,
          type: 'settled',
          payload: { mode, amount, commission, workerEarning },
        },
      });
    });

    this.realtime.emitToUser(workerUserId, 'booking.status_changed', { bookingId, status: 'SETTLED' });
    this.realtime.emitToUser(customerId, 'booking.status_changed', { bookingId, status: 'SETTLED' });
    void this.notifications.notify(
      workerUserId,
      'earning',
      'You got paid 💰',
      `₹${Math.round(workerEarning / 100)} added to your wallet`,
      { bookingId },
    );
    return { settled: true, amount, commission, workerEarning, mode };
  }
}
