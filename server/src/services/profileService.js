import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { effectiveMinutes } from './insightsService.js';
import { XP, levelForXp, xpForLevel } from './accountService.js';

// Public profile pages (/u/:username). Every read of another person's data goes through the
// privacy check here: blocks hide the profile entirely, the owner's privacy setting decides the rest.
export function createProfileService({ User, LibraryEntry, Review, friendService, activityService, collectionService, Game }) {
  async function loadVisibleUser(viewerId, username) {
    const user = await User.findOne({ usernameLower: username.toLowerCase() }).lean();
    if (!user) throw new NotFoundError('No player with that username');
    const self = String(viewerId) === String(user._id);
    if (!self && (await friendService.isBlocked(viewerId, user._id))) throw new NotFoundError('No player with that username');
    const relation = self ? 'self' : await friendService.relation(viewerId, user._id);
    const allowed = self || user.privacy === 'public' || (user.privacy === 'friends' && relation === 'friend');
    return { user, self, relation, allowed };
  }

  async function loadAllowedUser(viewerId, username) {
    const loaded = await loadVisibleUser(viewerId, username);
    if (!loaded.allowed) throw new ForbiddenError('This profile is private');
    return loaded;
  }

  async function populateFavourites(gameIds) {
    if (!gameIds?.length || !Game) return [];
    const found = await Game.find({ _id: { $in: gameIds } }).select('title slug cover backdrop ratingAvg releaseDate genres').lean();
    const byId = new Map(found.map((g) => [String(g._id), g]));
    return gameIds
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((g) => ({
        id: String(g._id),
        title: g.title,
        slug: g.slug,
        cover: g.cover,
        backdrop: g.backdrop ?? null,
        ratingAvg: g.ratingAvg,
        releaseDate: g.releaseDate,
        genres: g.genres ?? [],
      }));
  }

  async function statsFor(user, self) {
    // Hidden games stay out of everyone else's numbers.
    const filter = { userId: user._id };
    if (!self) filter.hiddenFromFriends = { $ne: true };
    const [entries, reviews, friends] = await Promise.all([
      LibraryEntry.find(filter).limit(5000).lean(),
      Review.countDocuments({ userId: user._id }),
      friendService?.listFriends ? friendService.listFriends(user._id).then((f) => f.length).catch(() => 0) : 0,
    ]);
    const owned = entries.filter((e) => e.status !== 'wishlist');
    const minutes = owned.reduce((sum, e) => sum + effectiveMinutes(e), 0);
    const completed = entries.filter((e) => e.status === 'completed').length;

    // Trophy inputs: every number below comes from the player's own library, reviews and friends.
    const platforms = new Set(owned.flatMap((e) => (e.ownerships ?? []).map((o) => String(o.platform).toLowerCase())));
    const achievements = owned.reduce((sum, e) => sum + (e.achievements?.unlocked ?? 0), 0);
    let genres = 0;
    if (Game && owned.length) {
      const games = await Game.find({ _id: { $in: owned.map((e) => e.gameId) } }).select('genres').lean();
      genres = new Set(games.flatMap((g) => g.genres ?? [])).size;
    }

    // Same formula as the account summary (see accountService), so the level matches the sidebar.
    const levelHours = Math.floor(entries.reduce((sum, e) => sum + effectiveMinutes(e), 0) / 60);
    const xp = levelHours * XP.perHour + completed * XP.perCompleted + reviews * XP.perReview;
    const level = levelForXp(xp);

    return {
      games: owned.length,
      playing: entries.filter((e) => e.status === 'playing').length,
      completed,
      hours: Math.round(minutes / 60),
      reviews,
      friends,
      platforms: platforms.size,
      genres,
      achievements,
      level,
      xp,
      levelStartXp: xpForLevel(level),
      nextLevelXp: xpForLevel(level + 1),
    };
  }

  return {
    async getProfile(viewerId, username) {
      const { user, self, relation, allowed } = await loadVisibleUser(viewerId, username);
      const favouriteGames = allowed ? await populateFavourites(user.favouriteGames ?? []) : [];
      return {
        user: {
          id: String(user._id),
          username: user.username,
          avatar: user.avatar ?? null,
          bio: user.bio ?? '',
          favouriteGames,
          memberSince: user.createdAt,
          ...(self && {
            privacy: user.privacy ?? 'public',
            notificationPrefs: user.notificationPrefs ?? { email: false, digest: false },
            discord: user.discord ?? { id: null, username: null },
          }),
        },
        relation,
        restricted: !allowed,
        stats: allowed ? await statsFor(user, self) : null,
      };
    },

    async updateProfile(userId, { bio, avatar, favouriteGames }) {
      const setFields = {};
      if (bio !== undefined) setFields.bio = bio;
      if (avatar !== undefined) setFields.avatar = avatar ? avatar.trim() : null;
      if (favouriteGames !== undefined) {
        const unique = [...new Set(favouriteGames.map(String))].slice(0, 4);
        setFields.favouriteGames = unique;
      }
      const updated = await User.findOneAndUpdate({ _id: userId }, { $set: setFields }, { returnDocument: 'after' });
      if (!updated) throw new NotFoundError('User not found');

      const populated = await populateFavourites(updated.favouriteGames ?? []);
      return {
        user: {
          id: String(updated._id),
          username: updated.username,
          avatar: updated.avatar ?? null,
          bio: updated.bio ?? '',
          favouriteGames: populated,
          privacy: updated.privacy ?? 'public',
        },
      };
    },

    async getActivity(viewerId, username, page) {
      const { user } = await loadAllowedUser(viewerId, username);
      return activityService.forUser(viewerId, user._id, page);
    },

    async getCollections(viewerId, username) {
      const { user } = await loadAllowedUser(viewerId, username);
      return { items: await collectionService.listVisibleFor(viewerId, user._id) };
    },

    async setPrivacy(userId, privacy) {
      const updated = await User.findOneAndUpdate({ _id: userId }, { $set: { privacy } }, { returnDocument: 'after' });
      if (!updated) throw new NotFoundError('User not found');
      return { privacy: updated.privacy };
    },
  };
}
