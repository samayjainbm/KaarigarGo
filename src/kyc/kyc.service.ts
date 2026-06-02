import { Injectable, NotFoundException } from '@nestjs/common';
import { KycDocStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SubmitKycDto } from './dto/kyc.schemas';

/**
 * KYC handling stores document *references/metadata* only (never raw IDs/scans).
 * Use a licensed/authorised KYC provider for real verification (see spec §0/§14).
 */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async profile(userId: string) {
    const p = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (!p) throw new NotFoundException('Create your worker profile first');
    return p;
  }

  async submit(userId: string, dto: SubmitKycDto) {
    const p = await this.profile(userId);
    await this.prisma.kycDocument.createMany({
      data: dto.documents.map((d) => ({ workerId: p.id, docType: d.docType, fileUrl: d.fileUrl })),
    });
    if (p.kycStatus === 'NONE' || p.kycStatus === 'REJECTED') {
      await this.prisma.workerProfile.update({ where: { id: p.id }, data: { kycStatus: 'PENDING' } });
    }
    return this.listForWorker(userId);
  }

  async listForWorker(userId: string) {
    const p = await this.profile(userId);
    return this.prisma.kycDocument.findMany({
      where: { workerId: p.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async queue(status: KycDocStatus = 'PENDING') {
    return this.prisma.kycDocument.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      include: {
        worker: {
          select: { id: true, user: { select: { name: true, phone: true } } },
        },
      },
    });
  }

  async approve(docId: string, adminId: string) {
    const doc = await this.prisma.kycDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');

    await this.prisma.kycDocument.update({
      where: { id: docId },
      data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
    });
    await this.prisma.workerProfile.update({
      where: { id: doc.workerId },
      data: { kycStatus: 'APPROVED' },
    });

    const wp = await this.prisma.workerProfile.findUnique({ where: { id: doc.workerId } });
    if (wp) this.realtime.emitToUser(wp.userId, 'kyc.updated', { status: 'APPROVED' });
    return { approved: true };
  }

  async reject(docId: string, adminId: string, reason: string) {
    const doc = await this.prisma.kycDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');

    await this.prisma.kycDocument.update({
      where: { id: docId },
      data: { status: 'REJECTED', reviewedBy: adminId, reviewedAt: new Date(), rejectionReason: reason },
    });

    const approvedCount = await this.prisma.kycDocument.count({
      where: { workerId: doc.workerId, status: 'APPROVED' },
    });
    if (approvedCount === 0) {
      await this.prisma.workerProfile.update({
        where: { id: doc.workerId },
        data: { kycStatus: 'REJECTED' },
      });
    }

    const wp = await this.prisma.workerProfile.findUnique({ where: { id: doc.workerId } });
    if (wp) this.realtime.emitToUser(wp.userId, 'kyc.updated', { status: 'REJECTED', reason });
    return { rejected: true };
  }
}
