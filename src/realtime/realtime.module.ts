import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [ChatModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
