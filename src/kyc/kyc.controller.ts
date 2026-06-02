import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SubmitKycDto, submitKycSchema } from './dto/kyc.schemas';
import { KycService } from './kyc.service';

@Roles('WORKER')
@Controller('worker/kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    return ok(await this.kyc.listForWorker(userId));
  }

  @Post()
  async submit(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(submitKycSchema)) dto: SubmitKycDto,
  ) {
    return ok(await this.kyc.submit(userId, dto));
  }
}
