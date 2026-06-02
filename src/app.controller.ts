import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { ok } from './common/http/envelope';

@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return ok({ name: 'KaarigarGo API', version: '0.1.0', status: 'ok' });
  }
}
