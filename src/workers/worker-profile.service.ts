import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkerProfileDto, UpdateWorkerProfileDto } from './dto/worker.schemas';

@Injectable()
export class WorkerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkerProfileDto) {
    const existing = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException('Worker profile already exists; use PATCH to update');
    }

    const profile = await this.prisma.workerProfile.create({
      data: {
        userId,
        bio: dto.bio,
        yearsExperience: dto.yearsExperience ?? 0,
        serviceRadiusKm: dto.serviceRadiusKm ?? 10,
      },
    });

    if (dto.lat != null && dto.lng != null) {
      await this.setLocation(profile.id, dto.lat, dto.lng);
    }
    return this.get(profile.id);
  }

  async update(userId: string, dto: UpdateWorkerProfileDto) {
    const existing = await this.prisma.workerProfile.findUnique({ where: { userId } });
    if (!existing) {
      throw new NotFoundException('Worker profile not found; create it first');
    }

    // Workers must pass KYC before they can go online.
    if (dto.availabilityStatus === 'ONLINE' && existing.kycStatus !== 'APPROVED') {
      throw new ForbiddenException('Complete KYC verification before going online');
    }

    const { lat, lng, ...rest } = dto;
    await this.prisma.workerProfile.update({ where: { id: existing.id }, data: rest });

    if (lat != null && lng != null) {
      await this.setLocation(existing.id, lat, lng);
    }
    return this.get(existing.id);
  }

  /** Sets the PostGIS base_location point (lng, lat order for ST_MakePoint). */
  private async setLocation(profileId: string, lat: number, lng: number): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE worker_profiles SET base_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
      lng,
      lat,
      profileId,
    );
  }

  private async get(profileId: string) {
    const p = await this.prisma.workerProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: { skills: true },
    });

    const rows = await this.prisma.$queryRawUnsafe<{ lat: number | null; lng: number | null }[]>(
      `SELECT ST_Y(base_location::geometry) AS lat, ST_X(base_location::geometry) AS lng
         FROM worker_profiles WHERE id = $1`,
      profileId,
    );
    const loc = rows[0];

    return {
      id: p.id,
      userId: p.userId,
      bio: p.bio,
      yearsExperience: p.yearsExperience,
      serviceRadiusKm: p.serviceRadiusKm,
      availabilityStatus: p.availabilityStatus,
      kycStatus: p.kycStatus,
      reliabilityScore: p.reliabilityScore,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      completedJobs: p.completedJobs,
      location: loc?.lat != null ? { lat: loc.lat, lng: loc.lng } : null,
      skills: p.skills,
    };
  }
}
