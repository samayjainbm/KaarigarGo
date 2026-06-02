import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreatedOrder, PaymentProvider } from './payment-provider';

/** Dev provider: creates fake orders and accepts the dev mock-pay trigger. */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  async createOrder(): Promise<CreatedOrder> {
    return { providerOrderId: `order_mock_${randomUUID().replace(/-/g, '').slice(0, 16)}` };
  }

  verifySignature(): boolean {
    // No real signature in dev; the mock-pay endpoint is the trusted trigger.
    return true;
  }
}
