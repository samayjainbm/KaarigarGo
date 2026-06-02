import { z } from 'zod';

export const submitKycSchema = z
  .object({
    documents: z
      .array(
        z.object({
          docType: z.string().trim().min(2).max(40), // e.g. AADHAAR, PAN, DL
          fileUrl: z.string().url(),
        }),
      )
      .min(1)
      .max(5),
  })
  .strict();
export type SubmitKycDto = z.infer<typeof submitKycSchema>;

export const rejectKycSchema = z
  .object({ reason: z.string().trim().min(3).max(300) })
  .strict();
export type RejectKycDto = z.infer<typeof rejectKycSchema>;
