import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { toGameDto } from './gameService.js';

export function createRecommendationService({
  Recommendation,
  Game,
  User,
  Review,
  LibraryEntry,
  libraryService,
  social,
  eventBus,
  logger = console,
}) {
  // ── helpers ─────────────────────────────────────────────────────────────────

  async function enrichRecommendations(recs, viewerId) {
    if (!recs.length) return [];

    const gameIds = [...new Set(recs.map((r) => String(r.gameId)))];
    const userIds = [...new Set(recs.flatMap((r) => [String(r.fromId), String(r.toId)]))];
    const reviewIds = recs.map((r) => r.reviewId).filter(Boolean);

    const [games, users, reviews, viewerEntries] = await Promise.all([
      Game.find({ _id: { $in: gameIds } }).lean(),
      User.find({ _id: { $in: userIds } }).select('username avatar').lean(),
      reviewIds.length ? Review.find({ _id: { $in: reviewIds } }).lean() : [],
      LibraryEntry ? LibraryEntry.find({ userId: viewerId, gameId: { $in: gameIds } }).lean() : [],
    ]);

    const gameMap = new Map(games.map((g) => [String(g._id), toGameDto(g)]));
    const userMap = new Map(users.map((u) => [String(u._id), { id: String(u._id), username: u.username, avatar: u.avatar ?? null }]));
    const reviewMap = new Map(reviews.map((rv) => [String(rv._id), { rating: rv.rating, body: rv.body }]));
    const entryMap = new Map(viewerEntries.map((e) => [String(e.gameId), e.status]));

    return recs.map((r) => ({
      id: String(r._id),
      from: userMap.get(String(r.fromId)) ?? { id: String(r.fromId), username: 'Unknown' },
      to: userMap.get(String(r.toId)) ?? { id: String(r.toId), username: 'Unknown' },
      game: gameMap.get(String(r.gameId)) ?? null,
      message: r.message ?? '',
      review: r.reviewId ? reviewMap.get(String(r.reviewId)) ?? null : null,
      status: r.status,
      outcome: r.outcome ?? { status: null, rating: null, completedAt: null },
      recipientStatus: entryMap.get(String(r.gameId)) ?? null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  // ── public api ──────────────────────────────────────────────────────────────

  return {
    async send(fromId, { toId, gameId, message = '' }) {
      if (String(fromId) === String(toId)) {
        throw new ValidationError('You cannot recommend a game to yourself');
      }

      if (social) {
        if (await social.isBlocked(fromId, toId)) {
          throw new NotFoundError('User not found');
        }
        if (!(await social.isFriend(fromId, toId))) {
          throw new ValidationError('You can only recommend games to your friends');
        }
      }

      const game = await Game.findOne({ _id: gameId }).lean();
      if (!game) throw new NotFoundError('Game not found');

      // Check if recommendation already exists between this pair for this game
      let rec = await Recommendation.findOne({ fromId, toId, gameId });
      if (rec) {
        if (rec.status === 'pending') {
          throw new ConflictError('You already recommended this game to this friend');
        }
        // If previously declined or dismissed, re-recommend it as pending
        await Recommendation.updateOne(
          { _id: rec._id },
          { $set: { status: 'pending', message, outcome: { status: null, rating: null, completedAt: null } } },
        );
        rec = { ...rec, status: 'pending', message, outcome: { status: null, rating: null, completedAt: null } };
      } else {
        // Find review if recommender reviewed this game
        let reviewId = null;
        if (Review) {
          const rev = await Review.findOne({ userId: fromId, gameId }).lean();
          if (rev) reviewId = rev._id;
        }

        rec = await Recommendation.create({
          fromId,
          toId,
          gameId,
          message,
          reviewId,
          status: 'pending',
        });
      }

      eventBus?.emit('recommendation.sent', {
        recommendationId: String(rec._id),
        fromId: String(fromId),
        toId: String(toId),
        gameId: String(gameId),
      });

      const [enriched] = await enrichRecommendations([rec.toObject ? rec.toObject() : rec], fromId);
      return enriched;
    },

    async listInbox(userId, { status = 'pending', cursor, limit = 20 } = {}) {
      const q = { toId: userId };
      if (status && status !== 'all') {
        q.status = status;
      }
      if (cursor) {
        q._id = { $lt: cursor };
      }

      const docs = await Recommendation.find(q)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();

      const hasMore = docs.length > limit;
      const items = hasMore ? docs.slice(0, limit) : docs;
      const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1]._id) : null;

      const enriched = await enrichRecommendations(items, userId);
      return { items: enriched, cursor: nextCursor, hasMore };
    },

    async listSent(userId, { cursor, limit = 20 } = {}) {
      const q = { fromId: userId };
      if (cursor) {
        q._id = { $lt: cursor };
      }

      const docs = await Recommendation.find(q)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();

      const hasMore = docs.length > limit;
      const items = hasMore ? docs.slice(0, limit) : docs;
      const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1]._id) : null;

      const enriched = await enrichRecommendations(items, userId);
      return { items: enriched, cursor: nextCursor, hasMore };
    },

    async respond(recipientId, id, { status, libraryStatus = 'backlog' }) {
      let rec = await Recommendation.findOne({ _id: id });
      if (!rec) throw new NotFoundError('Recommendation not found');

      if (String(rec.toId) !== String(recipientId)) {
        throw new ForbiddenError('Only the recipient can respond to this recommendation');
      }

      if (rec.status !== 'pending') {
        throw new ConflictError('This recommendation has already been answered');
      }

      rec.status = status;

      if (status === 'accepted' && libraryService) {
        try {
          await libraryService.add(recipientId, {
            gameId: rec.gameId,
            status: libraryStatus,
          });
        } catch (err) {
          // If already in library, that's completely fine — just proceed
          if (!(err instanceof ConflictError)) {
            logger.warn({ err }, 'Could not add recommended game to library');
          }
        }
      }

      await Recommendation.updateOne(
        { _id: rec._id },
        { $set: { status } },
      );
      rec = { ...rec, status };

      eventBus?.emit('recommendation.responded', {
        recommendationId: String(rec._id),
        fromId: String(rec.fromId),
        toId: String(rec.toId),
        gameId: String(rec.gameId),
        status,
      });

      const [enriched] = await enrichRecommendations([rec.toObject ? rec.toObject() : rec], recipientId);
      return enriched;
    },

    async remove(userId, id) {
      const rec = await Recommendation.findOne({ _id: id }).lean();
      if (!rec) throw new NotFoundError('Recommendation not found');

      if (String(rec.fromId) !== String(userId) && String(rec.toId) !== String(userId)) {
        throw new ForbiddenError('You cannot delete this recommendation');
      }

      await Recommendation.deleteOne({ _id: id });
    },

    async getPickScore(userId) {
      const recs = await Recommendation.find({ fromId: userId }).lean();
      const totalSent = recs.length;
      const acceptedCount = recs.filter((r) => r.status === 'accepted').length;
      const completedCount = recs.filter((r) => r.outcome?.status === 'completed').length;

      const ratings = recs
        .map((r) => r.outcome?.rating)
        .filter((rating) => typeof rating === 'number' && rating > 0);

      const averageRating = ratings.length
        ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
        : null;

      return {
        totalSent,
        acceptedCount,
        completedCount,
        averageRating,
      };
    },

    // ── outcome updates (subscriber triggers) ──────────────────────────────────

    async updateOutcomeOnStatusChange({ userId, gameId, to }) {
      if (to === 'completed') {
        await Recommendation.updateMany(
          { toId: userId, gameId, status: 'accepted' },
          { $set: { 'outcome.status': 'completed', 'outcome.completedAt': new Date() } },
        );
      }
    },

    async updateOutcomeOnReview({ userId, gameId, rating }) {
      await Recommendation.updateMany(
        { toId: userId, gameId },
        { $set: { 'outcome.rating': rating } },
      );
    },
  };
}
