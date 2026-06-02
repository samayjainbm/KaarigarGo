import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto, UpdateMeDto } from './dto/me.schemas';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        workerProfile: {
          select: { id: true, kycStatus: true, availabilityStatus: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.shape(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
      return this.shape({ ...user, workerProfile: null });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw e;
    }
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const device = await this.prisma.device.upsert({
      where: { fcmToken: dto.fcmToken },
      update: { userId, platform: dto.platform, lastSeen: new Date() },
      create: { userId, fcmToken: dto.fcmToken, platform: dto.platform },
    });
    return { id: device.id, platform: device.platform, registered: true };
  }

  private shape(user: {
    id: string;
    role: string;
    phone: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    locale: string;
    status: string;
    workerProfile?: unknown;
  }) {
    return {
      id: user.id,
      role: user.role,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      status: user.status,
      workerProfile: user.workerProfile ?? null,
    };
  }
}
