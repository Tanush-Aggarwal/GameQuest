import request from 'supertest';
import { jest } from '@jest/globals';
import { gameSearchQuerySchema } from '@gamequest/shared';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createGameService } from '../services/gameService.js';
import { createIgdbAdapter, normaliseGame } from '../adapters/content/igdb.js';
import { UpstreamError } from '../utils/errors.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

const withTwitch = { TWITCH_CLIENT_ID: 'id', TWITCH_CLIENT_SECRET: 'secret' };

const rawGame = (id, name, extra = {}) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  summary: `${name} summary`,
  first_release_date: 1_600_000_000,
  game_type: 0,
  cover: { image_id: `cover${id}` },
  genres: [{ name: 'RPG' }],
  platforms: [{ name: 'PC' }],
  ...extra,
});

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// Routes the two IGDB-related hosts/endpoints to canned data.
function fakeFetch({ games = [], times = [], tokenStatus = 200 } = {}) {
  return jest.fn(async (url) => {
    if (String(url).startsWith('https://id.twitch.tv')) {
      return tokenStatus === 200 ? jsonResponse({ access_token: 'tok', expires_in: 3600 }) : jsonResponse({}, tokenStatus);
    }
    if (String(url).endsWith('/game_time_to_beats')) return jsonResponse(times);
    return jsonResponse(games);
  });
}

describe('IGDB adapter', () => {
  it('normalises a raw game', () => {
    const g = normaliseGame(rawGame(7, 'Hades', { external_games: [{ category: 1, uid: '1145360' }] }));
    expect(g).toMatchObject({
      title: 'Hades',
      slug: 'hades',
      cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cover7.jpg',
      genres: ['RPG'],
      platforms: ['PC'],
      externalIds: { igdb: 7, steam: '1145360' },
    });
    expect(g.releaseDate).toBeInstanceOf(Date);
  });

  it('throws a clear UpstreamError when Twitch credentials are missing, without calling the network', async () => {
    const fetchImpl = jest.fn();
    const igdb = createIgdbAdapter({ config: testConfig(), fetchImpl });
    expect(igdb.isConfigured()).toBe(false);
    await expect(igdb.search('hades')).rejects.toThrow(/TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET/);
    await expect(igdb.search('hades')).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reuses the access token and merges time to beat (seconds → hours)', async () => {
    const fetchImpl = fakeFetch({
      games: [rawGame(7, 'Hades')],
      times: [{ game_id: 7, hastily: 36000, normally: 72000, completely: 144000 }],
    });
    const igdb = createIgdbAdapter({ config: testConfig(withTwitch), fetchImpl, minIntervalMs: 0 });
    const [game] = await igdb.search('hades');
    expect(game.timeToBeat).toEqual({ main: 20, extras: 10, full: 40 });
    await igdb.search('hades');
    const tokenCalls = fetchImpl.mock.calls.filter(([u]) => String(u).includes('id.twitch.tv'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('escapes quotes in the search term', async () => {
    const fetchImpl = fakeFetch();
    const igdb = createIgdbAdapter({ config: testConfig(withTwitch), fetchImpl, minIntervalMs: 0 });
    await igdb.search('a"; limit 500; "');
    const body = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/games'))[1].body;
    expect(body).toContain('search "a\\"; limit 500; \\"";');
  });

  it('maps a rejected token request to UpstreamError', async () => {
    const igdb = createIgdbAdapter({ config: testConfig(withTwitch), fetchImpl: fakeFetch({ tokenStatus: 403 }), minIntervalMs: 0 });
    await expect(igdb.search('x')).rejects.toThrow(/rejected the IGDB credentials/);
  });

  it('keeps search results when the time-to-beat request fails', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (String(url).includes('id.twitch.tv')) return jsonResponse({ access_token: 'tok', expires_in: 3600 });
      if (String(url).endsWith('/game_time_to_beats')) return jsonResponse({}, 500);
      return jsonResponse([rawGame(1, 'Celeste')]);
    });
    const igdb = createIgdbAdapter({ config: testConfig(withTwitch), fetchImpl, minIntervalMs: 0 });
    const [game] = await igdb.search('celeste');
    expect(game.title).toBe('Celeste');
    expect(game.timeToBeat).toBeUndefined();
  });
});

function setupCatalog({ igdbGames = [], igdbError = null, configured = true, seed = [] } = {}) {
  const Game = createFakeCollection({ unique: [['slug']] });
  const igdb = {
    isConfigured: () => configured,
    search: jest.fn(async () => {
      if (igdbError) throw igdbError;
      return igdbGames.map(normaliseGame);
    }),
    getById: jest.fn(async (id) => igdbGames.map(normaliseGame).find((g) => g.externalIds.igdb === id) ?? null),
  };
  let clock = new Date('2026-10-26T00:00:00Z');
  const gameService = createGameService({ Game, igdb, logger, now: () => clock });
  return { Game, igdb, gameService, setClock: (d) => (clock = d), seed: Promise.all(seed.map((g) => Game.create(g))) };
}

const stored = (title, extra = {}) => ({
  title,
  slug: title.toLowerCase().replace(/\s+/g, '-'),
  genres: ['RPG'],
  platforms: ['PC'],
  externalIds: { igdb: Math.floor(Math.random() * 1e6) },
  popularity: 0,
  cachedAt: new Date('2026-10-26T00:00:00Z'),
  ...extra,
});

describe('gameService.search (cache-first)', () => {
  it('answers from MongoDB without calling IGDB when the page is full', async () => {
    const ctx = setupCatalog({ seed: [stored('Hades'), stored('Hades Two'), stored('Hades Three')] });
    await ctx.seed;
    const res = await ctx.gameService.search({ q: 'hades', limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBe('0~hades-three');
    expect(ctx.igdb.search).not.toHaveBeenCalled();
  });

  it('fetches from IGDB on a cache miss, upserts, and returns the new games', async () => {
    const ctx = setupCatalog({ igdbGames: [rawGame(7, 'Hades')] });
    const res = await ctx.gameService.search({ q: 'hades', limit: 20 });
    expect(res.items.map((g) => g.slug)).toEqual(['hades']);
    expect(ctx.Game.docs[0].externalIds.igdb).toBe(7);
    expect(res.warnings).toEqual([]);
  });

  it('does not duplicate games on repeated fetches and keeps the original slug', async () => {
    const ctx = setupCatalog({ igdbGames: [rawGame(7, 'Hades')], seed: [stored('Hades', { slug: 'old-slug', externalIds: { igdb: 7 }, title: 'Hades' })] });
    await ctx.seed;
    await ctx.gameService.search({ q: 'hades again', limit: 20 }); // miss locally → remote
    expect(ctx.Game.docs).toHaveLength(1);
    expect(ctx.Game.docs[0].slug).toBe('old-slug');
  });

  it('returns cached results plus a warning when IGDB fails (Promise.allSettled)', async () => {
    const ctx = setupCatalog({ igdbError: new UpstreamError('boom'), seed: [stored('Hades')] });
    await ctx.seed;
    const res = await ctx.gameService.search({ q: 'hades', limit: 20 });
    expect(res.items.map((g) => g.slug)).toEqual(['hades']);
    expect(res.warnings).toEqual([expect.objectContaining({ source: 'igdb', code: 'UPSTREAM_ERROR' })]);
  });

  it('serves cached games with a NOT_CONFIGURED warning when credentials are missing', async () => {
    const ctx = setupCatalog({ configured: false, seed: [stored('Hades')] });
    await ctx.seed;
    const res = await ctx.gameService.search({ q: 'hades', limit: 20 });
    expect(res.items).toHaveLength(1);
    expect(res.warnings[0]).toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(ctx.igdb.search).not.toHaveBeenCalled();
  });

  it('does not re-query IGDB for the same term within the cooldown, but retries after a failure', async () => {
    const ctx = setupCatalog({ igdbGames: [] });
    await ctx.gameService.search({ q: 'zzz', limit: 20 });
    await ctx.gameService.search({ q: 'ZZZ', limit: 20 });
    expect(ctx.igdb.search).toHaveBeenCalledTimes(1);

    const failing = setupCatalog({ igdbError: new UpstreamError('x') });
    await failing.gameService.search({ q: 'zzz', limit: 20 });
    await failing.gameService.search({ q: 'zzz', limit: 20 });
    expect(failing.igdb.search).toHaveBeenCalledTimes(2);
  });

  it('filters by genre, platform and max hours and paginates by cursor', async () => {
    const ctx = setupCatalog({
      seed: [
        stored('Alpha', { genres: ['RPG'], timeToBeat: { main: 8 } }),
        stored('Beta', { genres: ['Puzzle'], platforms: ['Switch'], timeToBeat: { main: 3 } }),
        stored('Gamma', { genres: ['RPG'], timeToBeat: { main: 40 } }),
        stored('Delta', { genres: ['RPG'] }),
      ],
    });
    await ctx.seed;
    const s = ctx.gameService;
    expect((await s.search({ genre: 'Puzzle', limit: 20 })).items.map((g) => g.slug)).toEqual(['beta']);
    expect((await s.search({ platform: 'Switch', limit: 20 })).items.map((g) => g.slug)).toEqual(['beta']);
    expect((await s.search({ maxHours: 10, limit: 20 })).items.map((g) => g.slug)).toEqual(['alpha', 'beta']);
    const p1 = await s.search({ limit: 2 });
    expect(p1.items.map((g) => g.slug)).toEqual(['alpha', 'beta']);
    const p2 = await s.search({ limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((g) => g.slug)).toEqual(['delta', 'gamma']);
    expect(p2.nextCursor).toBeNull();
  });

  it('minRating and minHours filter, and every filtered list stays in popularity order', async () => {
    const ctx = setupCatalog({
      seed: [
        stored('Cult Classic', { popularity: 10, totalRating: 92, genres: ['RPG'], timeToBeat: { main: 60 } }),
        stored('Mega Hit', { popularity: 95, totalRating: 88, genres: ['RPG'], timeToBeat: { main: 45 } }),
        stored('Solid', { popularity: 50, totalRating: 81, genres: ['RPG'], timeToBeat: { main: 12 } }),
        stored('Mediocre', { popularity: 99, totalRating: 60, genres: ['RPG'], timeToBeat: { main: 50 } }),
        stored('Unrated', { popularity: 70, genres: ['RPG'], timeToBeat: { main: 5 } }),
        stored('Hidden Gem', { popularity: 80, totalRating: 95, hidden: true, timeToBeat: { main: 50 } }),
      ],
    });
    await ctx.seed;
    const slugs = async (params) => (await ctx.gameService.search({ limit: 20, ...params })).items.map((g) => g.slug);

    // most popular first, not highest rated first (Cult Classic has the best rating but low popularity)
    expect(await slugs({ minRating: 80 })).toEqual(['mega-hit', 'solid', 'cult-classic']);
    expect(await slugs({ minRating: 90 })).toEqual(['cult-classic']);
    expect(await slugs({ minHours: 40 })).toEqual(['mediocre', 'mega-hit', 'cult-classic']); // hidden games never appear
    expect(await slugs({ genre: 'RPG', minHours: 40, minRating: 85 })).toEqual(['mega-hit', 'cult-classic']);
    expect(await slugs({ minHours: 10, maxHours: 20 })).toEqual(['solid']); // a range
    expect(await slugs({ maxHours: 10 })).toEqual(['unrated']);

    const p1 = await ctx.gameService.search({ limit: 2, minRating: 80 });
    expect(p1.items.map((g) => g.slug)).toEqual(['mega-hit', 'solid']);
    const p2 = await ctx.gameService.search({ limit: 2, minRating: 80, cursor: p1.nextCursor });
    expect(p2.items.map((g) => g.slug)).toEqual(['cult-classic']);
  });
});

describe('catalog shelves: release window and rating order', () => {
  const day = (n) => new Date(Date.UTC(2026, 9, 27) + n * 86_400_000);
  it('filters by release window and sorts by rating, leaving out unrated games', async () => {
    const ctx = setupCatalog({
      seed: [
        stored('Old Classic', { popularity: 90, totalRating: 95, releaseDate: day(-2000) }),
        stored('Fresh Hit', { popularity: 60, totalRating: 84, releaseDate: day(-20) }),
        stored('Fresh Meh', { popularity: 70, totalRating: 61, releaseDate: day(-10) }),
        stored('Coming Soon', { popularity: 40, releaseDate: day(30) }),
        stored('Undated', { popularity: 99, totalRating: 99 }),
      ],
    });
    await ctx.seed;
    const slugs = async (params) => (await ctx.gameService.search({ limit: 20, ...params })).items.map((g) => g.slug);

    // new and upcoming: a window from 45 days ago on, most popular first
    expect(await slugs({ releasedAfter: day(-45) })).toEqual(['fresh-meh', 'fresh-hit', 'coming-soon']);
    expect(await slugs({ releasedAfter: day(-45), releasedBefore: day(0) })).toEqual(['fresh-meh', 'fresh-hit']);
    expect(await slugs({ releasedBefore: day(-1000) })).toEqual(['old-classic']);
    // top rated: best rating first, unrated and undated-but-rated rules: only games with a rating appear
    expect(await slugs({ sort: 'rating' })).toEqual(['undated', 'old-classic', 'fresh-hit', 'fresh-meh']);
    expect(await slugs({ sort: 'rating', minRating: 80 })).toEqual(['undated', 'old-classic', 'fresh-hit']);
    expect(await slugs({ sort: 'rating', releasedAfter: day(-45) })).toEqual(['fresh-hit', 'fresh-meh']);
    expect((await ctx.gameService.search({ limit: 2, sort: 'rating' })).nextCursor).toBeNull(); // shelves do not page
  });

  it('the rating order cannot be paged, and dates must be dates', () => {
    expect(gameSearchQuerySchema.safeParse({ sort: 'rating', cursor: '5~x' }).success).toBe(false);
    expect(gameSearchQuerySchema.safeParse({ sort: 'popularity', cursor: '5~x' }).success).toBe(true);
    expect(gameSearchQuerySchema.safeParse({ sort: 'price' }).success).toBe(false);
    expect(gameSearchQuerySchema.safeParse({ releasedAfter: 'soon' }).success).toBe(false);
    expect(gameSearchQuerySchema.safeParse({ releasedAfter: '2026-10-27', releasedBefore: '2026-10-01' }).success).toBe(false);
    expect(gameSearchQuerySchema.safeParse({ releasedAfter: '2026-10-01', releasedBefore: '2026-10-27' }).success).toBe(true);
    const parsed = gameSearchQuerySchema.parse({ releasedAfter: '2026-10-27', sort: 'rating' });
    expect(parsed.releasedAfter).toBeInstanceOf(Date);
    expect(parsed.sort).toBe('rating');
    expect(gameSearchQuerySchema.parse({}).sort).toBe('popularity');
  });
});

describe('game search query schema', () => {
  it('accepts minHours / minRating as numbers and rejects out-of-range values', () => {
    expect(gameSearchQuerySchema.parse({ minHours: '40', minRating: '85' })).toMatchObject({ minHours: 40, minRating: 85, limit: 20 });
    expect(gameSearchQuerySchema.safeParse({ minRating: '101' }).success).toBe(false);
    expect(gameSearchQuerySchema.safeParse({ minHours: '-1' }).success).toBe(false);
    expect(gameSearchQuerySchema.safeParse({ minRating: 'abc' }).success).toBe(false);
  });
});

describe('gameService.getBySlug', () => {
  it('throws NotFoundError for an unknown slug', async () => {
    const ctx = setupCatalog();
    await expect(ctx.gameService.getBySlug('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('refreshes a stale game from IGDB and serves stale data if the refresh fails', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    const ctx = setupCatalog({ igdbGames: [rawGame(7, 'Hades', { summary: 'fresh' })], seed: [stored('Hades', { externalIds: { igdb: 7 }, cachedAt: old, summary: 'stale' })] });
    await ctx.seed;
    expect((await ctx.gameService.getBySlug('hades')).summary).toBe('fresh');

    const failing = setupCatalog({ igdbError: new UpstreamError('x'), seed: [stored('Hades', { externalIds: { igdb: 7 }, cachedAt: old, summary: 'stale' })] });
    await failing.seed;
    failing.igdb.getById.mockRejectedValue(new UpstreamError('x'));
    expect((await failing.gameService.getBySlug('hades')).summary).toBe('stale');
    // A failed refresh is not retried on every view.
    await failing.gameService.getBySlug('hades');
    expect(failing.igdb.getById).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/games', () => {
  function setupApp(catalogOpts) {
    const config = testConfig();
    const authService = createAuthService({ ...createFakeModels(), config, bcryptRounds: 4, reuseGraceMs: 0 });
    const catalog = setupCatalog(catalogOpts);
    const gameService = catalogOpts?.gameService ?? catalog.gameService;
    const app = createApp({ config, logger, authService, gameService });
    return { app, catalog };
  }
  const login = async (app) => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({ username: 'neo', email: 'neo@example.com', password: 'correct-horse-9' });
    return agent;
  };

  it('requires authentication', async () => {
    const { app } = setupApp();
    const res = await request(app).get('/api/v1/games?q=hades');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_ERROR');
  });

  it('validates the query with the shared schema', async () => {
    const { app } = setupApp();
    const agent = await login(app);
    const res = await agent.get('/api/v1/games?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // Express 5's simple query parser never builds operator objects; the odd key is just stripped.
    const injected = await agent.get('/api/v1/games?genre[$ne]=x');
    expect(injected.status).toBe(200);
  });

  it('searches and fetches one game by slug', async () => {
    const { app, catalog } = setupApp({ seed: [stored('Hades')] });
    await catalog.seed;
    const agent = await login(app);
    const list = await agent.get('/api/v1/games?q=hades');
    expect(list.status).toBe(200);
    expect(list.body.items[0]).toMatchObject({ slug: 'hades', title: 'Hades' });
    expect(list.body).toHaveProperty('nextCursor', null);
    const one = await agent.get('/api/v1/games/hades');
    expect(one.body.game.title).toBe('Hades');
    expect((await agent.get('/api/v1/games/missing')).status).toBe(404);
    expect((await agent.get('/api/v1/games/Bad Slug!')).status).toBe(400);
  });
  it('returns friends playing the game', async () => {
    const friendService = {
      listFriends: jest.fn().mockResolvedValue([{ id: 'friend1', username: 'Alex' }]),
    };
    const LibraryEntry = createFakeCollection();
    const Game = createFakeCollection();
    const game = await Game.create({ title: 'Hades', slug: 'hades' });
    await LibraryEntry.create({ userId: 'friend1', gameId: game._id, status: 'playing', manualProgress: 35 });

    const gameService = createGameService({ Game, igdb: { isConfigured: () => false }, friendService, LibraryEntry });
    const { app } = setupApp({ gameService });
    const agent = await login(app);
    const res = await agent.get('/api/v1/games/hades/friends');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ username: 'Alex', status: 'playing', manualProgress: 35 });
  });
  it('leaves out friends whose profile is private', async () => {
    const User = createFakeCollection();
    const open = await User.create({ username: 'open', privacy: 'friends' });
    const closed = await User.create({ username: 'closed', privacy: 'private' });
    const friendService = {
      listFriends: jest.fn().mockResolvedValue([
        { id: open._id, username: 'open' },
        { id: closed._id, username: 'closed' },
      ]),
    };
    const LibraryEntry = createFakeCollection();
    const Game = createFakeCollection();
    const game = await Game.create({ title: 'Hades', slug: 'hades' });
    await LibraryEntry.create({ userId: open._id, gameId: game._id, status: 'playing' });
    await LibraryEntry.create({ userId: closed._id, gameId: game._id, status: 'playing' });

    const gameService = createGameService({ Game, igdb: { isConfigured: () => false }, friendService, LibraryEntry, User });
    const { items } = await gameService.getFriendsPlaying('viewer', 'hades');
    expect(items.map((i) => i.username)).toEqual(['open']);
  });
});