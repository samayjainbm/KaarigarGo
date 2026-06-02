import { z } from 'zod';

export const applyReferralSchema = z
  .object({ code: z.string().trim().min(4).max(40) })
  .strict();
export type ApplyReferralDto = z.infer<typeof applyReferralSchema>;
