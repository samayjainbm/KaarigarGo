import { z } from 'zod';

export const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    photoUrls: z.array(z.string().url()).max(6).optional(),
  })
  .strict();
export type CreateReviewDto = z.infer<typeof createReviewSchema>;
