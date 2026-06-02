import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { BookingStatus, KycStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';
import {
  FeatureDto,
  featureSchema,
  SetRoleDto,
  setRoleSchema,
  SuspendDto,
  suspendSchema,
} from './dto/admin.schemas';

@Roles('OPS_ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('analytics/overview')
  async overview() {
    return ok(await this.admin.overview());
  }

  @Get('users')
  async users(
    @Query('role') role?: UserRole,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return ok(await this.admin.listUsers(role, q, limit ? Number(limit) : 50, cursor));
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  async suspend(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suspendSchema)) dto: SuspendDto,
  ) {
    return ok(await this.admin.suspendUser(adminId, id, dto.reason));
  }

  @Post('users/:id/reinstate')
  @HttpCode(200)
  async reinstate(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return ok(await this.admin.reinstateUser(adminId, id));
  }

  @Roles('SUPER_ADMIN')
  @Post('users/:id/role')
  @HttpCode(200)
  async setRole(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setRoleSchema)) dto: SetRoleDto,
  ) {
    return ok(await this.admin.setRole(adminId, id, dto.role));
  }

  @Get('workers')
  async workers(
    @Query('q') q?: string,
    @Query('kycStatus') kycStatus?: KycStatus,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return ok(await this.admin.listWorkers(q, kycStatus, limit ? Number(limit) : 50, cursor));
  }

  @Post('workers/:id/feature')
  @HttpCode(200)
  async feature(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(featureSchema)) dto: FeatureDto,
  ) {
    return ok(await this.admin.featureWorker(adminId, id, dto.isFeatured));
  }

  @Get('bookings')
  async bookings(
    @Query('status') status?: BookingStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return ok(
      await this.admin.listBookings({ status, from, to, limit: limit ? Number(limit) : 50, cursor }),
    );
  }

  @Get('audit-logs')
  async auditLogs(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return ok(await this.admin.auditLogs(limit ? Number(limit) : 100, cursor));
  }
}
