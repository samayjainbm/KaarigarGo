import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  RegisterDeviceDto,
  registerDeviceSchema,
  UpdateMeDto,
  updateMeSchema,
} from './dto/me.schemas';
import { UsersService } from './users.service';

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser('id') userId: string) {
    return ok(await this.users.getMe(userId));
  }

  @Patch()
  async update(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateMeSchema)) dto: UpdateMeDto,
  ) {
    return ok(await this.users.updateMe(userId, dto));
  }

  @Post('devices')
  async registerDevice(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(registerDeviceSchema)) dto: RegisterDeviceDto,
  ) {
    return ok(await this.users.registerDevice(userId, dto));
  }
}
