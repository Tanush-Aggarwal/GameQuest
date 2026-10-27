import { z } from 'zod';

export const LIBRARY_STATUSES = ['wishlist', 'backlog', 'playing', 'completed', 'dropped'];
export const LIBRARY_SORTS = ['default', 'title', 'playtime', 'progress', 'timeToBeat'];

// Wishlist → Backlog → Playing → Completed | Dropped, plus the "undo" moves players really make
// (pause a game, resume a dropped one, replay a completed one). The server enforces it; the client
// uses the same map to offer only valid moves.
export const LIBRARY_TRANSITIONS = {
  wishlist: ['backlog'],
  backlog: ['playing', 'dropped', 'wishlist'],
  playing: ['completed', 'dropped', 'backlog'],
  completed: ['playing'],
  dropped: ['backlog', 'playing'],
};

const objectId =z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const entryIdParamsSchema = z.object({ id: objectId });

// New entries start in wishlist, backlog or playing; the other statuses are reached by moving there.
export const addToLibrarySchema = z.object({
  gameId: objectId,
  status: z.enum(['wishlist', 'backlog', 'playing']).default('backlog'),
  platform: z.string().trim().min(1).max(50).optional(),
});

export const libraryListQuerySchema = z.object({
  status: z.enum(LIBRARY_STATUSES).optional(),
  gameId: objectId.optional(),
  // Filters on the game (genre, title search) and on where it is owned.
  genre: z.string().trim().min(1).max(50).optional(),
  platform: z.string().trim().min(1).max(50).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(LIBRARY_SORTS).default('default').optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const changeStatusSchema = z.object({ status: z.enum(LIBRARY_STATUSES) });

export const visibilitySchema = z.object({ hiddenFromFriends: z.boolean() });
