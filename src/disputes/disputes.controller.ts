import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { DisputeStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DisputesService } from './disputes.service';
import {
  RaiseDisputeDto,
  raiseDisputeSchema,
  ResolveDisputeDto,
  resolveDisputeSchema,
} from './dto/dispute.schemas';

@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post('bookings/:id/dispute')
  async raise(
    @Param('id') bookingId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(raiseDisputeSchema)) dto: RaiseDisputeDto,
  ) {
    return ok(await this.disputes.raise(bookingId, user, dto));
  }

  @Get('disputes/:id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(await this.disputes.get(id, user));
  }
}

@Roles('OPS_ADMIN', 'SUPER_ADMIN')
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  async list(@Query('status') status?: DisputeStatus) {
    return ok(await this.disputes.adminList(status));
  }

  @Post(':id/assign')
  @HttpCode(200)
  async assign(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return ok(await this.disputes.assign(id, adminId));
  }

  @Post(':id/resolve')
  @HttpCode(200)
  async resolve(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema)) dto: ResolveDisputeDto,
  ) {
    return ok(await this.disputes.resolve(id, adminId, dto));
  }
}
