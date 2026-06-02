import { z } from 'zod';

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().email().optional(),
    avatarUrl: z.string().trim().url().optional(),
    locale: z.string().trim().min(2).max(10).optional(),
  })
  .strict();
export type UpdateMeDto = z.infer<typeof updateMeSchema>;

export const registerDeviceSchema = z
  .object({
    fcmToken: z.string().trim().min(1),
    platform: z.enum(['ANDROID', 'IOS', 'WEB']),
  })
  .strict();
export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;
