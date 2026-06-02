import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

/** Development SMS provider: logs the OTP instead of sending a real message. */
@Injectable()
export class DevSmsService extends SmsService {
  private readonly logger = new Logger('SMS(dev)');

  async sendOtp(phone: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phone}: ${code}`);
  }
}
