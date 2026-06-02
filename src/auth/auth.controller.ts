import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import {
  LogoutDto,
  logoutSchema,
  RefreshDto,
  refreshSchema,
  RequestOtpDto,
  requestOtpSchema,
  VerifyOtpDto,
  verifyOtpSchema,
} from './dto/auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body(new ZodValidationPipe(requestOtpSchema)) dto: RequestOtpDto) {
    return ok(await this.auth.requestOtp(dto.phone));
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto) {
    return ok(await this.auth.verifyOtp(dto.phone, dto.code, dto.role));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return ok(await this.auth.refresh(dto.refreshToken));
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto) {
    return ok(await this.auth.logout(dto.refreshToken, dto.allDevices));
  }
}
