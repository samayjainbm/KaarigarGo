import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ok } from '../common/http/envelope';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  async categories() {
    return ok(await this.catalog.listCategories());
  }

  @Public()
  @Get('categories/:slug')
  async category(@Param('slug') slug: string) {
    return ok(await this.catalog.getCategory(slug));
  }

  @Public()
  @Get('services')
  async services(@Query('categoryId') categoryId?: string) {
    return ok(await this.catalog.listServices(categoryId));
  }
}
