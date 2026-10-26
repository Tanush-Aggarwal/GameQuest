import { z } from 'zod';

export const upsertReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(3000).optional(),
});

export const reviewListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Number(v), 50) : 20)),
});
