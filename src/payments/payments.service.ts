import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { SettlementService } from '../money/settlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  PAYMENT_PROVIDER,
  ParsedWebhook,
  PaymentProvider,
} from './providers/payment-provider';

const PAYABLE_STATUSES = ['ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'];

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  async createOrder(user: AuthUser, bookingId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customerId !== user.id) throw new ForbiddenException('Not your booking');
    if (b.paymentMode !== 'ONLINE') throw new BadRequestException('Booking is cash mode');
    if (!PAYABLE_STATUSES.includes(b.status)) {
      throw new ConflictException(`Booking not payable in state ${b.status}`);
    }
    if (await this.prisma.payment.findFirst({ where: { bookingId, status: 'PAID' } })) {
      throw new ConflictException('Booking already paid');
    }

    const amount = b.finalPrice ?? b.priceEstimate ?? 0;
    if (amount <= 0) throw new BadRequestException('Invalid amount');

    const order = await this.provider.createOrder({
      amountPaise: amount,
      currency: 'INR',
      receipt: `bk_${bookingId.slice(0, 8)}`,
    });
    const payment = await this.prisma.payment.create({
      data: { bookingId, provider: 'RAZORPAY', providerOrderId: order.providerOrderId, amount, status: 'PENDING' },
    });

    return {
      paymentId: payment.id,
      orderId: order.providerOrderId,
      amount,
      currency: 'INR',
      provider: this.provider.name,
      keyId: this.provider.name === 'razorpay' ? this.config.get<string>('RAZORPAY_KEY_ID') : null,
      ...(this.provider.name === 'mock'
        ? { mockPayUrl: `/api/v1/payments/order/${order.providerOrderId}/mock-pay` }
        : {}),
    };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined, body: unknown) {
    if (!this.provider.verifySignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const parsed = this.parse(body);
    if (!parsed) return { ignored: true };
    return this.applyPayment(parsed);
  }

  async mockPay(orderId: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Disabled in production');
    }
    return this.applyPayment({
      providerOrderId: orderId,
      providerPaymentId: `pay_mock_${Date.now()}`,
      method: 'UPI',
      status: 'PAID',
    });
  }

  private parse(body: unknown): ParsedWebhook | null {
    const b = body as Record<string, any>;
    const entity = b?.payload?.payment?.entity;
    if (entity) {
      return {
        providerOrderId: entity.order_id,
        providerPaymentId: entity.id,
        method: (entity.method ?? '').toUpperCase(),
        status: entity.status === 'captured' || entity.status === 'authorized' ? 'PAID' : 'FAILED',
      };
    }
    if (b?.providerOrderId) {
      return {
        providerOrderId: b.providerOrderId,
        providerPaymentId: b.providerPaymentId,
        method: b.method,
        status: b.status ?? 'PAID',
      };
    }
    return null;
  }

  private async applyPayment(p: ParsedWebhook) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: p.providerOrderId },
    });
    if (!payment) return { ignored: true, reason: 'unknown_order' };
    if (payment.status === 'PAID') return { ok: true, idempotent: true };

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: p.status, providerPaymentId: p.providerPaymentId, method: this.mapMethod(p.method) },
    });

    const booking = await this.prisma.booking.findUnique({ where: { id: payment.bookingId } });
    if (booking) {
      this.realtime.emitToUser(booking.customerId, 'payment.updated', {
        bookingId: booking.id,
        status: p.status,
      });
    }

    const settlement = p.status === 'PAID' ? await this.settlement.settleIfReady(payment.bookingId) : null;
    return { ok: true, paymentStatus: p.status, settlement };
  }

  private mapMethod(method?: string): PaymentMethod | undefined {
    if (!method) return undefined;
    const up = method.toUpperCase();
    if (['UPI', 'CARD', 'NETBANKING', 'WALLET', 'CASH'].includes(up)) return up as PaymentMethod;
    if (up === 'EMI' || up === 'EMANDATE') return 'CARD';
    return undefined;
  }
}
