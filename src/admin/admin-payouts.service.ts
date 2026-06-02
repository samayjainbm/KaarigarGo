import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

@Injectable()
export class AdminPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(status?: PayoutStatus) {
    return this.prisma.payout.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: 'desc' },
      include: { worker: { select: { user: { select: { name: true, phone: true } } } } },
    });
  }

  private async transition(adminId: string, id: string, from: PayoutStatus[], to: PayoutStatus, providerRef?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!from.includes(payout.status)) {
      throw new ConflictException(`Cannot move payout from ${payout.status} to ${to}`);
    }
    const after = await this.prisma.payout.update({
      where: { id },
      data: {
        status: to,
        providerRef: providerRef ?? payout.providerRef,
        processedAt: to === 'PAID' ? new Date() : payout.processedAt,
      },
    });
    await this.audit.log({ actorId: adminId, action: `payout.${to.toLowerCase()}`, entity: 'Payout', entityId: id, before: payout, after });
    return after;
  }

  approve(adminId: string, id: string) {
    return this.transition(adminId, id, ['QUEUED'], 'PROCESSING');
  }

  markPaid(adminId: string, id: string, providerRef?: string) {
    return this.transition(adminId, id, ['QUEUED', 'PROCESSING'], 'PAID', providerRef);
  }

  retry(adminId: string, id: string) {
    return this.transition(adminId, id, ['FAILED'], 'QUEUED');
  }
}
