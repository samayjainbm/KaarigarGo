import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface SearchParams {
  lat: number;
  lng: number;
  categoryId?: string;
  limit: number;
}

@Injectable()
export class WorkerDiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ranked nearby workers: distance, then rating, then reliability. */
  async search({ lat, lng, categoryId, limit }: SearchParams) {
    const join = categoryId
      ? 'JOIN worker_skills ws ON ws."workerId" = wp.id AND ws."categoryId" = $4'
      : '';
    const params: unknown[] = categoryId ? [lng, lat, limit, categoryId] : [lng, lat, limit];

    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT wp.id AS "workerId", wp."userId" AS "userId", u.name AS "name", u."avatarUrl" AS "avatarUrl",
              wp."ratingAvg" AS "ratingAvg", wp."ratingCount" AS "ratingCount",
              wp."reliabilityScore" AS "reliabilityScore", wp."completedJobs" AS "completedJobs",
              wp."availabilityStatus" AS "availabilityStatus", wp."isFeatured" AS "isFeatured",
              ROUND(ST_Distance(wp.base_location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)::numeric, 0) AS "distanceM"
         FROM worker_profiles wp
         JOIN users u ON u.id = wp."userId"
         ${join}
        WHERE wp."kycStatus" = 'APPROVED'
          AND wp.base_location IS NOT NULL
          AND ST_DWithin(wp.base_location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, wp."serviceRadiusKm" * 1000)
        ORDER BY "distanceM" ASC, wp."ratingAvg" DESC, wp."reliabilityScore" DESC
        LIMIT $3`,
      ...params,
    );

    return rows.map((r) => ({
      workerId: r.workerId,
      userId: r.userId,
      name: r.name,
      avatarUrl: r.avatarUrl,
      ratingAvg: Number(r.ratingAvg),
      ratingCount: Number(r.ratingCount),
      reliabilityScore: Number(r.reliabilityScore),
      completedJobs: Number(r.completedJobs),
      availabilityStatus: r.availabilityStatus,
      isFeatured: r.isFeatured,
      distanceM: Number(r.distanceM),
    }));
  }

  /** Nearest ONLINE, KYC-approved worker with the matching skill (for instant booking). */
  async findBestWorkerId(categoryId: string, lat: number, lng: number): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ workerId: string }[]>(
      `SELECT wp.id AS "workerId"
         FROM worker_profiles wp
         JOIN worker_skills ws ON ws."workerId" = wp.id AND ws."categoryId" = $3
        WHERE wp."availabilityStatus" = 'ONLINE'
          AND wp."kycStatus" = 'APPROVED'
          AND wp.base_location IS NOT NULL
          AND ST_DWithin(wp.base_location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, wp."serviceRadiusKm" * 1000)
        ORDER BY ST_Distance(wp.base_location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) ASC,
                 wp."ratingAvg" DESC, wp."reliabilityScore" DESC
        LIMIT 1`,
      lng,
      lat,
      categoryId,
    );
    return rows[0]?.workerId ?? null;
  }

  async publicProfile(workerId: string) {
    const p = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      include: {
        user: { select: { name: true, avatarUrl: true } },
        skills: { include: { category: { select: { name: true, slug: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Worker not found');

    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: p.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { rating: true, comment: true, photoUrls: true, isVerified: true, createdAt: true },
    });

    return {
      id: p.id,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      bio: p.bio,
      yearsExperience: p.yearsExperience,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      completedJobs: p.completedJobs,
      availabilityStatus: p.availabilityStatus,
      kycStatus: p.kycStatus,
      skills: p.skills.map((s) => ({
        category: s.category,
        priceType: s.priceType,
        basePrice: s.basePrice,
      })),
      reviews,
    };
  }
}
