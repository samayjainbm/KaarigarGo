import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { DevSmsService } from './sms/dev-sms.service';
import { SmsService } from './sms/sms.service';

@Module({
  // Global so JwtService is available to the app-wide JwtAuthGuard.
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    { provide: SmsService, useClass: DevSmsService },
  ],
  exports: [AuthService],
})
export class AuthModule {}
