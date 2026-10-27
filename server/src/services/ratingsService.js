import { NotFoundError } from '../utils/errors.js';
import { ratingOutOf10 } from './homeService.js';

const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 60 * 60 * 1000;

// Every rating shown for a game, each with its source: IGDB (critics + players, stored on the game), Steam user
// reviews (public store API, cached a day), and GameQuest's own community reviews.
export function createRatingsService({ Game, MediaCache, steam, logger, now = () => new Date() }) {
  async function steamReviews(game) {
    const appid = game.externalIds?.steam;
    if (!appid || !steam?.getReviewSummary) return null;
    const cached = await MediaCache.findOne({ gameId: game._id, source: 'steam-reviews' }).lean();
    if (cached && new Date(cached.expiresAt) > now()) return cached.payload.summary;
    let summary = null;
    let ttl = HIT_TTL_MS;
    try {
      summary = await steam.getReviewSummary(appid);
    } catch (err) {
      logger?.warn({ err }, 'steam reviews lookup failed');
      ttl = ERROR_TTL_MS;
    }
    await MediaCache.findOneAndUpdate(
      { gameId: game._id, source: 'steam-reviews' },
      { $set: { payload: { summary }, fetchedAt: now(), expiresAt: new Date(now().getTime() + ttl) } },
      { upsert: true },
    );
    return summary;
  }

  return {
    async forSlug(slug) {
      const game = await Game.findOne({ slug }).select('_id externalIds totalRating totalRatingCount ratingAvg ratingCount').lean();
      if (!game) throw new NotFoundError('Game not found');
      const steamSummary = await steamReviews(game);
      const appid = game.externalIds?.steam;
      return {
        igdb: ratingOutOf10(game) == null ? null : { score: ratingOutOf10(game), outOf: 10, count: game.totalRatingCount ?? 0, source: 'IGDB (critics and players)' },
        steam: steamSummary ? { ...steamSummary, source: 'Steam user reviews', url: `https://store.steampowered.com/app/${appid}` } : null,
        community: game.ratingCount > 0 ? { score: game.ratingAvg, outOf: 5, count: game.ratingCount, source: 'GameQuest players' } : null,
      };
    },
  };
}
