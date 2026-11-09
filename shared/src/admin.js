import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const adminIdParamsSchema = z.object({ id: objectId });
export const adminSearchQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  hidden: z.enum(['all', 'visible', 'hidden']).optional().default('all'),
});

// A header picture chosen in the header editor: an https image, framed by a focus point (0-100 %) and a zoom.
export const heroOverrideSchema = z.object({
  url: z
    .string()
    .trim()
    .url('Use a full image link')
    .max(600)
    .refine((u) => u.startsWith('https://'), 'The image link must start with https://'),
  posX: z.number().min(0).max(100).default(50),
  posY: z.number().min(0).max(100).default(30),
  zoom: z.number().min(1).max(2.5).default(1),
});

export const adminGameUpdateSchema = z
  .object({
    title: z.string().trim().min(1, 'A title is required').max(160).optional(),
    hidden: z.boolean().optional(),
    heroOverride: heroOverrideSchema.nullable().optional(), // null = back to automatic
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const adminRoleSchema = z.object({ role: z.enum(['user', 'admin']) });
export const adminTrailerSchema = z.object({ videoId: z.string().regex(/^(?:[\w-]{11}|steam-\d{1,12})$/, 'Invalid video id') });
