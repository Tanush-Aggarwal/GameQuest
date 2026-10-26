import { z } from 'zod';
import { usernameSchema } from './auth.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const PROFILE_PRIVACY = ['public', 'friends', 'private'];

export const usernameParamsSchema = z.object({ username: usernameSchema });
export const userIdParamsSchema = z.object({ userId: objectId });
export const friendshipIdParamsSchema = z.object({ id: objectId });

// Searching is by (a prefix of) the username; the identity of the searcher always comes from the cookie.
export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(24),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const friendRequestSchema = z.object({ username: usernameSchema });

export const privacySchema = z.object({ privacy: z.enum(PROFILE_PRIVACY) });

export const updateProfileSchema = z.object({
  bio: z.string().trim().max(300, 'Bio must be 300 characters or less').optional(),
  avatar: z.string().trim().url('Must be a valid URL').max(500).or(z.literal('')).nullable().optional(),
  favouriteGames: z.array(objectId).max(4, 'You can pick up to 4 favourite games').optional(),
});

export const pageQuerySchema = z.object({
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Activity types written by the activity subscribers.
export const ACTIVITY_TYPES = [
  'library.statusChanged',
  'review.created',
  'library.sessionLogged',
  'collection.created',
  'session.created',
];
