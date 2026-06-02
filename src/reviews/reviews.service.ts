import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.schemas';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(bookingId: string, user: AuthUser, dto: CreateReviewDto) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { worker: { select: { id: true, userId: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');

    const isCustomer = b.customerId === user.id;
    const isWorker = b.worker?.userId === user.id;
    if (!isCustomer && !isWorker) throw new ForbiddenException('Not your booking');
    if (!['COMPLETED', 'SETTLED'].includes(b.status)) {
      throw new ConflictException('You can review only after the job is completed');
    }

    const revieweeId = isCustomer ? b.worker?.userId : b.customerId;
    if (!revieweeId) throw new BadRequestException('No counterpart to review');

    const dup = await this.prisma.review.findFirst({ where: { bookingId, reviewerId: user.id } });
    if (dup) throw new ConflictException('You already reviewed this booking');

    const review = await this.prisma.review.create({
      data: {
        bookingId,
        reviewerId: user.id,
        revieweeId,
        rating: dto.rating,
        comment: dto.comment,
        photoUrls: dto.photoUrls ?? [],
        isVerified: true, // tied to a completed booking
      },
    });

    // Recompute the worker's aggregate rating when a customer reviews them.
    if (isCustomer && b.worker) {
      await this.recompute(b.worker.id, revieweeId);
    }
    return review;
  }

  private async recompute(workerProfileId: string, workerUserId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { revieweeId: workerUserId },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.workerProfile.update({
      where: { id: workerProfileId },
      data: {
        ratingAvg: agg._avg.rating ?? 0,
        ratingCount: agg._count,
      },
    });
  }

  async listForWorker(workerId: string) {
    const wp = await this.prisma.workerProfile.findUnique({ where: { id: workerId } });
    if (!wp) throw new NotFoundException('Worker not found');
    return this.prisma.review.findMany({
      where: { revieweeId: wp.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        rating: true,
        comment: true,
        photoUrls: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }
}
