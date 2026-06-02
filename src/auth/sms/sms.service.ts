/**
 * SMS gateway abstraction. Swap the provider binding in AuthModule to plug in
 * MSG91 / Twilio later (complete DLT template registration for India first).
 */
export abstract class SmsService {
  abstract sendOtp(phone: string, code: string): Promise<void>;
}
