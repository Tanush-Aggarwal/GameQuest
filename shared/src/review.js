import { z } from 'zod';

export const upsertReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(3000).optional(),
});

