import { Module } from '@nestjs/common';
import { WorkerDiscoveryService } from './worker-discovery.service';
import { WorkerProfileController } from './worker-profile.controller';
import { WorkerProfileService } from './worker-profile.service';
import { WorkerPublicController } from './worker-public.controller';
import { WorkerSkillsController } from './worker-skills.controller';
import { WorkerSkillsService } from './worker-skills.service';

@Module({
  controllers: [WorkerProfileController, WorkerSkillsController, WorkerPublicController],
  providers: [WorkerProfileService, WorkerSkillsService, WorkerDiscoveryService],
  exports: [WorkerDiscoveryService],
})
export class WorkersModule {}
