// The bell in the top bar. Notifications are derived from data that already exists (no separate store to keep in
// sync): friend requests waiting for this user, game recommendations they have not answered, and invites to
// upcoming sessions they have not RSVP'd to. "Unread" means newer than the last time they opened the bell.
const LIMIT = 30;

export function createNotificationService({ User, Friendship, Recommendation, GameSession, Rsvp, Game, now = () => new Date() }) {
  const id = (v) => String(v);

  async function collect(userId) {
    const [requests, recs, invites] = await Promise.all([
      Friendship.find({ status: 'pending', $or: [{ userA: userId }, { userB: userId }], requestedBy: { $ne: userId } }).lean(),
      Recommendation ? Recommendation.find({ toId: userId, status: 'pending' }).sort({ createdAt: -1 }).limit(LIMIT).lean() : [],
      GameSession
        ? GameSession.find({ invitees: userId, status: 'scheduled', startsAt: { $gt: now() } }).sort({ startsAt: 1 }).limit(LIMIT).lean()
        : [],
    ]);

    const answered = invites.length
      ? new Set((await Rsvp.find({ userId, sessionId: { $in: invites.map((s) => s._id) } }).lean()).map((r) => id(r.sessionId)))
      : new Set();
    const openInvites = invites.filter((s) => !answered.has(id(s._id)));

    const userIds = [...new Set([...requests.map((f) => id(f.requestedBy)), ...recs.map((r) => id(r.fromId)), ...openInvites.map((s) => id(s.hostId))])];
    const gameIds = [...new Set([...recs.map((r) => id(r.gameId)), ...openInvites.map((s) => id(s.gameId))])];
    const [users, games] = await Promise.all([
      userIds.length ? User.find({ _id: { $in: userIds } }).select('username avatar').lean() : [],
      gameIds.length ? Game.find({ _id: { $in: gameIds } }).select('title slug cover').lean() : [],
    ]);
    const userById = new Map(users.map((u) => [id(u._id), { id: id(u._id), username: u.username, avatar: u.avatar ?? null }]));
    const gameById = new Map(games.map((g) => [id(g._id), { id: id(g._id), title: g.title, slug: g.slug, cover: g.cover ?? null }]));
    const someone = { id: null, username: 'Someone', avatar: null };

    return [
      ...requests.map((f) => {
        const actor = userById.get(id(f.requestedBy)) ?? someone;
        return {
          id: `friend:${id(f._id)}`,
          type: 'friend_request',
          createdAt: f.createdAt,
          actor,
          text: `${actor.username} sent you a friend request`,
          link: '/friends?tab=requests',
        };
      }),
      ...recs.map((r) => {
        const actor = userById.get(id(r.fromId)) ?? someone;
        const game = gameById.get(id(r.gameId)) ?? null;
        return {
          id: `rec:${id(r._id)}`,
          type: 'recommendation',
          createdAt: r.createdAt,
          actor,
          game,
          text: `${actor.username} recommended ${game?.title ?? 'a game'} to you`,
          link: '/friends?tab=recommendations',
        };
      }),
      ...openInvites.map((s) => {
        const actor = userById.get(id(s.hostId)) ?? someone;
        const game = gameById.get(id(s.gameId)) ?? null;
        return {
          id: `session:${id(s._id)}`,
          type: 'session_invite',
          createdAt: s.createdAt,
          actor,
          game,
          session: { id: id(s._id), title: s.title || game?.title || 'Game session', startsAt: s.startsAt },
          text: `${actor.username} invited you to ${s.title || game?.title || 'a game session'}`,
          link: `/sessions/${id(s._id)}`,
        };
      }),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, LIMIT);
  }

  async function readAt(userId) {
    const user = await User.findOne({ _id: userId }).select('notificationsReadAt').lean();
    return user?.notificationsReadAt ? new Date(user.notificationsReadAt) : null;
  }

  const isUnread = (item, since) => !since || new Date(item.createdAt) > since;

  return {
    async list(userId) {
      const [items, since] = await Promise.all([collect(userId), readAt(userId)]);
      const marked = items.map((item) => ({ ...item, unread: isUnread(item, since) }));
      return { items: marked, unread: marked.filter((i) => i.unread).length };
    },

    async unreadCount(userId) {
      const [items, since] = await Promise.all([collect(userId), readAt(userId)]);
      return items.filter((i) => isUnread(i, since)).length;
    },

    async markAllRead(userId) {
      const at = now();
      await User.updateOne({ _id: userId }, { $set: { notificationsReadAt: at } });
      return { readAt: at, unread: 0 };
    },
  };
}
