import { z } from 'zod';

export const gameSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  genre: z.string().trim().min(1).max(50).optional(),
  platform: z.string().trim().min(1).max(50).optional(),
  maxHours: z.coerce.number().positive().max(1000).optional(),
  // At least this many hours to beat (main story); with maxHours it makes a range.
  minHours: z.coerce.number().positive().max(1000).optional(),
  // IGDB total rating, 0-100.
  minRating: z.coerce.number().min(0).max(100).optional(),
  // Release window (UTC dates, e.g. 2026-10-27): "new and upcoming" is releasedAfter a month or two ago.
  releasedAfter: z.coerce.date().optional(),
  releasedBefore: z.coerce.date().optional(),
  // Default order is popularity. "rating" is best rated first and has no further pages (shelves, not infinite lists).
  sort: z.enum(['popularity', 'rating']).default('popularity'),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).refine((q) => !(q.cursor && q.sort !== 'popularity'), { message: 'Only the popularity order can be paged', path: ['cursor'] })
  .refine((q) => !(q.releasedAfter && q.releasedBefore && q.releasedAfter > q.releasedBefore), { message: 'releasedAfter must not be later than releasedBefore', path: ['releasedAfter'] });

// The sign-in pages' cover collage: a handful of popular covers, no account needed.
export const publicCoversQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(40).default(24) });

export const gameSlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Invalid game slug'),
});

// "Wrong trailer?": the YouTube id of a trailer the game page showed.
export const trailerReportSchema = z.object({
  videoId: z.string().regex(/^[\w-]{11}$/, 'Invalid video id'),
});

// IGDB game_type ids. Only these are catalog games; DLC, bundles, mods, episodes, seasons, updates,
// packs and the like are never shown as games.
export const IGDB_GAME_TYPE = {
  mainGame: 0,
  dlcAddon: 1,
  expansion: 2,
  bundle: 3,
  standaloneExpansion: 4,
  mod: 5,
  episode: 6,
  season: 7,
  remake: 8,
  remaster: 9,
  expandedGame: 10,
  port: 11,
  fork: 12,
  pack: 13,
  update: 14,
};

export const CATALOG_GAME_TYPES = [
  IGDB_GAME_TYPE.mainGame,
  IGDB_GAME_TYPE.remake,
  IGDB_GAME_TYPE.remaster,
  IGDB_GAME_TYPE.expandedGame,
  IGDB_GAME_TYPE.port,
  IGDB_GAME_TYPE.standaloneExpansion,
];

// What the API returns for a game (server `toGameDto`).
export const gameDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  summary: z.string(),
  cover: z.string().nullable(),
  backdrop: z.string().nullable(),
  artworks: z.array(z.string()),
  screenshots: z.array(z.string()),
  videos: z.array(z.string()),
  developer: z.array(z.string()),
  publisher: z.array(z.string()),
  genres: z.array(z.string()),
  themes: z.array(z.string()),
  gameModes: z.array(z.string()),
  platforms: z.array(z.string()),
  storyline: z.string(),
  releaseDate: z.coerce.date().nullable(),
  timeToBeat: z.object({
    main: z.number().nullable(),
    extras: z.number().nullable(),
    full: z.number().nullable(),
  }),
  totalRating: z.number().nullable(),
  totalRatingCount: z.number(),
  popularity: z.number(),
  gameType: z.number().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number(),
});
