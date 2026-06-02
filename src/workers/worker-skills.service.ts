import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertSkillDto } from './dto/worker.schemas';

@Injectable()
export class WorkerSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  private async profileId(userId: string): Promise<string> {
    const p = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (!p) throw new NotFoundException('Create your worker profile first');
    return p.id;
  }

  async list(userId: string) {
    const workerId = await this.profileId(userId);
    return this.prisma.workerSkill.findMany({
      where: { workerId },
      include: { category: { select: { name: true, slug: true } } },
    });
  }

  async upsert(userId: string, dto: UpsertSkillDto) {
    const workerId = await this.profileId(userId);
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Unknown category');

    return this.prisma.workerSkill.upsert({
      where: { workerId_categoryId: { workerId, categoryId: dto.categoryId } },
      update: { priceType: dto.priceType, basePrice: dto.basePrice ?? 0 },
      create: {
        workerId,
        categoryId: dto.categoryId,
        priceType: dto.priceType,
        basePrice: dto.basePrice ?? 0,
      },
    });
  }

  async remove(userId: string, skillId: string) {
    const workerId = await this.profileId(userId);
    const skill = await this.prisma.workerSkill.findUnique({ where: { id: skillId } });
    if (!skill || skill.workerId !== workerId) throw new NotFoundException('Skill not found');
    await this.prisma.workerSkill.delete({ where: { id: skillId } });
    return { deleted: true };
  }
}
