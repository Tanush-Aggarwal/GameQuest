import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

/**
 * Progress service — manual 0–100 progress, play-log sessions, journal entries.
 *
 * Design decisions (see docs/DECISIONS.md):
 *  - Progress is blocked on wishlist entries (you haven't started yet).
 *  - On Completed entries, lowering progress < 100 is blocked (move back to Playing first).
 *  - Logging a play session on a Backlog entry auto-promotes it to Playing.
 *  - Effective playtime = max(sum of ownerships[].playtimeMin, loggedMinutes).
 */
export function createProgressService({ LibraryEntry, PlayLog, JournalEntry, libraryService, eventBus, logger }) {
  // ── manual progress ──────────────────────────────────────────────────────

  async function setProgress(userId, entryId, manualProgress) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId });
    if (!entry) throw new NotFoundError('Library entry not found.');
    if (entry.status === 'wishlist') throw new ValidationError('Set a status other than Wishlist before tracking progress.');
    if (entry.status === 'completed' && manualProgress < 100) {
      throw new ConflictError('Move the game back to Playing before lowering progress below 100%.');
    }
    const updated = await LibraryEntry.findOneAndUpdate(
      { _id: entryId, userId },
      { $set: { manualProgress } },
      { returnDocument: 'after' },
    );
    eventBus.emit('library.progressChanged', { userId, entryId, manualProgress });
    return updated;
  }

  // ── play logs ─────────────────────────────────────────────────────────────

  async function logSession(userId, entryId, { date, minutes, note = '' }) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId });
    if (!entry) throw new NotFoundError('Library entry not found.');
    if (entry.status === 'wishlist') throw new ValidationError('Move the game out of Wishlist before logging sessions.');

    // Auto-promote Backlog → Playing when the user starts logging time.
    if (entry.status === 'backlog') {
      await libraryService.changeStatus(userId, entryId, 'playing');
    }

    const dateUTC = new Date(`${date}T00:00:00Z`);
    if (dateUTC > new Date()) throw new ValidationError('Cannot log a session in the future.');

    const log = await PlayLog.create({ entryId, userId, gameId: entry.gameId, date: dateUTC, minutes, note });

    // Update loggedMinutes and lastPlayedAt atomically.
    await LibraryEntry.findOneAndUpdate(
      { _id: entryId, userId },
      { $inc: { loggedMinutes: minutes }, $max: { lastPlayedAt: dateUTC } },
    );

    eventBus.emit('library.sessionLogged', { userId, entryId, minutes, date });
    return toLogDto(log);
  }

  async function listLogs(userId, entryId, { limit = 20, cursor } = {}) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId });
    if (!entry) throw new NotFoundError('Library entry not found.');

    const q = { entryId };
    if (cursor) q._id = { $lt: cursor };
    const rows = await PlayLog.find(q).sort({ date: -1, _id: -1 }).limit(limit + 1);
    const items = rows.slice(0, limit).map(toLogDto);
    const nextCursor = rows.length > limit ? String(rows[limit - 1]._id) : null;
    return { items, nextCursor };
  }

  async function deleteLog(userId, entryId, logId) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId });
    if (!entry) throw new NotFoundError('Library entry not found.');
    const log = await PlayLog.findOne({ _id: logId, entryId, userId });
    if (!log) throw new NotFoundError('Play log not found.');
    await PlayLog.deleteOne({ _id: logId });
    // Decrement loggedMinutes.
    await LibraryEntry.findOneAndUpdate({ _id: entryId, userId }, { $inc: { loggedMinutes: -log.minutes } });
    return { deleted: true };
  }

  // ── journal entries ──────────────────────────────────────────────────────

  async function addJournalEntry(userId, entryId, { body }) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId });
    if (!entry) throw new NotFoundError('Library entry not found.');
    const note = await JournalEntry.create({ entryId, userId, body });
    eventBus.emit('library.journalUpdated', { userId, entryId });
    return toJournalDto(note);
  }

  async function listJournalEntries(userId, entryId, { limit = 20, cursor } = {}) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId });
    if (!entry) throw new NotFoundError('Library entry not found.');
    const q = { entryId };
    if (cursor) q._id = { $lt: cursor };
    const rows = await JournalEntry.find(q).sort({ createdAt: -1 }).limit(limit + 1);
    const items = rows.slice(0, limit).map(toJournalDto);
    const nextCursor = rows.length > limit ? String(rows[limit - 1]._id) : null;
    return { items, nextCursor };
  }

  async function deleteJournalEntry(userId, entryId, noteId) {
    const entry = await LibraryEntry.findOne({ _id: entryId, userId });
    if (!entry) throw new NotFoundError('Library entry not found.');
    const { deletedCount } = await JournalEntry.deleteOne({ _id: noteId, entryId, userId });
    if (!deletedCount) throw new NotFoundError('Journal entry not found.');
    return { deleted: true };
  }

  return { setProgress, logSession, listLogs, deleteLog, addJournalEntry, listJournalEntries, deleteJournalEntry };
}

function toLogDto(doc) {
  // structuredClone breaks instanceof across realms in tests; use duck-typing.
  const d = doc.date;
  const dateStr = d?.toISOString ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return {
    id: String(doc._id),
    date: dateStr,
    minutes: doc.minutes,
    note: doc.note ?? '',
    createdAt: doc.createdAt,
  };
}

function toJournalDto(doc) {
  return {
    id: String(doc._id),
    body: doc.body,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
