import { Injectable } from '@nestjs/common';
import { Prisma, WalletOwnerType, WalletTxnType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string, ownerType: WalletOwnerType, db: Db = this.prisma) {
    const existing = await db.wallet.findUnique({
      where: { userId_ownerType: { userId, ownerType } },
    });
    if (existing) return existing;
    return db.wallet.create({ data: { userId, ownerType } });
  }

  /**
   * Append a ledger entry and update the running balance, atomically.
   * `signedAmount` is positive for credits, negative for debits.
   */
  async record(
    tx: Prisma.TransactionClient,
    walletId: string,
    type: WalletTxnType,
    signedAmount: number,
    reference?: string,
  ): Promise<number> {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const newBalance = wallet.balance + signedAmount;
    await tx.walletTransaction.create({
      data: { walletId, type, amount: Math.abs(signedAmount), reference, runningBalance: newBalance },
    });
    await tx.wallet.update({ where: { id: walletId }, data: { balance: newBalance } });
    return newBalance;
  }

  async summary(userId: string, ownerType: WalletOwnerType) {
    return this.getOrCreate(userId, ownerType);
  }

  async transactions(userId: string, ownerType: WalletOwnerType, limit = 50, cursor?: string) {
    const wallet = await this.getOrCreate(userId, ownerType);
    const items = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      balance: wallet.balance,
    };
  }
}
