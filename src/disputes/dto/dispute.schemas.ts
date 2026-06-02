import { z } from 'zod';

export const raiseDisputeSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
    evidenceUrls: z.array(z.string().url()).max(10).optional(),
  })
  .strict();
export type RaiseDisputeDto = z.infer<typeof raiseDisputeSchema>;

export const resolveDisputeSchema = z
  .object({
    resolution: z.enum(['REFUND_CUSTOMER', 'CREDIT_CUSTOMER', 'DISMISS']),
    amount: z.number().int().positive().optional(), // paise; defaults to booking price
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();
export type ResolveDisputeDto = z.infer<typeof resolveDisputeSchema>;
