import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminKycController } from './admin-kyc.controller';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [RealtimeModule],
  controllers: [KycController, AdminKycController],
  providers: [KycService],
})
export class KycModule {}
