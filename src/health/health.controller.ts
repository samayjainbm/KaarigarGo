import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ok } from '../common/http/envelope';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    const checks = { api: 'ok', db: 'down', redis: 'down' };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';
    } catch {
      checks.db = 'down';
    }

    try {
      checks.redis = (await this.redis.ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      checks.redis = 'down';
    }

    const healthy = checks.db === 'ok' && checks.redis === 'ok';

    return ok({
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}
