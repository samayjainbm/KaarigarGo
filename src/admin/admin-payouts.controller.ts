import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminPayoutsService } from './admin-payouts.service';
import { MarkPaidDto, markPaidSchema } from './dto/admin.schemas';

@Roles('OPS_ADMIN', 'SUPER_ADMIN')
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: AdminPayoutsService) {}

  @Get()
  async list(@Query('status') status?: PayoutStatus) {
    return ok(await this.payouts.list(status));
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return ok(await this.payouts.approve(adminId, id));
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  async markPaid(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markPaidSchema)) dto: MarkPaidDto,
  ) {
    return ok(await this.payouts.markPaid(adminId, id, dto.providerRef));
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retry(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return ok(await this.payouts.retry(adminId, id));
  }
}
