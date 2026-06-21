import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateOrderDto, createOrderSchema } from './dto/payment.schemas';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles('CUSTOMER')
  @Post('order')
  @HttpCode(200)
  async order(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto,
  ) {
    return ok(await this.payments.createOrder(user, dto.bookingId));
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    return ok(await this.payments.handleWebhook(req.rawBody, signature, req.body));
  }

  @Public()
  @Post('order/:orderId/mock-pay')
  @HttpCode(200)
  async mockPay(@Param('orderId') orderId: string) {
    return ok(await this.payments.mockPay(orderId));
  }

  @Roles('CUSTOMER')
  @Post('upi/qr')
  @HttpCode(200)
  async upiQr(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto,
  ) {
    return ok(await this.payments.createUpiQr(user, dto.bookingId));
  }

  // Either the customer or the assigned worker may confirm a UPI transfer.
  @Post('upi/confirm')
  @HttpCode(200)
  async upiConfirm(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto,
  ) {
    return ok(await this.payments.confirmUpi(user, dto.bookingId));
  }
}
