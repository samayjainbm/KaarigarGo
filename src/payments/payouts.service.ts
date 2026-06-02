import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../money/wallet.service';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  private async workerProfile(userId: string) {
    const wp = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (!wp) throw new ForbiddenException('No worker profile');
    return wp;
  }

  async earnings(userId: string) {
    const w = await this.wallet.getOrCreate(userId, 'WORKER');
    const credits = await this.prisma.walletTransaction.aggregate({
      where: { walletId: w.id, type: 'CREDIT' },
      _sum: { amount: true },
    });
    const pending = await this.prisma.payout.aggregate({
      where: { worker: { userId }, status: { in: ['QUEUED', 'PROCESSING'] } },
      _sum: { amount: true },
    });
    return {
      balance: w.balance,
      totalEarned: credits._sum.amount ?? 0,
      pendingPayouts: pending._sum.amount ?? 0,
      currency: w.currency,
    };
  }

  async request(userId: string, amount?: number) {
    const wp = await this.workerProfile(userId);
    const w = await this.wallet.getOrCreate(userId, 'WORKER');
    const amt = amount ?? w.balance;
    if (amt <= 0) throw new BadRequestException('Nothing available to withdraw');
    if (amt > w.balance) throw new BadRequestException('Amount exceeds available balance');

    return this.prisma.$transaction(async (tx) => {
      await this.wallet.record(tx, w.id, 'PAYOUT', -amt);
      return tx.payout.create({ data: { workerId: wp.id, amount: amt, status: 'QUEUED' } });
    });
  }

  async list(userId: string) {
    const wp = await this.workerProfile(userId);
    return this.prisma.payout.findMany({
      where: { workerId: wp.id },
      orderBy: { requestedAt: 'desc' },
    });
  }
}
