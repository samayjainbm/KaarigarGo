import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UpsertSkillDto, upsertSkillSchema } from './dto/worker.schemas';
import { WorkerSkillsService } from './worker-skills.service';

@Roles('WORKER')
@Controller('worker/skills')
export class WorkerSkillsController {
  constructor(private readonly skills: WorkerSkillsService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    return ok(await this.skills.list(userId));
  }

  @Post()
  async upsert(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(upsertSkillSchema)) dto: UpsertSkillDto,
  ) {
    return ok(await this.skills.upsert(userId, dto));
  }

  @Delete(':id')
  async remove(@CurrentUser('id') userId: string, @Param('id') skillId: string) {
    return ok(await this.skills.remove(userId, skillId));
  }
}
