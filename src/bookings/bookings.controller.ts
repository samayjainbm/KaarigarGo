import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BookingsService } from './bookings.service';
import {
  AcceptQuoteDto,
  acceptQuoteSchema,
  CancelDto,
  cancelSchema,
  CreateBookingDto,
  createBookingSchema,
  QuoteDto,
  quoteSchema,
  SosDto,
  sosSchema,
  StatusUpdateDto,
  statusUpdateSchema,
  TrackDto,
  trackSchema,
} from './dto/booking.schemas';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Roles('CUSTOMER')
  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createBookingSchema)) dto: CreateBookingDto,
  ) {
    return ok(await this.bookings.create(userId, dto));
  }

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('status') status?: BookingStatus) {
    return ok(await this.bookings.listForUser(user, status));
  }

  @Get(':id')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(await this.bookings.getDetail(id, user));
  }

  @Roles('WORKER')
  @Post(':id/accept')
  @HttpCode(200)
  async accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(await this.bookings.accept(id, user));
  }

  @Roles('WORKER')
  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(await this.bookings.reject(id, user));
  }

  @Roles('WORKER')
  @Post(':id/status')
  @HttpCode(200)
  async status(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(statusUpdateSchema)) dto: StatusUpdateDto,
  ) {
    return ok(await this.bookings.updateStatus(id, user, dto));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(cancelSchema)) dto: CancelDto,
  ) {
    return ok(await this.bookings.cancel(id, user, dto));
  }

  @Roles('WORKER')
  @Post(':id/quote')
  async quote(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(quoteSchema)) dto: QuoteDto,
  ) {
    return ok(await this.bookings.createQuote(id, user, dto));
  }

  @Roles('CUSTOMER')
  @Post(':id/quote/accept')
  @HttpCode(200)
  async acceptQuote(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(acceptQuoteSchema)) dto: AcceptQuoteDto,
  ) {
    return ok(await this.bookings.acceptQuote(id, user, dto));
  }

  @Roles('WORKER')
  @Post(':id/track')
  @HttpCode(200)
  async track(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(trackSchema)) dto: TrackDto,
  ) {
    return ok(await this.bookings.track(id, user, dto));
  }

  @Roles('WORKER')
  @Post(':id/cash/confirm')
  @HttpCode(200)
  async cashConfirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(await this.bookings.cashConfirm(id, user));
  }

  @Post(':id/sos')
  @HttpCode(200)
  async sos(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(sosSchema)) dto: SosDto,
  ) {
    const location = dto.lat != null && dto.lng != null ? { lat: dto.lat, lng: dto.lng } : undefined;
    return ok(await this.bookings.sos(id, user, location));
  }
}
