import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminCatalogService } from './admin-catalog.service';
import {
  CreateCategoryDto,
  createCategorySchema,
  CreateServiceDto,
  createServiceSchema,
  UpdateCategoryDto,
  updateCategorySchema,
  UpdateServiceDto,
  updateServiceSchema,
} from './dto/admin.schemas';

@Roles('OPS_ADMIN', 'SUPER_ADMIN')
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Post('categories')
  async createCategory(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return ok(await this.catalog.createCategory(adminId, dto));
  }

  @Patch('categories/:id')
  async updateCategory(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return ok(await this.catalog.updateCategory(adminId, id, dto));
  }

  @Delete('categories/:id')
  @HttpCode(200)
  async deactivateCategory(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return ok(await this.catalog.deactivateCategory(adminId, id));
  }

  @Post('services')
  async createService(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(createServiceSchema)) dto: CreateServiceDto,
  ) {
    return ok(await this.catalog.createService(adminId, dto));
  }

  @Patch('services/:id')
  async updateService(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) dto: UpdateServiceDto,
  ) {
    return ok(await this.catalog.updateService(adminId, id, dto));
  }

  @Delete('services/:id')
  @HttpCode(200)
  async deactivateService(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return ok(await this.catalog.deactivateService(adminId, id));
  }
}
