import { z } from 'zod';

export const createOrderSchema = z.object({ bookingId: z.string().uuid() }).strict();
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const payoutRequestSchema = z
  .object({ amount: z.number().int().positive().optional() })
  .strict();
export type PayoutRequestDto = z.infer<typeof payoutRequestSchema>;
