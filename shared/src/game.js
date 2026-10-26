import { z } from 'zod';

export const gameSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  genre: z.string().trim().min(1).max(50).optional(),
  platform: z.string().trim().min(1).max(50).optional(),
  maxHours: z.coerce.number().positive().max(1000).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const gameSlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Invalid game slug'),
});
