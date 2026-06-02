import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve commission (in paise) for a booking amount.
   * Precedence: CATEGORY rule → GLOBAL rule → category.defaultCommissionPct → 15%.
   */
  async compute(categoryId: string, amountPaise: number): Promise<number> {
    const now = new Date();
    let pct: number;
    let fixed: number;

    const categoryRule = await this.prisma.commissionRule.findFirst({
      where: { scope: 'CATEGORY', categoryId, effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (categoryRule) {
      pct = categoryRule.pct;
      fixed = categoryRule.fixedFee;
    } else {
      const globalRule = await this.prisma.commissionRule.findFirst({
        where: { scope: 'GLOBAL', effectiveFrom: { lte: now } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (globalRule) {
        pct = globalRule.pct;
        fixed = globalRule.fixedFee;
      } else {
        const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
        pct = category?.defaultCommissionPct ?? 15;
        fixed = 0;
      }
    }

    const commission = Math.round((amountPaise * pct) / 100) + fixed;
    return Math.max(0, Math.min(commission, amountPaise));
  }
}
