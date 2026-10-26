import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createYoutubeAdapter, isVideoId } from '../adapters/content/youtube.js';
import { createTrailerService } from '../services/trailerService.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

const KEY = 'YTSECRETKEY1234567890';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const VID = 'dQw4w9WgXcQ';
const IGDB_VID = 'abcDEF12345';

const reply = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
const found = (id = VID) => reply({ items: [{ id: { videoId: id } }] });

describe('isVideoId', () => {
  it('accepts 11-character ids and nothing else', () => {
    expect(isVideoId(VID)).toBe(true);
    expect(isVideoId('a-b_c1234567'.slice(0, 11))).toBe(true);
    for (const bad of ['', 'short', 'way-too-long-id', 'has space!!', '"><script>', null, undefined, 12345678901]) expect(isVideoId(bad)).toBe(false);
  });
});

describe('youtube adapter', () => {
  const adapter = (fetchImpl, apiKey = KEY) => createYoutubeAdapter({ config: testConfig({ YOUTUBE_API_KEY: apiKey }), fetchImpl });

  it('searches "<title> official trailer" for one embeddable video', async () => {
    const fetchImpl = jest.fn(async () => found());
    await expect(adapter(fetchImpl).searchTrailer('Hades')).resolves.toEqual({ videoId: VID });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'Hades official trailer',
      type: 'video',
      videoEmbeddable: 'true',
      maxResults: '1',
      part: 'snippet',
    });
  });

  it('returns null for no results or a malformed id', async () => {
    await expect(adapter(jest.fn(async () => reply({ items: [] }))).searchTrailer('X')).resolves.toBeNull();
    await expect(adapter(jest.fn(async () => reply({}))).searchTrailer('X')).resolves.toBeNull();
    await expect(adapter(jest.fn(async () => found('"><script>'))).searchTrailer('X')).resolves.toBeNull();
  });

  it('turns quota/key problems and outages into UpstreamError without leaking the key; only 403/429 are quota errors', async () => {
    for (const status of [403, 429, 500]) {
      const err = await adapter(jest.fn(async () => reply({ error: { message: `bad key ${KEY}` } }, status))).searchTrailer('X').catch((e) => e);
      expect(err).toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' });
      expect(err.message).not.toContain(KEY);
      expect(Boolean(err.quota)).toBe(status !== 500);
    }
    const net = await adapter(jest.fn(async (url) => { throw new Error(`failed ${url}`); })).searchTrailer('X').catch((e) => e);
    expect(net.status).toBe(502);
    expect(net.message).not.toContain(KEY);
  });

  it('is not configured without a key and never calls YouTube', async () => {
    const fetchImpl = jest.fn();
    const yt = adapter(fetchImpl, '');
    expect(yt.isConfigured()).toBe(false);
    await expect(yt.searchTrailer('X')).rejects.toMatchObject({ status: 502 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('trailerService', () => {
  function setup({ configured = true, search } = {}) {
    const Game = createFakeCollection({ unique: [['slug']] });
    const MediaCache = createFakeCollection({ unique: [['gameId', 'source']] });
    const youtube = {
      isConfigured: () => configured,
      searchTrailer: jest.fn(search ?? (async () => ({ videoId: VID }))),
    };
    let clock = new Date('2026-10-27T10:00:00Z');
    const service = createTrailerService({ Game, MediaCache, youtube, logger, now: () => clock });
    const mk = (extra = {}) => Game.create({ title: 'Hades', slug: 'hades', videos: [], ...extra });
    return { Game, MediaCache, youtube, service, mk, setNow: (d) => { clock = d; } };
  }
  const span = (row) => new Date(row.expiresAt).getTime() - new Date(row.fetchedAt).getTime();

  it('uses the IGDB video stored on the game first, with no YouTube call and no cache row', async () => {
    const s = setup();
    await s.mk({ videos: ['bad', IGDB_VID, 'zzzzzzzzzzz'] });
    await expect(s.service.getTrailer('hades')).resolves.toEqual({ videoId: IGDB_VID, source: 'igdb' });
    expect(s.youtube.searchTrailer).not.toHaveBeenCalled();
    expect(s.MediaCache.docs).toHaveLength(0);
  });

  it('searches YouTube once when there is no IGDB video, and caches the result for 7 days', async () => {
    const s = setup();
    const game = await s.mk();
    await expect(s.service.getTrailer('hades')).resolves.toEqual({ videoId: VID, source: 'youtube' });
    expect(s.youtube.searchTrailer).toHaveBeenCalledWith('Hades');
    expect(s.MediaCache.docs[0]).toMatchObject({ gameId: game._id, source: 'youtube', payload: { videoId: VID } });
    expect(span(s.MediaCache.docs[0])).toBe(7 * DAY);

    // later views, even days later, are served from the cache: never a second call within 7 days
    for (let i = 0; i < 5; i += 1) await s.service.getTrailer('hades');
    s.setNow(new Date('2026-11-02T09:00:00Z')); // 6 days 23 h later
    await expect(s.service.getTrailer('hades')).resolves.toEqual({ videoId: VID, source: 'youtube' });
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
    expect(s.MediaCache.docs).toHaveLength(1);
  });

  it('searches again once the 7 days are over', async () => {
    const s = setup();
    await s.mk();
    await s.service.getTrailer('hades');
    s.setNow(new Date('2026-11-03T11:00:00Z')); // 7 days + 1 h
    await s.service.getTrailer('hades');
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(2);
    expect(s.MediaCache.docs).toHaveLength(1);
  });

  it('caches "no video found" for 7 days too, so an obscure game does not cost quota on every view', async () => {
    const s = setup({ search: async () => null });
    await s.mk();
    await expect(s.service.getTrailer('hades')).resolves.toBeNull();
    await expect(s.service.getTrailer('hades')).resolves.toBeNull();
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
    expect(span(s.MediaCache.docs[0])).toBe(7 * DAY);
  });

  it('quota guard: a failing call is remembered for an hour, never retried per page view, and never fails the request', async () => {
    const s = setup({ search: async () => { throw new Error('quotaExceeded'); } });
    await s.mk();
    await expect(s.service.getTrailer('hades')).resolves.toBeNull();
    for (let i = 0; i < 10; i += 1) await expect(s.service.getTrailer('hades')).resolves.toBeNull();
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
    expect(s.MediaCache.docs[0].payload).toMatchObject({ videoId: null, failed: true });
    expect(span(s.MediaCache.docs[0])).toBe(HOUR);

    s.youtube.searchTrailer.mockResolvedValue({ videoId: VID });
    s.setNow(new Date('2026-10-27T11:01:00Z')); // an hour later the key may be fine again
    await expect(s.service.getTrailer('hades')).resolves.toEqual({ videoId: VID, source: 'youtube' });
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(2);
    expect(span(s.MediaCache.docs[0])).toBe(7 * DAY);
  });

  it('a quota/key error pauses YouTube for every game for 24 hours; an ordinary failure does not', async () => {
    const quota = () => Object.assign(new Error('quota'), { quota: true });
    const s = setup({ search: async () => { throw quota(); } });
    await s.mk({ slug: 'a', title: 'A' });
    await s.mk({ slug: 'b', title: 'B' });
    await s.service.getTrailer('a');
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
    s.youtube.searchTrailer.mockResolvedValue({ videoId: VID });
    await expect(s.service.getTrailer('b')).resolves.toBeNull(); // a different game, but the whole API is paused
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
    expect(s.MediaCache.docs).toHaveLength(1); // the paused game left no cache row, so it is tried after the pause

    s.setNow(new Date('2026-10-28T10:01:00Z')); // 24 h later
    await expect(s.service.getTrailer('b')).resolves.toEqual({ videoId: VID, source: 'youtube' });

    const plain = setup({ search: async () => { throw new Error('timeout'); } });
    await plain.mk({ slug: 'a', title: 'A' });
    await plain.mk({ slug: 'b', title: 'B' });
    await plain.service.getTrailer('a');
    plain.youtube.searchTrailer.mockResolvedValue({ videoId: VID });
    await expect(plain.service.getTrailer('b')).resolves.toEqual({ videoId: VID, source: 'youtube' });
  });

  it('never searches twice in 7 days even when the database cannot store or return the answer', async () => {
    const s = setup();
    await s.mk();
    s.MediaCache.findOneAndUpdate = async () => { throw new Error('db down'); };
    s.MediaCache.findOne = () => { throw new Error('db down'); };
    await expect(s.service.getTrailer('hades')).resolves.toEqual({ videoId: VID, source: 'youtube' });
    await expect(s.service.getTrailer('hades')).resolves.toEqual({ videoId: VID, source: 'youtube' });
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
  });

  it('does not search again when a stale cache read misses an answer that was just stored', async () => {
    const s = setup();
    await s.mk();
    await s.service.getTrailer('hades');
    s.MediaCache.findOne = () => Promise.resolve(null); // a replica that has not seen the write yet
    await s.service.getTrailer('hades');
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
  });

  it('shares one YouTube call between simultaneous requests for the same game', async () => {
    let release;
    const s = setup({ search: () => new Promise((resolve) => { release = () => resolve({ videoId: VID }); }) });
    await s.mk();
    const all = Promise.all([s.service.getTrailer('hades'), s.service.getTrailer('hades'), s.service.getTrailer('hades')]);
    await new Promise((r) => setImmediate(r));
    release();
    const results = await all;
    expect(results.every((r) => r.videoId === VID)).toBe(true);
    expect(s.youtube.searchTrailer).toHaveBeenCalledTimes(1);
  });

  it('returns null without calling YouTube or writing a cache row when no key is configured', async () => {
    const s = setup({ configured: false });
    await s.mk();
    await expect(s.service.getTrailer('hades')).resolves.toBeNull();
    expect(s.youtube.searchTrailer).not.toHaveBeenCalled();
    expect(s.MediaCache.docs).toHaveLength(0);
  });

  it('404s for an unknown game', async () => {
    await expect(setup().service.getTrailer('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('keeps going when the cache row cannot be written (concurrent writer)', async () => {
    const s = setup();
    await s.mk();
    s.MediaCache.findOneAndUpdate = async () => { throw Object.assign(new Error('E11000'), { code: 11000 }); };
    await expect(s.service.getTrailer('hades')).resolves.toEqual({ videoId: VID, source: 'youtube' });
  });
});

describe('GET /api/v1/games/:slug/trailer', () => {
  function setupApp(youtubeFetch) {
    const models = createFakeModels();
    const config = testConfig({ YOUTUBE_API_KEY: KEY });
    const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
    const Game = createFakeCollection({ unique: [['slug']] });
    const MediaCache = createFakeCollection({ unique: [['gameId', 'source']] });
    const youtube = createYoutubeAdapter({ config, fetchImpl: youtubeFetch });
    const trailerService = createTrailerService({ Game, MediaCache, youtube, logger });
    const app = createApp({ config, logger, authService, trailerService });
    return { app, Game };
  }

  it('requires authentication', async () => {
    const { app } = setupApp(jest.fn());
    expect((await request(app).get('/api/v1/games/hades/trailer')).status).toBe(401);
  });

  it('answers { trailer } from the cache after one YouTube call, and { trailer: null } when there is none', async () => {
    const fetchImpl = jest.fn(async () => found());
    const { app, Game } = setupApp(fetchImpl);
    await Game.create({ title: 'Hades', slug: 'hades', videos: [] });
    await Game.create({ title: 'Obscure', slug: 'obscure', videos: [] });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({ username: 'neo', email: 'neo@example.com', password: 'correct-horse-9' });

    const first = await agent.get('/api/v1/games/hades/trailer');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ trailer: { videoId: VID, source: 'youtube' } });
    await agent.get('/api/v1/games/hades/trailer');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first.body)).not.toContain(KEY);

    fetchImpl.mockResolvedValue(reply({ items: [] }));
    expect((await agent.get('/api/v1/games/obscure/trailer')).body).toEqual({ trailer: null });
    expect((await agent.get('/api/v1/games/missing/trailer')).status).toBe(404);
    expect((await agent.get('/api/v1/games/BAD SLUG/trailer')).status).toBe(400);
  });
});
