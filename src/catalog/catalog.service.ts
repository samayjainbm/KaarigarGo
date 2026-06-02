import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        services: { where: { isActive: true }, orderBy: { name: 'asc' } },
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async getCategory(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { services: { where: { isActive: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  listServices(categoryId?: string) {
    return this.prisma.service.findMany({
      where: { isActive: true, ...(categoryId ? { categoryId } : {}) },
      orderBy: { name: 'asc' },
    });
  }
}
