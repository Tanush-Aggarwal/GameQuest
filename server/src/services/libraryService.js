import { LIBRARY_STATUSES, LIBRARY_TRANSITIONS } from '@gamequest/shared';
import { planningHours, normalizeTimeToBeat } from '../utils/timeToBeat.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { toGameDto, withParentArt } from './gameService.js';

export const STATUSES = LIBRARY_STATUSES;
export const TRANSITIONS = LIBRARY_TRANSITIONS;
const INITIAL_STATUSES = ['wishlist', 'backlog', 'playing'];
const FACET_GENRES = 20;

export const toEntryDto = (entry, game) => ({
  id: String(entry._id),
  gameId: String(entry.gameId),
  status: entry.status,
  manualProgress: entry.manualProgress ?? 0,
  ownerships: (entry.ownerships ?? []).map((o) => ({
    platform: o.platform,
    externalId: o.externalId ?? null,
    playtimeMin: o.playtimeMin ?? 0,
    lastSyncedAt: o.lastSyncedAt ?? null,
  })),
  // Latest platform snapshot; unlocked/total are null for games without achievements or before a sync.
  achievements: {
    unlocked: entry.achievements?.unlocked ?? null,
    total: entry.achievements?.total ?? null,
    fetchedAt: entry.achievements?.fetchedAt ?? null,
  },
  completedAt: entry.completedAt ?? null,
  hiddenFromFriends: Boolean(entry.hiddenFromFriends),
  addedAt: entry.createdAt,
  game: game ? toGameDto(game) : null,
});

export const toHistoryDto = (h) => ({ id: String(h._id), from: h.from ?? null, to: h.to, at: h.at });

// Every method takes the userId from the auth middleware and scopes queries by it, so an entry
// that belongs to someone else is indistinguishable from one that does not exist.
export function createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus, logger, now = () => new Date() }) {
  async function findOwned(userId, entryId) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId }).lean();
    if (!entry) throw new NotFoundError('Library entry not found');
    return entry;
  }

  // A failed history write must not undo a status change the user already sees; log it loudly instead.
  async function record(entry, from, to) {
    const at = now();
    try {
      await StatusHistory.create({ entryId: entry._id, userId: entry.userId, from, to, at });
    } catch (err) {
      logger?.error({ err, entryId: String(entry._id) }, 'could not write StatusHistory');
    }
    eventBus?.emit('library.statusChanged', {
      userId: String(entry.userId),
      entryId: String(entry._id),
      gameId: String(entry.gameId),
      from,
      to,
      at,
    });
  }

  // Genres (most common first) and platforms present in the user's whole library.
  async function libraryFacets(userId) {
    const entries = await LibraryEntry.find({ userId }).select('gameId ownerships.platform').lean();
    const platforms = [...new Set(entries.flatMap((e) => (e.ownerships ?? []).map((o) => o.platform)).filter(Boolean))].sort();
    const games = entries.length ? await Game.find({ _id: { $in: entries.map((e) => e.gameId) } }).select('genres').lean() : [];
    const tally = new Map();
    for (const g of games) for (const name of g.genres ?? []) tally.set(name, (tally.get(name) ?? 0) + 1);
    const genres = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, FACET_GENRES).map(([name]) => name);
    return { genres, platforms };
  }

  return {
    async add(userId, { gameId, status, platform }) {
      // Completed/Dropped are reached by moving, so the state machine cannot be skipped on creation.
      if (!INITIAL_STATUSES.includes(status)) {
        throw new ValidationError(`A new library entry can start as ${INITIAL_STATUSES.join(', ')}`);
      }
      const game = await Game.findOne({ _id: gameId }).lean();
      if (!game) throw new NotFoundError('Game not found');
      let entry;
      try {
        entry = await LibraryEntry.create({
          userId,
          gameId,
          status,
          ownerships: platform ? [{ platform, externalId: null, playtimeMin: 0, lastSyncedAt: null }] : [],
        });
      } catch (err) {
        if (err?.code === 11000) throw new ConflictError('This game is already in your library');
        throw err;
      }
      await record(entry, null, status);
      return toEntryDto(entry, game);
    },

    // Filters: status, one game, genre / title search (both live on the Game, so they are resolved to a set of the
    // user's game ids first), and the platform the game is owned on. `sort` sorts by default (newest first),
    // title (A-Z), playtime (most played), progress (highest %), or timeToBeat (shortest first).
    // `facets` (first page only) lists the genres and platforms present in the whole library.
    async list(userId, { status, gameId, genre, platform, q, sort = 'default', cursor, limit }) {
      const filter = { userId };
      if (status) filter.status = status;
      if (platform) filter['ownerships.platform'] = platform;
      if (gameId) {
        filter.gameId = gameId;
      } else if (genre || q) {
        // Resolved among the user's OWN games, so the library bounds the lookup (no silent cap on a big catalog).
        const own = await LibraryEntry.find({ userId, ...(status && { status }), ...(platform && { 'ownerships.platform': platform }) }).select('gameId').lean();
        const gameFilter = { _id: { $in: own.map((e) => e.gameId) } };
        if (genre) gameFilter.genres = genre;
        if (q) gameFilter.title = { $regex: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
        const matching = await Game.find(gameFilter).select('_id').lean();
        filter.gameId = { $in: matching.map((g) => g._id) };
      }

      let page;
      let nextCursor = null;

      if (!sort || sort === 'default') {
        if (cursor) filter._id = { $lt: cursor };
        const rows = await LibraryEntry.find(filter)
          .sort({ _id: -1 })
          .limit(limit + 1)
          .lean();
        page = rows.slice(0, limit);
        nextCursor = rows.length > limit ? String(page[page.length - 1]._id) : null;
      } else {
        const allMatching = await LibraryEntry.find(filter).lean();
        const allGameIds = allMatching.map((e) => e.gameId);
        const gamesForSort = allGameIds.length ? await Game.find({ _id: { $in: allGameIds } }).select('title genres themes gameModes timeToBeat').lean() : [];
        const sortGameMap = new Map(gamesForSort.map((g) => [String(g._id), g]));
        const minutesPlayed = (e) => (e.ownerships ?? []).reduce((s, o) => s + (o.playtimeMin ?? 0), 0) + (e.loggedMinutes ?? 0);

        allMatching.sort((a, b) => {
          let diff = 0;
          if (sort === 'title') {
            const titleA = sortGameMap.get(String(a.gameId))?.title ?? '';
            const titleB = sortGameMap.get(String(b.gameId))?.title ?? '';
            diff = titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
          } else if (sort === 'playtime') {
            diff = minutesPlayed(b) - minutesPlayed(a);
          } else if (sort === 'progress') {
            diff = (b.manualProgress ?? 0) - (a.manualProgress ?? 0);
          } else if (sort === 'timeToBeat') {
            const hoursOf = (g) => (g ? planningHours({ timeToBeat: normalizeTimeToBeat(g.timeToBeat, g, { legacySwap: true }) }) : null);
            const ttbA = hoursOf(sortGameMap.get(String(a.gameId))) ?? 999999;
            const ttbB = hoursOf(sortGameMap.get(String(b.gameId))) ?? 999999;
            diff = ttbA - ttbB;
          }
          if (diff !== 0) return diff;
          return String(b._id).localeCompare(String(a._id));
        });

        let startIndex = 0;
        if (cursor) {
          const idx = allMatching.findIndex((e) => String(e._id) === String(cursor));
          startIndex = idx >= 0 ? idx + 1 : 0;
        }
        page = allMatching.slice(startIndex, startIndex + limit);
        nextCursor = startIndex + limit < allMatching.length ? String(page[page.length - 1]._id) : null;
      }

      const found = page.length ? await Game.find({ _id: { $in: page.map((e) => e.gameId) } }).lean() : [];
      const games = await withParentArt(Game, found);
      const byId = new Map(games.map((g) => [String(g._id), g]));

      // Tab counts and facets only on the first page; later pages are "load more" and don't need them.
      let counts;
      let facets;
      if (!cursor) {
        const totals = await Promise.all(STATUSES.map((s) => LibraryEntry.countDocuments({ userId, status: s })));
        counts = Object.fromEntries(STATUSES.map((s, i) => [s, totals[i]]));
        counts.all = totals.reduce((a, b) => a + b, 0);
        facets = await libraryFacets(userId);
      }
      return {
        items: page.map((e) => toEntryDto(e, byId.get(String(e.gameId)))),
        nextCursor,
        ...(counts && { counts }),
        ...(facets && { facets }),
      };
    },
    async changeStatus(userId, entryId, to) {
      const entry = await findOwned(userId, entryId);
      const from = entry.status;
      if (from === to) throw new ConflictError(`This game is already ${to}`);
      const allowed = TRANSITIONS[from];
      if (!allowed.includes(to)) {
        throw new ConflictError(`A ${from} game can't move to ${to}`, { from, to, allowed });
      }

      const $set = { status: to, completedAt: to === 'completed' ? now() : null };
      if (to === 'completed') $set.manualProgress = 100;
      // Matching on the old status makes a double-click or a second tab fail instead of writing two histories.
      const updated = await LibraryEntry.findOneAndUpdate({ _id: entryId, userId, status: from }, { $set }, { returnDocument: 'after' });
      if (!updated) throw new ConflictError('This game was changed elsewhere. Refresh and try again.');

      await record(updated, from, to);
      return toEntryDto(updated, await Game.findOne({ _id: updated.gameId }).lean());
    },

    async setHiddenFromFriends(userId, entryId, hiddenFromFriends) {
      const updated = await LibraryEntry.findOneAndUpdate({ _id: entryId, userId }, { $set: { hiddenFromFriends } }, { returnDocument: 'after' });
      if (!updated) throw new NotFoundError('Library entry not found');
      return toEntryDto(updated, await Game.findOne({ _id: updated.gameId }).lean());
    },

    async remove(userId, entryId) {
      const { deletedCount } = await LibraryEntry.deleteOne({ _id: entryId, userId });
      if (!deletedCount) throw new NotFoundError('Library entry not found');
      await StatusHistory.deleteMany({ entryId });
      eventBus?.emit('library.entryRemoved', { userId: String(userId), entryId: String(entryId) });
    },

    async getEntry(userId, entryId) {
      const entry = await findOwned(userId, entryId);
      const game = await Game.findOne({ _id: entry.gameId }).lean();
      const [display] = game ? await withParentArt(Game, [game]) : [game];
      return toEntryDto(entry, display);
    },

    async history(userId, entryId) {
      await findOwned(userId, entryId);
      const rows = await StatusHistory.find({ entryId }).sort({ at: -1 }).limit(100).lean();
      return rows.map(toHistoryDto);
    },
  };
}
