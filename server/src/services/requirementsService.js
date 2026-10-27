import { NotFoundError } from '../utils/errors.js';

const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 60 * 60 * 1000;

// PC system requirements for the game page's "System requirements" tab. Steam's store is the only source, so games
// without a Steam id answer { available: false } right away. Answers (including "none") are cached in MediaCache.
export function createRequirementsService({ Game, MediaCache, steam, logger, now = () => new Date() }) {
  const empty = (reason) => ({ available: false, reason, minimum: [], recommended: [], source: null });

  return {
    async forSlug(slug) {
      const game = await Game.findOne({ slug }).select('_id title externalIds').lean();
      if (!game) throw new NotFoundError('Game not found');
      const appid = game.externalIds?.steam;
      if (!appid) return empty('This game is not on Steam, so there are no PC requirements to show.');

      const cached = await MediaCache.findOne({ gameId: game._id, source: 'steam-requirements' }).lean();
      if (cached && new Date(cached.expiresAt) > now()) return cached.payload;

      let payload;
      let ttl = HIT_TTL_MS;
      try {
        const reqs = await steam.getRequirements(appid);
        payload = reqs
          ? { available: true, reason: null, ...reqs, source: { name: 'Steam', url: `https://store.steampowered.com/app/${appid}` } }
          : empty('Steam lists no PC requirements for this game.');
        if (!reqs) ttl = MISS_TTL_MS;
      } catch (err) {
        logger?.warn({ err, slug }, 'steam requirements lookup failed');
        payload = empty('System requirements could not be loaded from Steam right now. Try again later.');
        ttl = ERROR_TTL_MS;
      }
      await MediaCache.findOneAndUpdate(
        { gameId: game._id, source: 'steam-requirements' },
        { $set: { payload, fetchedAt: now(), expiresAt: new Date(now().getTime() + ttl) } },
        { upsert: true },
      );
      return payload;
    },
  };
}
