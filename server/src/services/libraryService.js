import { LIBRARY_STATUSES, LIBRARY_TRANSITIONS } from '@gamequest/shared';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { toGameDto } from './gameService.js';

export const STATUSES = LIBRARY_STATUSES;
export const TRANSITIONS = LIBRARY_TRANSITIONS;
const INITIAL_STATUSES = ['wishlist', 'backlog', 'playing'];

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

    async list(userId, { status, gameId, cursor, limit }) {
      const filter = { userId };
      if (status) filter.status = status;
      if (gameId) filter.gameId = gameId;
      if (cursor) filter._id = { $lt: cursor };
      const rows = await LibraryEntry.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();
      const page = rows.slice(0, limit);
      const games = page.length ? await Game.find({ _id: { $in: page.map((e) => e.gameId) } }).lean() : [];
      const byId = new Map(games.map((g) => [String(g._id), g]));

      // Tab counts only on the first page; later pages are "load more" and don't need them.
      let counts;
      if (!cursor) {
        const totals = await Promise.all(STATUSES.map((s) => LibraryEntry.countDocuments({ userId, status: s })));
        counts = Object.fromEntries(STATUSES.map((s, i) => [s, totals[i]]));
        counts.all = totals.reduce((a, b) => a + b, 0);
      }
      return {
        items: page.map((e) => toEntryDto(e, byId.get(String(e.gameId)))),
        nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
        ...(counts && { counts }),
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
    },

    async history(userId, entryId) {
      await findOwned(userId, entryId);
      const rows = await StatusHistory.find({ entryId }).sort({ at: -1 }).limit(100).lean();
      return rows.map(toHistoryDto);
    },
  };
}
