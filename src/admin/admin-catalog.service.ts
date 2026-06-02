import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateServiceDto,
  UpdateCategoryDto,
  UpdateServiceDto,
} from './dto/admin.schemas';
import { AuditService } from './audit.service';

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createCategory(adminId: string, dto: CreateCategoryDto) {
    const category = await this.prisma.category.create({ data: dto });
    await this.audit.log({ actorId: adminId, action: 'category.create', entity: 'Category', entityId: category.id, after: category });
    return category;
  }

  async updateCategory(adminId: string, id: string, dto: UpdateCategoryDto) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    const after = await this.prisma.category.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: adminId, action: 'category.update', entity: 'Category', entityId: id, before, after });
    return after;
  }

  /** Soft delete: deactivate to preserve historical references. */
  async deactivateCategory(adminId: string, id: string) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    const after = await this.prisma.category.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ actorId: adminId, action: 'category.deactivate', entity: 'Category', entityId: id, before, after });
    return after;
  }

  async createService(adminId: string, dto: CreateServiceDto) {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    const service = await this.prisma.service.create({ data: dto });
    await this.audit.log({ actorId: adminId, action: 'service.create', entity: 'Service', entityId: service.id, after: service });
    return service;
  }

  async updateService(adminId: string, id: string, dto: UpdateServiceDto) {
    const before = await this.prisma.service.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Service not found');
    const after = await this.prisma.service.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: adminId, action: 'service.update', entity: 'Service', entityId: id, before, after });
    return after;
  }

  async deactivateService(adminId: string, id: string) {
    const before = await this.prisma.service.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Service not found');
    const after = await this.prisma.service.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ actorId: adminId, action: 'service.deactivate', entity: 'Service', entityId: id, before, after });
    return after;
  }
}
