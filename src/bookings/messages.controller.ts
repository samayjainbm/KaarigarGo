import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { ChatService } from '../chat/chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BookingsService } from './bookings.service';
import { MessageDto, messageSchema } from './dto/booking.schemas';

@Controller('bookings/:id/messages')
export class MessagesController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly chat: ChatService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  async list(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.bookings.assertParticipant(id, user);
    const res = await this.chat.list(id, limit ? Math.min(Number(limit), 100) : 50, cursor);
    return ok(res.items, { nextCursor: res.nextCursor });
  }

  @Post()
  async send(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(messageSchema)) dto: MessageDto,
  ) {
    await this.bookings.assertParticipant(id, user);
    const msg = await this.chat.create(id, user.id, dto.body, dto.attachmentUrl);
    this.realtime.emitToBooking(id, 'chat.message', msg);
    return ok(msg);
  }
}
