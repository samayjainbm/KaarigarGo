import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;
  private errorLogged = false;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      // Back off, then give up after ~10 attempts so logs don't flood when Redis is down.
      retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 2000)),
    });

    this.client.on('ready', () => {
      this.errorLogged = false;
      this.logger.log('Connected to Redis');
    });

    this.client.on('error', (err) => {
      if (!this.errorLogged) {
        this.errorLogged = true;
        this.logger.warn(`Redis unavailable: ${err.message || 'connection refused'}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
