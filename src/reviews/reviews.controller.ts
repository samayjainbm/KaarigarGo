import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ok } from '../common/http/envelope';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateReviewDto, createReviewSchema } from './dto/review.schemas';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('bookings/:id/review')
  async create(
    @Param('id') bookingId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createReviewSchema)) dto: CreateReviewDto,
  ) {
    return ok(await this.reviews.create(bookingId, user, dto));
  }

  @Public()
  @Get('workers/:id/reviews')
  async listForWorker(@Param('id') workerId: string) {
    return ok(await this.reviews.listForWorker(workerId));
  }
}
