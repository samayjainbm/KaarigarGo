import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminDisputesController, DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [MoneyModule, RealtimeModule],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}
