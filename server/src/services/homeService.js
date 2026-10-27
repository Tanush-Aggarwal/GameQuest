import { toGameDto } from './gameService.js';

const STATS_TTL_MS = 10 * 60 * 1000;

// One decimal on a 10-point scale from IGDB's 0-100 total rating; null when the game is unrated.
export const ratingOutOf10 = (g) => (Number.isFinite(g?.totalRating) && g.totalRating > 0 ? Math.round(g.totalRating) / 10 : null);

const withRating = (g) => ({ ...toGameDto(g), rating: ratingOutOf10(g) });

// Real numbers and real games for the Home page: catalog counts for the hero, the trending carousel, and the
// "Your next adventure" pick. Nothing here is invented: an empty database gives zeros and empty lists.
export function createHomeService({ Game, User, Collection, Review, LibraryEntry, insightsService, now = () => new Date() }) {
  let statsCache = { at: 0, value: null };

  return {
    async publicStats() {
      if (statsCache.value && now().getTime() - statsCache.at < STATS_TTL_MS) return statsCache.value;
      const [games, players, collections, reviews] = await Promise.all([
        Game.countDocuments({ hidden: { $ne: true } }),
        User.countDocuments({}),
        Collection.countDocuments({ visibility: 'public' }),
        Review.countDocuments({}),
      ]);
      const value = { games, players, collections, reviews };
      statsCache = { at: now().getTime(), value };
      return value;
    },

    // Released, popular games with wide art and a cover: the hero carousel and the "Trending games" row.
    async featured({ limit = 5 } = {}) {
      const rows = await Game.find({
        hidden: { $ne: true },
        backdrop: { $nin: [null, ''] },
        cover: { $nin: [null, ''] },
        releaseDate: { $lte: now() },
      })
        .sort({ popularity: -1, slug: 1 })
        .limit(limit)
        .lean();
      return { items: rows.map(withRating) };
    },

    // The best play-next pick from the user's own library; if the library has nothing to suggest, the most popular
    // released game with art that the user does not own yet. Null only when the catalog itself is empty.
    async nextAdventure(userId) {
      if (insightsService) {
        const { items } = await insightsService.getPlayNext(userId, { limit: 1 });
        const pick = items?.[0];
        if (pick?.gameId) {
          const game = await Game.findOne({ _id: pick.gameId }).lean();
          if (game) return { source: 'library', reasons: pick.reasons ?? [], entryId: pick.entryId, game: withRating(game) };
        }
      }
      const owned = (await LibraryEntry.find({ userId }).select('gameId').lean()).map((e) => e.gameId);
      const [game] = await Game.find({
        hidden: { $ne: true },
        _id: { $nin: owned },
        backdrop: { $nin: [null, ''] },
        cover: { $nin: [null, ''] },
        releaseDate: { $lte: now() },
      })
        .sort({ popularity: -1, slug: 1 })
        .limit(1)
        .lean();
      return game ? { source: 'popular', reasons: ['Popular right now'], entryId: null, game: withRating(game) } : null;
    },
  };
}
