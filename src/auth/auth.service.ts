import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JwtAccessPayload, JwtRefreshPayload } from './auth.types';
import { OtpService } from './otp.service';
import { SmsService } from './sms/sms.service';

type SignupRole = 'CUSTOMER' | 'WORKER';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(phone: string) {
    const code = await this.otp.issue(phone);
    await this.sms.sendOtp(phone, code);
    return {
      sent: true,
      expiresInSec: 300,
      // Demo mode: no SMS provider is configured, so always surface the code in the
      // response. The mobile app auto-fills it on the login screen. Replace SmsService
      // with a real provider (and drop devOtp) before exposing this to real users.
      devOtp: code,
    };
  }

  async verifyOtp(phone: string, code: string, role?: SignupRole) {
    await this.otp.verify(phone, code);

    let user = await this.prisma.user.findUnique({ where: { phone } });
    const isNew = !user;
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, role: (role as UserRole) ?? 'CUSTOMER' },
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account suspended');
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.publicUser(user), isNew, ...tokens };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefresh(refreshToken);

    const key = `refresh:${payload.sub}:${payload.jti}`;
    const exists = await this.redis.client.get(key);
    if (!exists) throw new UnauthorizedException('Refresh token revoked or expired');

    // Rotate: invalidate the presented token before issuing a new pair.
    await this.redis.client.del(key);
    await this.redis.client.srem(`refresh:jtis:${payload.sub}`, payload.jti);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account unavailable');
    }
    return this.issueTokens(user.id, user.role);
  }

  async logout(refreshToken: string, allDevices = false) {
    try {
      const payload = await this.verifyRefresh(refreshToken);
      if (allDevices) {
        const setKey = `refresh:jtis:${payload.sub}`;
        const jtis = await this.redis.client.smembers(setKey);
        const keys = jtis.map((jti) => `refresh:${payload.sub}:${jti}`);
        if (keys.length) await this.redis.client.del(...keys);
        await this.redis.client.del(setKey);
      } else {
        await this.redis.client.del(`refresh:${payload.sub}:${payload.jti}`);
        await this.redis.client.srem(`refresh:jtis:${payload.sub}`, payload.jti);
      }
    } catch {
      // Logout is idempotent — an already-invalid token is treated as success.
    }
    return { success: true };
  }

  private async verifyRefresh(token: string): Promise<JwtRefreshPayload> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return payload;
  }

  private async issueTokens(userId: string, role: UserRole) {
    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL') ?? 900;
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL') ?? 2592000;
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: userId, role, type: 'access' } satisfies JwtAccessPayload,
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti, type: 'refresh' } satisfies JwtRefreshPayload,
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: refreshTtl },
    );

    await this.redis.client.set(`refresh:${userId}:${jti}`, '1', 'EX', refreshTtl);
    await this.redis.client.sadd(`refresh:jtis:${userId}`, jti);

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: accessTtl };
  }

  private publicUser(user: User) {
    return {
      id: user.id,
      role: user.role,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      status: user.status,
    };
  }
}
