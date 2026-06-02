import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { WalletService } from '../money/wallet.service';
import { PrismaService } from '../prisma/prisma.service';

const REWARD_PAISE = 5000; // ₹50 credit to both parties

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  private generateCode(userId: string): string {
    const hex = userId.replace(/-/g, '').slice(0, 9);
    return 'KG' + parseInt(hex, 16).toString(36).toUpperCase().slice(0, 7);
  }

  /** Each user has one reusable code, held on a referee-less row. */
  async myCode(userId: string) {
    let holder = await this.prisma.referral.findFirst({
      where: { referrerId: userId, refereeId: null },
    });
    if (!holder) {
      holder = await this.prisma.referral.create({
        data: { referrerId: userId, code: this.generateCode(userId), status: 'PENDING' },
      });
    }
    const referrals = await this.prisma.referral.count({
      where: { referrerId: userId, refereeId: { not: null } },
    });
    return { code: holder.code, referrals, rewardPerReferral: REWARD_PAISE };
  }

  async apply(refereeId: string, code: string) {
    const holder = await this.prisma.referral.findFirst({ where: { code, refereeId: null } });
    if (!holder) throw new BadRequestException('Invalid referral code');
    if (holder.referrerId === refereeId) throw new BadRequestException('You cannot use your own code');

    const already = await this.prisma.referral.findFirst({ where: { refereeId } });
    if (already) throw new ConflictException('A referral code was already applied to this account');

    const referrerWallet = await this.wallet.getOrCreate(holder.referrerId, 'CUSTOMER');
    const refereeWallet = await this.wallet.getOrCreate(refereeId, 'CUSTOMER');
    const appliedCode = `${code}:${refereeId.slice(0, 8)}`;

    const referral = await this.prisma.$transaction(async (tx) => {
      const r = await tx.referral.create({
        data: {
          referrerId: holder.referrerId,
          refereeId,
          code: appliedCode,
          status: 'REWARDED',
          rewardAmount: REWARD_PAISE,
        },
      });
      await this.wallet.record(tx, referrerWallet.id, 'REFERRAL', REWARD_PAISE, r.id);
      await this.wallet.record(tx, refereeWallet.id, 'REFERRAL', REWARD_PAISE, r.id);
      return r;
    });

    return { applied: true, reward: REWARD_PAISE, referralId: referral.id };
  }
}
