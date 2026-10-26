import { z } from 'zod';

const STEAM_ID64 = /^7656119\d{10}$/;
const VANITY = /^[A-Za-z0-9_-]{2,32}$/;

// Understands a SteamID64, a steamcommunity.com profile URL (/profiles/<id> or /id/<vanity>) or a bare
// vanity name. Returns { steamId } or { vanity }, or null when the text is none of those.
// The text is only parsed, never fetched.
export function parseSteamInput(raw) {
  const text = String(raw ?? '').trim();
  if (STEAM_ID64.test(text)) return { steamId: text };
  // A long number that is not a valid SteamID64 is a typo, not a vanity name worth a Steam lookup.
  if (/^\d{17}$/.test(text)) return null;
  if (VANITY.test(text)) return { vanity: text };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/^(www\.)?steamcommunity\.com$/i.test(url.hostname)) return null;
  const [kind, value] = url.pathname.split('/').filter(Boolean);
  if (kind === 'profiles' && STEAM_ID64.test(value ?? '')) return { steamId: value };
  if (kind === 'id' && VANITY.test(value ?? '')) return { vanity: value };
  return null;
}

export const linkSteamSchema = z.object({
  input: z
    .string()
    .trim()
    .min(1, 'Enter your SteamID64 or Steam profile URL')
    .max(200)
    .refine((v) => parseSteamInput(v) !== null, 'Enter a SteamID64 or a steamcommunity.com profile URL'),
});

// Where a user changes who can see their game details.
export const STEAM_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings';
