import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminCommissionService } from './admin-commission.service';
import { CommissionRuleDto, commissionRuleSchema } from './dto/admin.schemas';

@Roles('OPS_ADMIN', 'SUPER_ADMIN')
@Controller('admin/commission-rules')
export class AdminCommissionController {
  constructor(private readonly commission: AdminCommissionService) {}

  @Get()
  async list() {
    return ok(await this.commission.list());
  }

  @Post()
  async create(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(commissionRuleSchema)) dto: CommissionRuleDto,
  ) {
    return ok(await this.commission.create(adminId, dto));
  }
}
