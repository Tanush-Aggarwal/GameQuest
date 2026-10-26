import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const SESSION_VISIBILITIES = ['friends', 'invite'];
export const RSVP_RESPONSES = ['going', 'maybe', 'declined'];
export const SESSION_DURATIONS = [30, 60, 90, 120, 180, 240, 360];

// Only discord.gg/<code> and discord.com/invite/<code> are accepted (checked by pattern, never fetched).
// The scheme is optional on input and normalised to https.
export const DISCORD_INVITE_PATTERN = /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/i;

export const discordInviteSchema = z
  .string()
  .trim()
  .max(100)
  .regex(DISCORD_INVITE_PATTERN, 'Use a discord.gg/… or discord.com/invite/… link')
  .transform((value) => {
    const [, code] = value.match(DISCORD_INVITE_PATTERN);
    return `https://discord.gg/${code}`;
  });

// Blank means "no Discord link" (an empty form field), so the form can send it as-is.
const optionalDiscord = z.preprocess((v) => (v === '' ? undefined : v), discordInviteSchema.optional());

const startsAt = z
  .string()
  .datetime({ offset: true, message: 'Pick a valid date and time' })
  .transform((value) => new Date(value).toISOString());

const baseFields = {
  title: z.string().trim().max(80),
  startsAt,
  durationMin: z.coerce.number().int().min(15).max(720),
  platform: z.string().trim().max(50),
  maxPlayers: z.coerce.number().int().min(2).max(32),
  visibility: z.enum(SESSION_VISIBILITIES),
  inviteeIds: z.array(objectId).max(31),
};

export const createSessionSchema = z
  .object({
    gameId: objectId,
    title: baseFields.title.default(''),
    startsAt: baseFields.startsAt,
    durationMin: baseFields.durationMin.default(120),
    platform: baseFields.platform.default(''),
    discordInviteUrl: optionalDiscord,
    maxPlayers: baseFields.maxPlayers.default(4),
    visibility: baseFields.visibility.default('friends'),
    inviteeIds: baseFields.inviteeIds.default([]),
  })
  .superRefine((s, ctx) => {
    if (s.visibility === 'invite' && s.inviteeIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['inviteeIds'], message: 'Invite at least one friend' });
    }
    if (new Set(s.inviteeIds).size !== s.inviteeIds.length) {
      ctx.addIssue({ code: 'custom', path: ['inviteeIds'], message: 'Each friend can only be invited once' });
    }
    if (s.inviteeIds.length + 1 > s.maxPlayers) {
      ctx.addIssue({ code: 'custom', path: ['maxPlayers'], message: 'There are more invitations than player slots' });
    }
  });

// The game of a session never changes; everything else can. A null Discord link removes it.
export const updateSessionSchema = z
  .object({
    title: baseFields.title,
    startsAt: baseFields.startsAt,
    durationMin: baseFields.durationMin,
    platform: baseFields.platform,
    discordInviteUrl: z.preprocess((v) => (v === '' ? null : v), discordInviteSchema.nullable()),
    maxPlayers: baseFields.maxPlayers,
    visibility: baseFields.visibility,
    inviteeIds: baseFields.inviteeIds,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .refine((v) => !v.inviteeIds || new Set(v.inviteeIds).size === v.inviteeIds.length, {
    path: ['inviteeIds'],
    message: 'Each friend can only be invited once',
  });

export const rsvpSchema = z.object({ response: z.enum(RSVP_RESPONSES) });

export const sessionIdParamsSchema = z.object({ id: objectId });

// cursor = "<startsAt ms>:<session id>" so paging stays stable when several sessions start together
export const sessionListQuerySchema = z.object({
  cursor: z.string().regex(/^\d{10,15}:[a-f0-9]{24}$/i, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
