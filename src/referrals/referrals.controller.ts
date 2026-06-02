import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApplyReferralDto, applyReferralSchema } from './dto/referral.schemas';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  async me(@CurrentUser('id') userId: string) {
    return ok(await this.referrals.myCode(userId));
  }

  @Post('apply')
  @HttpCode(200)
  async apply(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(applyReferralSchema)) dto: ApplyReferralDto,
  ) {
    return ok(await this.referrals.apply(userId, dto.code));
  }
}
