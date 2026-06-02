import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [MoneyModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
