const SCAN_BATCHES = 5; // pages scanned per request while filtering out hidden items
const LIBRARY_TYPES = new Set(['library.statusChanged', 'library.sessionLogged']);

// Activity is only ever written by event-bus subscribers (events/subscribers.js call `record`).
// Readers filter at read time because hiddenFromFriends and collection visibility can change later.
export function createActivityService({ Activity, LibraryEntry, Game, User, Collection, GameSession, social, logger, now = () => new Date() }) {
  // ── writing (called by subscribers) ───────────────────────────────────────

  // Events carry different ids; make sure the activity knows its entry and game so readers can
  // apply hiddenFromFriends.
  async function resolveEntry(userId, { entryId, gameId }) {
    if (entryId) return LibraryEntry.findOne({ _id: entryId, userId }).lean();
    if (gameId) return LibraryEntry.findOne({ userId, gameId }).lean();
    return null;
  }

  async function record(type, payload) {
    const actorId = payload.userId;
    if (!actorId) return null;
    const base = { actorId, type, createdAt: payload.at ?? now(), data: {}, level: 'friends' };

    switch (type) {
      case 'library.statusChanged':
        return Activity.create({ ...base, entryId: payload.entryId, gameId: payload.gameId, data: { from: payload.from ?? null, to: payload.to } });

      case 'library.sessionLogged': {
        const entry = await resolveEntry(actorId, payload);
        if (!entry) return null;
        return Activity.create({ ...base, entryId: entry._id, gameId: entry.gameId, data: { minutes: payload.minutes, date: payload.date } });
      }

      case 'review.created': {
        const entry = await resolveEntry(actorId, payload);
        return Activity.create({
          ...base,
          level: 'public',
          entryId: entry?._id ?? null,
          gameId: payload.gameId,
          data: { rating: payload.rating, reviewId: payload.reviewId },
        });
      }

      case 'collection.created': {
        if (payload.visibility === 'private') return null; // private collections leave no trace
        return Activity.create({
          ...base,
          level: payload.visibility === 'public' ? 'public' : 'friends',
          data: { collectionId: payload.collectionId, name: payload.name, collectionType: payload.type },
        });
      }

      case 'session.created':
        if (payload.visibility === 'invite') return null; // invite-only sessions stay between the invitees
        return Activity.create({
          ...base,
          gameId: payload.gameId,
          data: { sessionId: payload.sessionId, title: payload.title, startsAt: payload.startsAt },
        });

      case 'sync.completed':
        // One item per sync that brought something new; a re-sync that only refreshes playtime stays quiet.
        if (!payload.added) return null;
        return Activity.create({ ...base, data: { platform: payload.platform, count: payload.added } });

      default:
        logger?.warn({ type }, 'unknown activity type');
        return null;
    }
  }

  // ── reading ────────────────────────────────────────────────────────────────

  // Scans newest-first in batches until `limit` visible items are found, the data runs out, or the
  // scan budget is spent (then the cursor lets the client continue from where the scan stopped).
  async function visiblePage(filter, { audience, cursor, limit }) {
    const items = [];
    let scanFrom = cursor;
    let more = true;
    for (let i = 0; i < SCAN_BATCHES && more && items.length < limit; i += 1) {
      const rows = await Activity.find(scanFrom ? { ...filter, _id: { $lt: scanFrom } } : filter)
        .sort({ _id: -1 })
        .limit(limit * 2)
        .lean();
      more = rows.length === limit * 2;
      if (rows.length) scanFrom = String(rows[rows.length - 1]._id);
      for (const row of await filterVisible(rows, audience)) {
        items.push(row);
        if (items.length === limit) break;
      }
    }
    if (items.length === limit) return { items, nextCursor: String(items[items.length - 1]._id) };
    return { items, nextCursor: more ? scanFrom : null };
  }
  // audience: 'self' sees everything of their own; 'friends' sees friends + public items; 'public' only public items.
  async function filterVisible(rows, audience) {
    const entryIds = [...new Set(rows.filter((r) => r.entryId).map((r) => String(r.entryId)))];
    const collectionIds = [...new Set(rows.map((r) => r.data?.collectionId).filter(Boolean))];
    const sessionIds = [...new Set(rows.map((r) => r.data?.sessionId).filter(Boolean))];
    const [entries, collections, sessions] = await Promise.all([
      entryIds.length ? LibraryEntry.find({ _id: { $in: entryIds } }).lean() : [],
      collectionIds.length ? Collection.find({ _id: { $in: collectionIds } }).lean() : [],
      sessionIds.length && GameSession ? GameSession.find({ _id: { $in: sessionIds } }).lean() : [],
    ]);
    const entryById = new Map(entries.map((e) => [String(e._id), e]));
    const collectionById = new Map(collections.map((c) => [String(c._id), c]));
    const sessionById = new Map(sessions.map((s) => [String(s._id), s]));

    return rows.filter((row) => {
      if (row.entryId) {
        const entry = entryById.get(String(row.entryId));
        if (!entry && LIBRARY_TYPES.has(row.type)) return false; // the game left the library
        if (entry?.hiddenFromFriends && audience !== 'self') return false;
      }
      if (row.type === 'collection.created') {
        const collection = collectionById.get(String(row.data?.collectionId));
        if (!collection) return false;
        if (audience === 'self') return true;
        if (collection.visibility === 'private') return false;
        if (audience === 'public' && collection.visibility !== 'public') return false;
        return true;
      }
      if (row.type === 'session.created' && GameSession) {
        const session = sessionById.get(String(row.data?.sessionId));
        if (!session || session.status === 'cancelled' || session.visibility === 'invite') return false; // cancelled or made private
      }
      if (audience === 'public' && row.level !== 'public') return false;
      return true;
    });
  }

  async function hydrate(rows) {
    const actorIds = [...new Set(rows.map((r) => String(r.actorId)))];
    const gameIds = [...new Set(rows.filter((r) => r.gameId).map((r) => String(r.gameId)))];
    const [users, games] = await Promise.all([
      actorIds.length ? User.find({ _id: { $in: actorIds } }).lean() : [],
      gameIds.length ? Game.find({ _id: { $in: gameIds } }).lean() : [],
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const gameById = new Map(games.map((g) => [String(g._id), g]));
    return rows
      .filter((r) => userById.has(String(r.actorId)))
      .map((r) => {
        const game = r.gameId ? gameById.get(String(r.gameId)) : null;
        return {
          id: String(r._id),
          type: r.type,
          actor: { id: String(r.actorId), username: userById.get(String(r.actorId)).username, avatar: userById.get(String(r.actorId)).avatar ?? null },
          game: game ? { id: String(game._id), slug: game.slug, title: game.title, cover: game.cover ?? null } : null,
          data: r.data ?? {},
          createdAt: r.createdAt,
        };
      });
  }

  return {
    record,

    // Friends' activity for the home page. Friends only: your own actions are not in your feed.
    async feed(viewerId, { cursor, limit = 20 } = {}) {
      const friendIds = await social.friendIds(viewerId);
      if (!friendIds.length) return { items: [], nextCursor: null, friendCount: 0 };
      const { items, nextCursor } = await visiblePage({ actorId: { $in: friendIds } }, { audience: 'friends', cursor, limit });
      return { items: await hydrate(items), nextCursor, friendCount: friendIds.length };
    },

    // One person's recent activity as the viewer is allowed to see it (profile page).
    async forUser(viewerId, ownerId, { cursor, limit = 20 } = {}) {
      let audience = 'public';
      if (String(viewerId) === String(ownerId)) audience = 'self';
      else if (await social.isFriend(viewerId, ownerId)) audience = 'friends';
      const { items, nextCursor } = await visiblePage({ actorId: ownerId }, { audience, cursor, limit });
      return { items: await hydrate(items), nextCursor };
    },
  };
}
