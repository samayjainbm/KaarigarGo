import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { MoneyModule } from '../money/money.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WorkersModule } from '../workers/workers.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [WorkersModule, RealtimeModule, ChatModule, MoneyModule],
  controllers: [BookingsController, MessagesController],
  providers: [BookingsService],
})
export class BookingsModule {}
