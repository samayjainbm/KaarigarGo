import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PayoutRequestDto, payoutRequestSchema } from './dto/payment.schemas';
import { PayoutsService } from './payouts.service';

@Roles('WORKER')
@Controller('worker')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('earnings')
  async earnings(@CurrentUser('id') userId: string) {
    return ok(await this.payouts.earnings(userId));
  }

  @Get('payouts')
  async list(@CurrentUser('id') userId: string) {
    return ok(await this.payouts.list(userId));
  }

  @Post('payouts/request')
  async request(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(payoutRequestSchema)) dto: PayoutRequestDto,
  ) {
    return ok(await this.payouts.request(userId, dto.amount));
  }
}
