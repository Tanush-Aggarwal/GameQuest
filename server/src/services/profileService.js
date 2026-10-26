import { ForbiddenError, NotFoundError } from '../utils/errors.js';

// Public profile pages (/u/:username). Every read of another person's data goes through the
// privacy check here: blocks hide the profile entirely, the owner's privacy setting decides the rest.
export function createProfileService({ User, LibraryEntry, Review, friendService, activityService, collectionService }) {
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

  async function statsFor(user, self) {
    // Hidden games stay out of everyone else's numbers.
    const filter = { userId: user._id };
    if (!self) filter.hiddenFromFriends = { $ne: true };
    const [entries, reviews] = await Promise.all([LibraryEntry.find(filter).limit(5000).lean(), Review.countDocuments({ userId: user._id })]);
    const owned = entries.filter((e) => e.status !== 'wishlist');
    const minutes = owned.reduce(
      (sum, e) => sum + Math.max(e.loggedMinutes ?? 0, (e.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0)),
      0,
    );
    return {
      games: owned.length,
      playing: entries.filter((e) => e.status === 'playing').length,
      completed: entries.filter((e) => e.status === 'completed').length,
      hours: Math.round(minutes / 60),
      reviews,
    };
  }

  return {
    async getProfile(viewerId, username) {
      const { user, self, relation, allowed } = await loadVisibleUser(viewerId, username);
      return {
        user: {
          id: String(user._id),
          username: user.username,
          memberSince: user.createdAt,
          ...(self && { privacy: user.privacy ?? 'public' }),
        },
        relation,
        restricted: !allowed,
        stats: allowed ? await statsFor(user, self) : null,
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
