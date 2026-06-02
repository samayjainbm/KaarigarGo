import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WorkerSearchDto, workerSearchSchema } from './dto/worker.schemas';
import { WorkerDiscoveryService } from './worker-discovery.service';

@Controller('workers')
export class WorkerPublicController {
  constructor(private readonly discovery: WorkerDiscoveryService) {}

  @Public()
  @Get('search')
  async search(@Query(new ZodValidationPipe(workerSearchSchema)) q: WorkerSearchDto) {
    const results = await this.discovery.search(q);
    return ok(results, { count: results.length });
  }

  @Public()
  @Get(':id')
  async profile(@Param('id') id: string) {
    return ok(await this.discovery.publicProfile(id));
  }
}
