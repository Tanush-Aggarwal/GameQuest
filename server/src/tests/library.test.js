import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createGameService } from '../services/gameService.js';
import { createLibraryService, TRANSITIONS, STATUSES } from '../services/libraryService.js';
import { createEventBus } from '../events/eventBus.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

function setupLibrary() {
  const Game = createFakeCollection({ unique: [['slug']] });
  const LibraryEntry = createFakeCollection({ unique: [['userId', 'gameId']], defaults: { manualProgress: 0, ownerships: [], completedAt: null, hiddenFromFriends: false } });
  const StatusHistory = createFakeCollection();
  const eventBus = createEventBus({ logger: { error: jest.fn() } });
  const events = [];
  eventBus.on('library.statusChanged', (e) => events.push(e));
  const service = createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus, logger });
  return { Game, LibraryEntry, StatusHistory, service, events };
}

const makeGame = (ctx, title) => ctx.Game.create({ title, slug: title.toLowerCase(), genres: [], platforms: [] });
const tick = () => new Promise((r) => setImmediate(r));

describe('libraryService', () => {
  it('adds a game once per user and rejects a duplicate with ConflictError', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'Hades');
    const entry = await ctx.service.add('u1', { gameId: game._id, status: 'backlog', platform: 'PC' });
    expect(entry).toMatchObject({ status: 'backlog', game: { title: 'Hades' }, ownerships: [{ platform: 'PC' }] });
    await expect(ctx.service.add('u1', { gameId: game._id, status: 'playing' })).rejects.toMatchObject({ status: 409 });
    expect(ctx.LibraryEntry.docs).toHaveLength(1);
    // a different user can add the same game
    await ctx.service.add('u2', { gameId: game._id, status: 'wishlist' });
    expect(ctx.LibraryEntry.docs).toHaveLength(2);
  });

  it('refuses to create an entry directly in completed or dropped', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'G');
    await expect(ctx.service.add('u1', { gameId: game._id, status: 'completed' })).rejects.toMatchObject({ status: 400 });
    expect(ctx.LibraryEntry.docs).toHaveLength(0);
  });

  it('rejects an unknown game', async () => {
    const ctx = setupLibrary();
    await expect(ctx.service.add('u1', { gameId: '0'.repeat(24), status: 'backlog' })).rejects.toMatchObject({ status: 404 });
  });

  it('writes StatusHistory (including the initial add) and emits library.statusChanged', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'Hades');
    const entry = await ctx.service.add('u1', { gameId: game._id, status: 'backlog' });
    await ctx.service.changeStatus('u1', entry.id, 'playing');
    const history = await ctx.service.history('u1', entry.id);
    expect(history.map((h) => [h.from, h.to]).sort()).toEqual([[null, 'backlog'], ['backlog', 'playing']].sort());
    await tick();
    expect(ctx.events).toEqual([
      expect.objectContaining({ userId: 'u1', from: null, to: 'backlog' }),
      expect.objectContaining({ userId: 'u1', from: 'backlog', to: 'playing' }),
    ]);
  });

  it('allows exactly the transitions in the state machine and rejects every other jump', async () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to) continue;
        const ctx = setupLibrary();
        const game = await makeGame(ctx, 'G');
        const entry = await ctx.LibraryEntry.create({ userId: 'u1', gameId: game._id, status: from });
        const attempt = ctx.service.changeStatus('u1', entry._id, to);
        if (TRANSITIONS[from].includes(to)) {
          await expect(attempt).resolves.toMatchObject({ status: to });
        } else {
          await expect(attempt).rejects.toMatchObject({ status: 409, details: { from, to } });
          expect(ctx.StatusHistory.docs).toHaveLength(0);
        }
      }
    }
  });

  it('rejects moving to the current status', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'G');
    const entry = await ctx.service.add('u1', { gameId: game._id, status: 'playing' });
    await expect(ctx.service.changeStatus('u1', entry.id, 'playing')).rejects.toMatchObject({ status: 409 });
  });

  it('sets completedAt and 100% progress on Completed, and clears completedAt when replayed', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'G');
    const entry = await ctx.service.add('u1', { gameId: game._id, status: 'playing' });
    const done = await ctx.service.changeStatus('u1', entry.id, 'completed');
    expect(done.completedAt).toBeTruthy(); // not toBeInstanceOf: structuredClone in the fake yields a Date from another realm
    expect(done.manualProgress).toBe(100);
    const again = await ctx.service.changeStatus('u1', entry.id, 'playing');
    expect(again.completedAt).toBeNull();
  });

  it("treats another user's entry as not found for every operation", async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'G');
    const entry = await ctx.service.add('owner', { gameId: game._id, status: 'backlog' });
    await expect(ctx.service.changeStatus('intruder', entry.id, 'playing')).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.setHiddenFromFriends('intruder', entry.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.history('intruder', entry.id)).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.remove('intruder', entry.id)).rejects.toMatchObject({ status: 404 });
    expect(ctx.LibraryEntry.docs[0]).toMatchObject({ status: 'backlog', hiddenFromFriends: false });
  });

  it('refuses a stale status change instead of writing a second history row (double click)', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'G');
    const entry = await ctx.service.add('u1', { gameId: game._id, status: 'backlog' });
    const results = await Promise.allSettled([
      ctx.service.changeStatus('u1', entry.id, 'playing'),
      ctx.service.changeStatus('u1', entry.id, 'playing'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(ctx.StatusHistory.docs.filter((h) => h.to === 'playing')).toHaveLength(1);
  });

  it('lists with status filter, cursor pagination and tab counts', async () => {
    const ctx = setupLibrary();
    for (const [title, status] of [['A', 'backlog'], ['B', 'playing'], ['C', 'backlog'], ['D', 'wishlist']]) {
      const g = await makeGame(ctx, title);
      await ctx.service.add('u1', { gameId: g._id, status });
    }
    const other = await makeGame(ctx, 'Z');
    await ctx.service.add('u2', { gameId: other._id, status: 'backlog' });

    const p1 = await ctx.service.list('u1', { limit: 3 });
    expect(p1.items.map((e) => e.game.title)).toEqual(['D', 'C', 'B']); // newest first
    expect(p1.counts).toEqual({ all: 4, wishlist: 1, backlog: 2, playing: 1, completed: 0, dropped: 0 });
    const p2 = await ctx.service.list('u1', { limit: 3, cursor: p1.nextCursor });
    expect(p2.items.map((e) => e.game.title)).toEqual(['A']);
    expect(p2.nextCursor).toBeNull();
    expect(p2.counts).toBeUndefined();

    const backlog = await ctx.service.list('u1', { status: 'backlog', limit: 10 });
    expect(backlog.items.map((e) => e.game.title)).toEqual(['C', 'A']);
  });

  it('removes an entry together with its history', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'G');
    const entry = await ctx.service.add('u1', { gameId: game._id, status: 'backlog' });
    await ctx.service.remove('u1', entry.id);
    expect(ctx.LibraryEntry.docs).toHaveLength(0);
    expect(ctx.StatusHistory.docs).toHaveLength(0);
  });

  it('toggles hiddenFromFriends', async () => {
    const ctx = setupLibrary();
    const game = await makeGame(ctx, 'G');
    const entry = await ctx.service.add('u1', { gameId: game._id, status: 'backlog' });
    expect((await ctx.service.setHiddenFromFriends('u1', entry.id, true)).hiddenFromFriends).toBe(true);
  });
});

describe('/api/v1/library', () => {
  function setupApp() {
    const config = testConfig();
    const authService = createAuthService({ ...createFakeModels(), config, bcryptRounds: 4, reuseGraceMs: 0 });
    const lib = setupLibrary();
    const gameService = createGameService({ Game: lib.Game, igdb: { isConfigured: () => false }, logger });
    const app = createApp({ config, logger, authService, gameService, libraryService: lib.service });
    return { app, lib };
  }
  const register = async (app, name) => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return agent;
  };

  it('requires authentication', async () => {
    const { app } = setupApp();
    expect((await request(app).get('/api/v1/library')).status).toBe(401);
    expect((await request(app).post('/api/v1/library').send({})).status).toBe(401);
  });

  it('runs the add → move → history → delete flow', async () => {
    const { app, lib } = setupApp();
    const game = await makeGame(lib, 'Hades');
    const agent = await register(app, 'neo');

    const add = await agent.post('/api/v1/library').send({ gameId: game._id });
    expect(add.status).toBe(201);
    expect(add.body.entry.status).toBe('backlog'); // default
    const id = add.body.entry.id;

    expect((await agent.post('/api/v1/library').send({ gameId: game._id })).status).toBe(409);

    const move = await agent.patch(`/api/v1/library/${id}/status`).send({ status: 'playing' });
    expect(move.body.entry.status).toBe('playing');

    const bad = await agent.patch(`/api/v1/library/${id}/status`).send({ status: 'wishlist' });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('CONFLICT');

    const list = await agent.get('/api/v1/library?status=playing');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.counts.playing).toBe(1);

    expect((await agent.get(`/api/v1/library/${id}/history`)).body.history).toHaveLength(2);
    expect((await agent.delete(`/api/v1/library/${id}`)).status).toBe(204);
    expect((await agent.delete(`/api/v1/library/${id}`)).status).toBe(404);
  });

  it('validates input and ignores any userId in the body', async () => {
    const { app, lib } = setupApp();
    const game = await makeGame(lib, 'Hades');
    const agent = await register(app, 'neo');
    expect((await agent.post('/api/v1/library').send({ gameId: 'nope' })).status).toBe(400);
    expect((await agent.post('/api/v1/library').send({ gameId: game._id, status: 'completed' })).status).toBe(400);
    expect((await agent.patch(`/api/v1/library/${'0'.repeat(24)}/status`).send({ status: 'nonsense' })).status).toBe(400);
    expect((await agent.get('/api/v1/library?status=nonsense')).status).toBe(400);

    const add = await agent.post('/api/v1/library').send({ gameId: game._id, userId: 'someone-else' });
    expect(add.status).toBe(201);
    const stored = lib.LibraryEntry.docs[0];
    expect(stored.userId).not.toBe('someone-else');
  });

  it("does not let a user touch or see another user's entries", async () => {
    const { app, lib } = setupApp();
    const game = await makeGame(lib, 'Hades');
    const owner = await register(app, 'owner');
    const other = await register(app, 'other');
    const { id } = (await owner.post('/api/v1/library').send({ gameId: game._id })).body.entry;
    expect((await other.get('/api/v1/library')).body.items).toHaveLength(0);
    expect((await other.patch(`/api/v1/library/${id}/status`).send({ status: 'playing' })).status).toBe(404);
    expect((await other.patch(`/api/v1/library/${id}/visibility`).send({ hiddenFromFriends: true })).status).toBe(404);
    expect((await other.delete(`/api/v1/library/${id}`)).status).toBe(404);
  });
});
