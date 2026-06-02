import { Body, Controller, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateWorkerProfileDto,
  createWorkerProfileSchema,
  UpdateWorkerProfileDto,
  updateWorkerProfileSchema,
} from './dto/worker.schemas';
import { WorkerProfileService } from './worker-profile.service';

@Roles('WORKER')
@Controller('worker/profile')
export class WorkerProfileController {
  constructor(private readonly service: WorkerProfileService) {}

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createWorkerProfileSchema)) dto: CreateWorkerProfileDto,
  ) {
    return ok(await this.service.create(userId, dto));
  }

  @Patch()
  async update(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateWorkerProfileSchema)) dto: UpdateWorkerProfileDto,
  ) {
    return ok(await this.service.update(userId, dto));
  }
}
