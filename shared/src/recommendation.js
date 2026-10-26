import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const RECOMMENDATION_STATUSES = ['pending', 'accepted', 'declined', 'dismissed'];

export const createRecommendationSchema = z.object({
  toId: objectId,
  gameId: objectId,
  message: z.string().trim().max(500, 'Message cannot exceed 500 characters').default(''),
});

export const respondRecommendationSchema = z.object({
  status: z.enum(['accepted', 'declined', 'dismissed']),
  libraryStatus: z.enum(['backlog', 'wishlist', 'playing']).default('backlog'),
});

export const recommendationIdParamsSchema = z.object({
  id: objectId,
});

export const recommendationListQuerySchema = z.object({
  status: z.enum([...RECOMMENDATION_STATUSES, 'all']).default('pending'),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
