import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Phone must be E.164 format, e.g. +919000000000');

// Self-signup roles only — admins are provisioned separately.
const signupRole = z.enum(['CUSTOMER', 'WORKER']);

export const requestOtpSchema = z
  .object({
    phone,
    role: signupRole.optional(),
  })
  .strict();
export type RequestOtpDto = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z
  .object({
    phone,
    code: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits'),
    role: signupRole.optional(),
  })
  .strict();
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(10),
  })
  .strict();
export type RefreshDto = z.infer<typeof refreshSchema>;

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(10),
    allDevices: z.boolean().optional(),
  })
  .strict();
export type LogoutDto = z.infer<typeof logoutSchema>;
