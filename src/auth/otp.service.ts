import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import { RedisService } from '../redis/redis.service';

const OTP_TTL_SEC = 300; // OTP valid for 5 minutes
const MAX_ATTEMPTS = 5; // wrong tries before the code is burned
const COOLDOWN_SEC = 30; // min gap between requests for a number
const HOURLY_CAP = 5; // max requests per number per hour

/**
 * Phone OTP issuance + verification backed by Redis.
 * Codes are stored hashed (never in plaintext) with bounded attempts and rate limits.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private hash(phone: string, code: string): string {
    const pepper = this.config.get<string>('JWT_ACCESS_SECRET') ?? 'pepper';
    return createHash('sha256').update(`${phone}:${code}:${pepper}`).digest('hex');
  }

  /** Generates, stores and returns a fresh 6-digit code (caller delivers it). */
  async issue(phone: string): Promise<string> {
    const client = this.redis.client;

    const cooldownKey = `otp:cooldown:${phone}`;
    if (await client.get(cooldownKey)) {
      throw new HttpException(
        'Please wait before requesting another OTP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const countKey = `otp:count:${phone}`;
    const count = await client.incr(countKey);
    if (count === 1) await client.expire(countKey, 3600);
    if (count > HOURLY_CAP) {
      throw new HttpException(
        'Too many OTP requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const key = `otp:${phone}`;
    await client.del(key);
    await client.hset(key, { hash: this.hash(phone, code), attempts: '0' });
    await client.expire(key, OTP_TTL_SEC);
    await client.set(cooldownKey, '1', 'EX', COOLDOWN_SEC);

    return code;
  }

  /** Verifies a code; throws on any failure, resolves on success (and burns the code). */
  async verify(phone: string, code: string): Promise<void> {
    const client = this.redis.client;
    const key = `otp:${phone}`;
    const record = await client.hgetall(key);

    if (!record || !record.hash) {
      throw new BadRequestException('No active OTP for this number, or it has expired');
    }

    if (record.hash !== this.hash(phone, code)) {
      const attempts = await client.hincrby(key, 'attempts', 1);
      if (attempts >= MAX_ATTEMPTS) {
        await client.del(key);
      }
      throw new UnauthorizedException('Invalid OTP');
    }

    await client.del(key);
  }
}
