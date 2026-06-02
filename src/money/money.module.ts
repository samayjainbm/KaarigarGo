import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { CommissionService } from './commission.service';
import { SettlementService } from './settlement.service';
import { WalletService } from './wallet.service';

@Module({
  imports: [RealtimeModule],
  providers: [CommissionService, WalletService, SettlementService],
  exports: [CommissionService, WalletService, SettlementService],
})
export class MoneyModule {}
