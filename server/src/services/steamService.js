import { parseSteamInput } from '@gamequest/shared';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

export const toSteamDto = (steam) =>
  steam?.steamId
    ? {
        linked: true,
        steamId: steam.steamId,
        personaName: steam.personaName ?? '',
        avatar: steam.avatar ?? null,
        profileUrl: steam.profileUrl ?? null,
        visibility: steam.visibility ?? 'private',
        linkedAt: steam.linkedAt ?? null,
        lastSync: steam.lastSync?.at
          ? {
              at: steam.lastSync.at,
              added: steam.lastSync.added ?? 0,
              updated: steam.lastSync.updated ?? 0,
              unmatchedCount: steam.lastSync.unmatchedCount ?? 0,
            }
          : null,
      }
    : { linked: false };

// Avatars and profile links end up in <img src> / <a href>: https and a Steam host only.
const isSteamUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)(steamstatic\.com|steamcommunity\.com|akamaihd\.net)$/.test(url.hostname);
  } catch {
    return false;
  }
};

// Linking and unlinking a Steam account. The user id always comes from the auth cookie.
export function createSteamService({ User, steam, now = () => new Date() }) {
  async function load(userId) {
    const user = await User.findOne({ _id: userId }).lean();
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  return {
    async getStatus(userId) {
      return toSteamDto((await load(userId)).steam);
    },

    async link(userId, input) {
      const parsed = parseSteamInput(input);
      if (!parsed) throw new ValidationError('Enter a SteamID64 or a steamcommunity.com profile URL');
      const user = await load(userId); // a missing user costs no Steam calls
      const steamId = parsed.steamId ?? (await steam.resolveVanity(parsed.vanity));
      const profile = await steam.getPlayerSummary(steamId);
      if (!profile) throw new NotFoundError('Steam has no profile with that ID. Check your SteamID64.');

      const owner = await User.findOne({ 'steam.steamId': profile.steamId }).lean();
      if (owner && String(owner._id) !== String(userId)) {
        throw new ConflictError('That Steam account is already linked to another GameQuest user.');
      }

      const $set = {
        'steam.steamId': profile.steamId,
        'steam.personaName': profile.personaName,
        'steam.avatar': isSteamUrl(profile.avatar) ? profile.avatar : null,
        'steam.profileUrl': isSteamUrl(profile.profileUrl) ? profile.profileUrl : null,
        'steam.visibility': profile.visibility,
      };
      // Re-linking the same account only refreshes the persona; a different account starts clean.
      if (user.steam?.steamId !== profile.steamId) {
        $set['steam.linkedAt'] = now();
        $set['steam.lastSync'] = {};
      }
      try {
        await User.updateOne({ _id: userId }, { $set });
      } catch (err) {
        if (err?.code === 11000) throw new ConflictError('That Steam account is already linked to another GameQuest user.');
        throw err;
      }
      return toSteamDto((await load(userId)).steam);
    },

    // Library entries and their Steam ownerships stay; only the link goes.
    async unlink(userId) {
      await load(userId);
      await User.updateOne({ _id: userId }, { $unset: { steam: 1 } });
    },
  };
}
