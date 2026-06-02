import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { CommissionRuleDto } from './dto/admin.schemas';

@Injectable()
export class AdminCommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.commissionRule.findMany({ orderBy: [{ scope: 'asc' }, { effectiveFrom: 'desc' }] });
  }

  async create(adminId: string, dto: CommissionRuleDto) {
    if (dto.scope === 'CATEGORY' && !dto.categoryId) {
      throw new BadRequestException('categoryId is required for CATEGORY scope');
    }
    if (dto.scope === 'WORKER_TIER' && !dto.workerTier) {
      throw new BadRequestException('workerTier is required for WORKER_TIER scope');
    }
    const rule = await this.prisma.commissionRule.create({
      data: {
        scope: dto.scope,
        categoryId: dto.categoryId,
        workerTier: dto.workerTier,
        pct: dto.pct,
        fixedFee: dto.fixedFee ?? 0,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      },
    });
    await this.audit.log({ actorId: adminId, action: 'commission.create', entity: 'CommissionRule', entityId: rule.id, after: rule });
    return rule;
  }
}
