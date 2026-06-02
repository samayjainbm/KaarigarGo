import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { CreatedOrder, PaymentProvider } from './payment-provider';

/**
 * Razorpay via REST (no SDK dependency). Verify product/pricing on Razorpay docs.
 * For escrow split settlement, layer Razorpay Route on top later.
 */
@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  constructor(private readonly config: ConfigService) {}

  async createOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
  }): Promise<CreatedOrder> {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt,
      }),
    });
    if (!res.ok) {
      throw new Error(`Razorpay order failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string };
    return { providerOrderId: data.id };
  }

  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!rawBody || !signature) return false;
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature;
  }
}
