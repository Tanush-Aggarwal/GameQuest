import { ForbiddenError, NotFoundError } from '../utils/errors.js';

// DTOs
export const toReviewDto = (r, user) => ({
  id: String(r._id),
  userId: String(r.userId),
  gameId: String(r.gameId),
  rating: r.rating,
  body: r.body ?? null,
  username: user?.username ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

// Atomically recalculate the game's ratingAvg and ratingCount from the
// aggregate rather than trying to keep running sums in sync.
async function refreshGameRating(Game, Review, gameId) {
  const [agg] = await Review.aggregate([
    { $match: { gameId } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const avg = agg ? Math.round(agg.avg * 10) / 10 : 0;
  const count = agg?.count ?? 0;
  await Game.updateOne({ _id: gameId }, { $set: { ratingAvg: avg, ratingCount: count } });
}

export function createReviewService({ Review, Game, User }) {
  return {
    // Upsert — create or replace the user's review of a game.
    // Only allowed for games the user has in their library past wishlist.
    async upsert(userId, gameId, { rating, body }, LibraryEntry) {
      const game = await Game.findOne({ _id: gameId }).lean();
      if (!game) throw new NotFoundError('Game not found');

      // Must own the game beyond wishlist.
      if (LibraryEntry) {
        const entry = await LibraryEntry.findOne({ userId, gameId }).lean();
        if (!entry) throw new ForbiddenError('Add this game to your library first');
        if (entry.status === 'wishlist') throw new ForbiddenError('Only games you have played can be reviewed');
      }

      const existing = await Review.findOne({ userId, gameId }).lean();

      let review;
      if (existing) {
        review = await Review.findOneAndUpdate(
          { userId, gameId },
          { $set: { rating, body: body ?? null } },
          { returnDocument: 'after' },
        );
      } else {
        review = await Review.create({ userId, gameId, rating, body: body ?? null });
      }

      await refreshGameRating(Game, Review, review.gameId);

      const user = await User.findOne({ _id: userId }).lean();
      return toReviewDto(review, user);
    },

    async deleteReview(userId, gameId) {
      const deleted = await Review.findOneAndDelete({ userId, gameId });
      if (!deleted) throw new NotFoundError('Review not found');
      await refreshGameRating(Game, Review, deleted.gameId);
    },

    // Get the current user's review of a specific game (null if none).
    async getMyReview(userId, gameId) {
      const r = await Review.findOne({ userId, gameId }).lean();
      if (!r) return null;
      const user = await User.findOne({ _id: userId }).lean();
      return toReviewDto(r, user);
    },

    // List reviews for a game (public, cursor-paginated).
    async listForGame(gameId, { limit = 20, cursor } = {}) {
      const filter = { gameId };
      if (cursor) filter._id = { $lt: cursor };

      const rows = await Review.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();

      const page = rows.slice(0, limit);
      const userIds = [...new Set(page.map((r) => String(r.userId)))];
      const users = await User.find({ _id: { $in: userIds } }).lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));

      return {
        items: page.map((r) => toReviewDto(r, byId.get(String(r.userId)))),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
      };
    },

    // List all reviews by a specific user.
    async listByUser(userId, { limit = 20, cursor } = {}) {
      const filter = { userId };
      if (cursor) filter._id = { $lt: cursor };

      const rows = await Review.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();

      const page = rows.slice(0, limit);
      const user = await User.findOne({ _id: userId }).lean();

      return {
        items: page.map((r) => toReviewDto(r, user)),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
      };
    },
  };
}
