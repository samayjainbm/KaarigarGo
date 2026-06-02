import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // rawBody: true exposes req.rawBody for payment webhook signature verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.enableShutdownHooks();
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  Logger.log(`KaarigarGo API running on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
