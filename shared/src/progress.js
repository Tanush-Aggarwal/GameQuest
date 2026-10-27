import { z } from 'zod';

// Manual progress is the user's own 0–100 number; synced achievement % and playtime are separate tracks.
export const manualProgressSchema = z.object({
  manualProgress: z.number().int().min(0).max(100),
});

// A play session the user logs by hand (date is a calendar day, YYYY-MM-DD, in the user's timezone).
export const playLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  minutes: z.number().int().min(1, 'At least 1 minute').max(24 * 60, 'At most 24 hours'),
  note: z.string().trim().max(500).optional(),
});

export const journalEntrySchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(2000),
});

// How many "what to play next" suggestions to return.
export const playNextQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(5),
});

export const journalIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id'),
  noteId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id'),
});
