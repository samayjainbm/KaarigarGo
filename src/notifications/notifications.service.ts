import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
}

/**
 * Persists in-app notifications and fans out Expo push messages to a user's devices.
 * Real delivery needs Expo push tokens (from a dev/EAS build) registered via POST /me/devices.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Push');

  constructor(private readonly prisma: PrismaService) {}

  async notify(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    // Always record the in-app notification.
    await this.prisma.notification
      .create({
        data: {
          userId,
          channel: NotificationChannel.PUSH,
          type,
          title,
          body,
          data: (data as object) ?? undefined,
        },
      })
      .catch(() => undefined);

    const devices = await this.prisma.device.findMany({ where: { userId } });
    const messages: ExpoMessage[] = devices
      .filter((d) => /^Expo(nent)?PushToken\[/.test(d.fcmToken))
      .map((d) => ({ to: d.fcmToken, title, body, data: data ?? {}, sound: 'default' }));

    if (messages.length === 0) return;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
    } catch (e) {
      this.logger.warn(`Push send failed: ${(e as Error).message}`);
    }
  }
}
