import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { KycDocStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RejectKycDto, rejectKycSchema } from './dto/kyc.schemas';
import { KycService } from './kyc.service';

@Roles('OPS_ADMIN', 'SUPER_ADMIN')
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  async queue(@Query('status') status?: KycDocStatus) {
    return ok(await this.kyc.queue(status ?? 'PENDING'));
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return ok(await this.kyc.approve(id, adminId));
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(rejectKycSchema)) dto: RejectKycDto,
  ) {
    return ok(await this.kyc.reject(id, adminId, dto.reason));
  }
}
