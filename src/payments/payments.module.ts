import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MoneyModule } from '../money/money.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider';
import { RazorpayPaymentProvider } from './providers/razorpay-payment.provider';
import { WalletController } from './wallet.controller';

@Module({
  imports: [MoneyModule, RealtimeModule],
  controllers: [PaymentsController, WalletController, PayoutsController],
  providers: [
    PaymentsService,
    PayoutsService,
    MockPaymentProvider,
    RazorpayPaymentProvider,
    {
      // Use Razorpay when keys are configured, otherwise the dev mock provider.
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockPaymentProvider,
        razorpay: RazorpayPaymentProvider,
      ) => (config.get<string>('RAZORPAY_KEY_ID') ? razorpay : mock),
      inject: [ConfigService, MockPaymentProvider, RazorpayPaymentProvider],
    },
  ],
})
export class PaymentsModule {}
