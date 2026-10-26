import { jest } from '@jest/globals';
import { createProgressService } from '../services/progressService.js';
import { createLibraryService } from '../services/libraryService.js';
import { scorePlayNext } from '../services/insightsService.js';
import { createFakeCollection, logger } from './helpers.js';
import { createEventBus } from '../events/eventBus.js';

function setup() {
  const LibraryEntry = createFakeCollection({ unique: [['userId', 'gameId']], defaults: { manualProgress: 0, loggedMinutes: 0, ownerships: [], completedAt: null, hiddenFromFriends: false } });
  const StatusHistory = createFakeCollection();
  const PlayLog = createFakeCollection();
  const JournalEntry = createFakeCollection();
  const Game = createFakeCollection({ unique: [['slug']] });
  const eventBus = createEventBus({ logger: { error: jest.fn() } });
  const libraryService = createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus, logger });
  const progressService = createProgressService({ LibraryEntry, PlayLog, JournalEntry, libraryService, eventBus, logger });
  return { LibraryEntry, PlayLog, JournalEntry, Game, libraryService, progressService, eventBus };
}

const makeGame = (ctx) => ctx.Game.create({ title: 'Hades', slug: 'hades', genres: ['Roguelike'], platforms: [] });

describe('progressService.setProgress', () => {
  it('sets manual progress on a playing entry', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'playing' });
    await ctx.progressService.setProgress('u1', entry.id, 50);
    expect(ctx.LibraryEntry.docs[0].manualProgress).toBe(50);
  });

  it('blocks progress on wishlist', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'wishlist' });
    await expect(ctx.progressService.setProgress('u1', entry.id, 10)).rejects.toMatchObject({ status: 400 });
  });

  it('blocks lowering progress below 100 on completed', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'playing' });
    await ctx.libraryService.changeStatus('u1', entry.id, 'completed');
    await expect(ctx.progressService.setProgress('u1', entry.id, 80)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects another user', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'playing' });
    await expect(ctx.progressService.setProgress('u2', entry.id, 10)).rejects.toMatchObject({ status: 404 });
  });
});

describe('progressService.logSession', () => {
  it('logs a session and increments loggedMinutes', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'playing' });
    const log = await ctx.progressService.logSession('u1', entry.id, { date: '2026-01-15', minutes: 90 });
    expect(log.minutes).toBe(90);
    expect(log.date).toBe('2026-01-15');
    expect(ctx.LibraryEntry.docs[0].loggedMinutes).toBe(90);
  });

  it('auto-promotes backlog → playing on first session', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'backlog' });
    await ctx.progressService.logSession('u1', entry.id, { date: '2026-01-15', minutes: 30 });
    expect(ctx.LibraryEntry.docs[0].status).toBe('playing');
  });

  it('rejects a future date', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'playing' });
    await expect(
      ctx.progressService.logSession('u1', entry.id, { date: '2099-01-01', minutes: 60 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects wishlist entries', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'wishlist' });
    await expect(ctx.progressService.logSession('u1', entry.id, { date: '2026-01-01', minutes: 30 })).rejects.toMatchObject({ status: 400 });
  });
});

describe('progressService.journal', () => {
  it('adds and lists journal entries', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'playing' });
    await ctx.progressService.addJournalEntry('u1', entry.id, { body: 'First note' });
    await ctx.progressService.addJournalEntry('u1', entry.id, { body: 'Second note' });
    const { items } = await ctx.progressService.listJournalEntries('u1', entry.id);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.body).sort()).toEqual(['First note', 'Second note']);
  });

  it('deletes a journal entry', async () => {
    const ctx = setup();
    const game = await makeGame(ctx);
    const entry = await ctx.libraryService.add('u1', { gameId: game._id, status: 'playing' });
    await ctx.progressService.addJournalEntry('u1', entry.id, { body: 'Keep it' });
    const gone = await ctx.progressService.addJournalEntry('u1', entry.id, { body: 'Delete me' });
    await ctx.progressService.deleteJournalEntry('u1', entry.id, gone.id);
    const { items } = await ctx.progressService.listJournalEntries('u1', entry.id);
    expect(items).toHaveLength(1);
    expect(items[0].body).toBe('Keep it');
  });
});

describe('scorePlayNext', () => {
  it('gives higher score to a matching genre', () => {
    const entry = { manualProgress: 0, status: 'backlog', createdAt: new Date(Date.now() - 14 * 86400000) };
    const game = { genres: ['Roguelike'], timeToBeat: { main: 8 } };
    const prefs = { Roguelike: 3 };
    const score = scorePlayNext(entry, game, prefs);
    expect(score.total).toBeGreaterThan(0);
    expect(score.reasons.some((r) => r.includes('taste'))).toBe(true);
  });

  it('prefers shorter games', () => {
    const shortGame = { genres: [], timeToBeat: { main: 4 } };
    const longGame = { genres: [], timeToBeat: { main: 60 } };
    const entry = { manualProgress: 0, status: 'backlog', createdAt: new Date() };
    expect(scorePlayNext(entry, shortGame, {}).total).toBeGreaterThan(scorePlayNext(entry, longGame, {}).total);
  });
});
