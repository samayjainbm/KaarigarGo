import { Module } from '@nestjs/common';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminCommissionController } from './admin-commission.controller';
import { AdminCommissionService } from './admin-commission.service';
import { AdminPayoutsController } from './admin-payouts.controller';
import { AdminPayoutsService } from './admin-payouts.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';

@Module({
  controllers: [
    AdminController,
    AdminCatalogController,
    AdminCommissionController,
    AdminPayoutsController,
  ],
  providers: [
    AdminService,
    AdminCatalogService,
    AdminCommissionService,
    AdminPayoutsService,
    AuditService,
  ],
})
export class AdminModule {}
