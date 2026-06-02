import { z } from 'zod';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const createBookingSchema = z
  .object({
    serviceId: z.string().uuid(),
    lat,
    lng,
    addressId: z.string().uuid().optional(),
    scheduledAt: z.string().datetime().optional(), // ISO 8601; omit for instant booking
    paymentMode: z.enum(['ONLINE', 'CASH']).default('ONLINE'),
    workerId: z.string().uuid().optional(),
    isRecurring: z.boolean().optional(),
    recurrenceRule: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const statusUpdateSchema = z
  .object({
    status: z.enum(['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED']),
    finalPrice: z.number().int().min(0).optional(),
    photoUrls: z.array(z.string().url()).max(10).optional(),
  })
  .strict();
export type StatusUpdateDto = z.infer<typeof statusUpdateSchema>;

export const cancelSchema = z
  .object({ reason: z.string().max(300).optional() })
  .strict();
export type CancelDto = z.infer<typeof cancelSchema>;

export const quoteSchema = z
  .object({ amount: z.number().int().min(0), notes: z.string().max(500).optional() })
  .strict();
export type QuoteDto = z.infer<typeof quoteSchema>;

export const acceptQuoteSchema = z.object({ quoteId: z.string().uuid() }).strict();
export type AcceptQuoteDto = z.infer<typeof acceptQuoteSchema>;

export const trackSchema = z.object({ lat, lng }).strict();
export type TrackDto = z.infer<typeof trackSchema>;

export const sosSchema = z.object({ lat: lat.optional(), lng: lng.optional() }).strict();
export type SosDto = z.infer<typeof sosSchema>;

export const messageSchema = z
  .object({
    body: z.string().max(2000).optional(),
    attachmentUrl: z.string().url().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.body || v.attachmentUrl), {
    message: 'body or attachmentUrl is required',
  });
export type MessageDto = z.infer<typeof messageSchema>;
