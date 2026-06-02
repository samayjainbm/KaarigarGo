import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, KycStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview() {
    const [settled, byStatus, workersTotal, workersOnline, customers, disputesOpen, disputesTotal, bookingsTotal] =
      await Promise.all([
        this.prisma.booking.aggregate({
          where: { status: 'SETTLED' },
          _sum: { finalPrice: true, commissionAmount: true },
          _count: true,
        }),
        this.prisma.booking.groupBy({ by: ['status'], _count: true }),
        this.prisma.workerProfile.count(),
        this.prisma.workerProfile.count({ where: { availabilityStatus: 'ONLINE' } }),
        this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
        this.prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
        this.prisma.dispute.count(),
        this.prisma.booking.count(),
      ]);

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) statusCounts[row.status] = row._count;

    return {
      gmv: settled._sum.finalPrice ?? 0,
      revenue: settled._sum.commissionAmount ?? 0,
      settledBookings: settled._count,
      bookingsTotal,
      statusCounts,
      workers: { total: workersTotal, online: workersOnline },
      customers,
      disputes: {
        open: disputesOpen,
        total: disputesTotal,
        rate: bookingsTotal ? Number((disputesTotal / bookingsTotal).toFixed(4)) : 0,
      },
    };
  }

  listUsers(role?: UserRole, q?: string, limit = 50, cursor?: string) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async suspendUser(adminId: string, userId: string, reason?: string) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('User not found');
    const after = await this.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    await this.audit.log({ actorId: adminId, action: 'user.suspend', entity: 'User', entityId: userId, before, after });
    return { ...after, reason };
  }

  async reinstateUser(adminId: string, userId: string) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('User not found');
    const after = await this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    await this.audit.log({ actorId: adminId, action: 'user.reinstate', entity: 'User', entityId: userId, before, after });
    return after;
  }

  async setRole(adminId: string, userId: string, role: UserRole) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('User not found');
    const after = await this.prisma.user.update({ where: { id: userId }, data: { role } });
    await this.audit.log({ actorId: adminId, action: 'user.set_role', entity: 'User', entityId: userId, before, after });
    return after;
  }

  listWorkers(q?: string, kycStatus?: KycStatus, limit = 50, cursor?: string) {
    return this.prisma.workerProfile.findMany({
      where: {
        ...(kycStatus ? { kycStatus } : {}),
        ...(q ? { user: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { name: true, phone: true, status: true } } },
    });
  }

  async featureWorker(adminId: string, workerId: string, isFeatured: boolean) {
    const wp = await this.prisma.workerProfile.findUnique({ where: { id: workerId } });
    if (!wp) throw new NotFoundException('Worker not found');
    const after = await this.prisma.workerProfile.update({ where: { id: workerId }, data: { isFeatured } });
    await this.audit.log({ actorId: adminId, action: 'worker.feature', entity: 'WorkerProfile', entityId: workerId, after });
    return after;
  }

  listBookings(filters: { status?: BookingStatus; from?: string; to?: string; limit?: number; cursor?: string }) {
    const { status, from, to, limit = 50, cursor } = filters;
    return this.prisma.booking.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        service: { select: { name: true } },
        worker: { select: { user: { select: { name: true } } } },
      },
    });
  }

  auditLogs(limit = 100, cursor?: string) {
    return this.audit.list(limit, cursor);
  }
}
