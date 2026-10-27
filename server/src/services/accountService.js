import { NotFoundError, ValidationError } from '../utils/errors.js';
import { refreshGameRating } from './reviewService.js';
import { effectiveMinutes } from './insightsService.js';

// Player level, shown in the sidebar. Earned only from real activity, so it can be explained in one sentence:
// 10 XP per hour played, 100 XP per completed game, 25 XP per review. Level n starts at 100 * (n - 1)^2 XP.
export const XP = { perHour: 10, perCompleted: 100, perReview: 25 };
export const levelForXp = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
export const xpForLevel = (level) => 100 * (level - 1) ** 2;

export function createAccountService({
  User,
  RefreshToken,
  LibraryEntry,
  StatusHistory,
  PlayLog,
  JournalEntry,
  Review,
  Game,
  Collection,
  CollectionItem,
  Friendship,
  Block,
  Activity,
  GameSession,
  Rsvp,
  Recommendation,
  notificationService,
  logger,
}) {
  return {
    async summary(userId) {
      const user = await User.findOne({ _id: userId }).select('username avatar').lean();
      if (!user) throw new NotFoundError('Account not found');
      const [entries, reviews, unread] = await Promise.all([
        LibraryEntry.find({ userId }).select('status loggedMinutes ownerships').lean(),
        Review.countDocuments({ userId }),
        notificationService ? notificationService.unreadCount(userId) : 0,
      ]);
      const hours = Math.floor(entries.reduce((sum, e) => sum + effectiveMinutes(e), 0) / 60);
      const completed = entries.filter((e) => e.status === 'completed').length;
      const xp = hours * XP.perHour + completed * XP.perCompleted + reviews * XP.perReview;
      const level = levelForXp(xp);
      return {
        username: user.username,
        avatar: user.avatar ?? null,
        level,
        xp,
        levelStartXp: xpForLevel(level),
        nextLevelXp: xpForLevel(level + 1),
        breakdown: { hours, completed, reviews },
        unreadNotifications: unread,
      };
    },

    // Removes the account and everything that belongs to it. The caller must type their username to confirm.
    async deleteAccount(userId, { confirmUsername }) {
      const user = await User.findOne({ _id: userId }).select('username').lean();
      if (!user) throw new NotFoundError('Account not found');
      if (String(confirmUsername ?? '').trim().toLowerCase() !== user.username.toLowerCase()) {
        throw new ValidationError('Type your username exactly to confirm deleting your account.');
      }

      // Reviews first: the games they rated need their averages recomputed once the reviews are gone.
      const reviewedGameIds = (await Review.find({ userId }).select('gameId').lean()).map((r) => r.gameId);
      await Review.deleteMany({ userId });
      await Promise.allSettled(reviewedGameIds.map((gameId) => refreshGameRating(Game, Review, gameId)));

      const ownCollections = (await Collection.find({ ownerId: userId }).select('_id').lean()).map((c) => c._id);
      const entryIds = (await LibraryEntry.find({ userId }).select('_id').lean()).map((e) => e._id);
      const hostedSessions = (await GameSession.find({ hostId: userId }).select('_id').lean()).map((s) => s._id);

      const steps = [
        ['collection items', () => CollectionItem.deleteMany({ $or: [{ collectionId: { $in: ownCollections } }, { entryId: { $in: entryIds } }] })],
        ['collections', () => Collection.deleteMany({ ownerId: userId })],
        ['status history', () => StatusHistory.deleteMany({ userId })],
        ['play logs', () => PlayLog.deleteMany({ userId })],
        ['journal', () => JournalEntry.deleteMany({ userId })],
        ['library', () => LibraryEntry.deleteMany({ userId })],
        ['friendships', () => Friendship.deleteMany({ $or: [{ userA: userId }, { userB: userId }] })],
        ['blocks', () => Block.deleteMany({ $or: [{ blockerId: userId }, { blockedId: userId }] })],
        ['activity', () => Activity.deleteMany({ actorId: userId })],
        ['session RSVPs', () => Rsvp.deleteMany({ $or: [{ userId }, { sessionId: { $in: hostedSessions } }] })],
        ['hosted sessions', () => GameSession.deleteMany({ hostId: userId })],
        ['session invites', () => GameSession.updateMany({ invitees: userId }, { $pull: { invitees: userId } })],
        ['recommendations', () => (Recommendation ? Recommendation.deleteMany({ $or: [{ fromId: userId }, { toId: userId }] }) : null)],
        ['sign-in tokens', () => RefreshToken.deleteMany({ userId })],
      ];
      for (const [name, run] of steps) {
        try {
          await run();
        } catch (err) {
          // Keep going: a leftover row in one collection must not leave the account half-deleted and still usable.
          logger?.error({ err, step: name }, 'account deletion step failed');
        }
      }
      await User.deleteOne({ _id: userId });
      return { deleted: true };
    },
  };
}
