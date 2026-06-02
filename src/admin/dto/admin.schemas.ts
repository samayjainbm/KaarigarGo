import { z } from 'zod';

export const suspendSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();
export type SuspendDto = z.infer<typeof suspendSchema>;

export const featureSchema = z.object({ isFeatured: z.boolean() }).strict();
export type FeatureDto = z.infer<typeof featureSchema>;

export const setRoleSchema = z
  .object({ role: z.enum(['CUSTOMER', 'WORKER', 'OPS_ADMIN', 'SUPER_ADMIN']) })
  .strict();
export type SetRoleDto = z.infer<typeof setRoleSchema>;

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase, alphanumeric, hyphenated'),
    parentId: z.string().uuid().optional(),
    iconUrl: z.string().url().optional(),
    sortOrder: z.number().int().min(0).optional(),
    defaultCommissionPct: z.number().min(0).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().strict();
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

export const createServiceSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional(),
    defaultDurationMin: z.number().int().min(5).max(1440).optional(),
    priceModel: z.enum(['FIXED', 'HOURLY', 'QUOTE']).optional(),
    basePrice: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateServiceDto = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial().omit({ categoryId: true }).strict();
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>;

export const commissionRuleSchema = z
  .object({
    scope: z.enum(['GLOBAL', 'CATEGORY', 'WORKER_TIER']),
    categoryId: z.string().uuid().optional(),
    workerTier: z.string().trim().max(40).optional(),
    pct: z.number().min(0).max(100),
    fixedFee: z.number().int().min(0).optional(),
    effectiveFrom: z.string().datetime().optional(),
  })
  .strict();
export type CommissionRuleDto = z.infer<typeof commissionRuleSchema>;

export const markPaidSchema = z.object({ providerRef: z.string().trim().max(120).optional() }).strict();
export type MarkPaidDto = z.infer<typeof markPaidSchema>;
