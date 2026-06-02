export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface CreatedOrder {
  providerOrderId: string;
}

export interface ParsedWebhook {
  providerOrderId: string;
  providerPaymentId?: string;
  method?: string;
  status: 'PAID' | 'FAILED';
}

export interface PaymentProvider {
  readonly name: 'razorpay' | 'mock';
  createOrder(input: { amountPaise: number; currency: string; receipt: string }): Promise<CreatedOrder>;
  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean;
}
