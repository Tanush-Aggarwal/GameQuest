import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createYoutubeAdapter, isVideoId, parseDuration } from '../adapters/content/youtube.js';
import { CACHE_VERSION, createTrailerService } from '../services/trailerService.js';
import { createFakeCollection, createFakeModels, logger as silentLogger, testConfig } from './helpers.js';

const KEY = 'YTSECRETKEY1234567890';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const reply = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
const id = (s) => s.padEnd(11, 'x').slice(0, 11);

// Details as the adapter's getVideos() returns them.
const vid = (key, title, extra = {}) => ({
  videoId: id(key),
  title,
  channel: 'Some Channel',
  durationSec: 120,
  embeddable: true,
  privacy: 'public',
  uploadStatus: 'processed',
  regionBlocked: null,
  regionAllowed: null,
  defaultLanguage: null,
  defaultAudioLanguage: null,
  views: 100_000,
  ...extra,
});

describe('isVideoId / parseDuration', () => {
  it('accepts 11-character ids and nothing else', () => {
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true);
    for (const bad of ['', 'short', 'way-too-long-id', 'has space!!', '"><script>', null, undefined, 12345678901]) expect(isVideoId(bad)).toBe(false);
  });

  it('reads ISO 8601 durations', () => {
    expect(parseDuration('PT1M5S')).toBe(65);
    expect(parseDuration('PT2M30S')).toBe(150);
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('PT45S')).toBe(45);
    expect(parseDuration('P1DT1H')).toBe(90000);
    expect(parseDuration('garbage')).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration('PT')).toBeNull();
  });
});

describe('youtube adapter', () => {
  const adapter = (fetchImpl, apiKey = KEY) => createYoutubeAdapter({ config: testConfig({ YOUTUBE_API_KEY: apiKey }), fetchImpl });
  const item = (videoId, title = 'T', channelTitle = 'C') => ({ id: { videoId }, snippet: { title, channelTitle } });

  it('searches with the filters that keep results embeddable, English-leaning and gaming', async () => {
    const fetchImpl = jest.fn(async () => reply({ items: [item(id('a'), 'Hades Trailer', 'Supergiant Games'), item('bad id'), item(id('b'))] }));
    const yt = adapter(fetchImpl);
    await expect(yt.search('Hades official trailer')).resolves.toEqual([
      { videoId: id('a'), title: 'Hades Trailer', channel: 'Supergiant Games' },
      { videoId: id('b'), title: 'T', channel: 'C' },
    ]);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'Hades official trailer',
      type: 'video',
      videoEmbeddable: 'true',
      videoCategoryId: '20',
      relevanceLanguage: 'en',
      regionCode: 'US',
      maxResults: '10',
      part: 'snippet',
    });
  });

  it('reads video details with one videos.list call per 50 ids, and tracks quota units', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `vid${String(i).padStart(8, '0')}`);
    const fetchImpl = jest.fn(async (url) => {
      const param = new URL(url).searchParams.get('id');
      if (!param) return reply({ items: [] }); // the search.list call at the end of the test
      const asked = param.split(',');
      return reply({
        items: asked.slice(0, 1).map((videoId) => ({
          id: videoId,
          snippet: { title: 'Hades – Launch Trailer', channelTitle: 'Supergiant Games', defaultAudioLanguage: 'en', defaultLanguage: 'en-US' },
          contentDetails: { duration: 'PT1M30S', regionRestriction: { blocked: ['RU'] } },
          status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' },
          statistics: { viewCount: '12345' },
        })),
      });
    });
    const yt = adapter(fetchImpl);
    const found = await yt.getVideos([...ids, ids[0], 'not an id']);

    expect(fetchImpl).toHaveBeenCalledTimes(3); // 50 + 50 + 20
    expect(fetchImpl.mock.calls.map((c) => new URL(c[0]).searchParams.get('id').split(',').length)).toEqual([50, 50, 20]);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('part')).toBe('snippet,contentDetails,status,statistics');
    expect(found.size).toBe(3); // YouTube answered for one id per call; the rest are simply absent
    expect(found.get(ids[0])).toEqual({
      videoId: ids[0],
      title: 'Hades – Launch Trailer',
      channel: 'Supergiant Games',
      durationSec: 90,
      embeddable: true,
      privacy: 'public',
      uploadStatus: 'processed',
      regionBlocked: ['RU'],
      regionAllowed: null,
      defaultLanguage: 'en-US',
      defaultAudioLanguage: 'en',
      views: 12345,
    });
    expect(yt.usage()).toEqual({ units: 3, searches: 0, listCalls: 3 }); // videos.list costs 1 unit per call

    await yt.search('x');
    expect(yt.usage()).toMatchObject({ units: 103, searches: 1 }); // search.list costs 100
  });

  it('makes no call for an empty or invalid id list', async () => {
    const fetchImpl = jest.fn();
    const found = await adapter(fetchImpl).getVideos(['', 'nope']);
    expect(found.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns quota/key problems and outages into UpstreamError without leaking the key; only 403/429 are quota errors', async () => {
    for (const status of [403, 429, 500]) {
      const err = await adapter(jest.fn(async () => reply({ error: { message: `bad key ${KEY}` } }, status))).search('X').catch((e) => e);
      expect(err).toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' });
      expect(err.message).not.toContain(KEY);
      expect(Boolean(err.quota)).toBe(status !== 500);
    }
    const net = await adapter(jest.fn(async (url) => { throw new Error(`failed ${url}`); })).getVideos([id('a')]).catch((e) => e);
    expect(net.status).toBe(502);
    expect(net.message).not.toContain(KEY);
  });

  it('is not configured without a key and never calls YouTube', async () => {
    const fetchImpl = jest.fn();
    const yt = adapter(fetchImpl, '');
    expect(yt.isConfigured()).toBe(false);
    await expect(yt.search('X')).rejects.toMatchObject({ status: 502 });
    await expect(yt.getVideos([id('a')])).rejects.toMatchObject({ status: 502 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── the trailer service ─────────────────────────────────────────────────────────────────────────
const WITCHER = 'The Witcher 3: Wild Hunt';
const Q1 = `${WITCHER} official gameplay trailer`;
const Q2 = `${WITCHER} official trailer`;
const DIARY = vid('diary', `${WITCHER} – Developer Diary: Creating the Sound`);
const GAMEPLAY = vid('gamepl', `${WITCHER} – Official Gameplay Trailer`, { channel: 'CD PROJEKT RED', views: 7_000_000 });
const LAUNCH = vid('launch', `${WITCHER} – Launch Trailer`, { channel: 'CD PROJEKT RED', views: 5_000_000 });
const PLAIN = vid('plain', `${WITCHER} Trailer`, { views: 20_000 });
const SPANISH = vid('spanis', `${WITCHER} – Tráiler oficial en español`);
const OTHER_GAME = vid('cyber', 'Cyberpunk 2077 – Official Trailer');

function setup({ details = [], searches = {}, configured = true, searchError = null, listError = null } = {}) {
  const Game = createFakeCollection({ unique: [['slug']] });
  const MediaCache = createFakeCollection({ unique: [['gameId', 'source']] });
  const byId = new Map(details.map((d) => [d.videoId, d]));
  const youtube = {
    isConfigured: () => configured,
    search: jest.fn(async (query) => {
      if (searchError) throw searchError;
      return (searches[query] ?? []).map((v) => ({ videoId: v.videoId, title: v.title, channel: v.channel }));
    }),
    getVideos: jest.fn(async (ids) => {
      if (listError) throw listError;
      return new Map(ids.filter((i) => byId.has(i)).map((i) => [i, byId.get(i)]));
    }),
  };
  let clock = new Date('2026-10-27T10:00:00Z');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const make = (extra = {}) => createTrailerService({ Game, MediaCache, youtube, logger, now: () => clock, ...extra });
  const mk = (extra = {}) =>
    Game.create({ title: WITCHER, slug: 'witcher-3', developer: ['CD PROJEKT RED'], publisher: ['CD PROJEKT RED'], videos: [], videoMeta: [], ...extra });
  return { Game, MediaCache, youtube, logger, service: make(), make, mk, setNow: (d) => { clock = d; } };
}
const evaluations = (s) => s.logger.info.mock.calls.filter((c) => c[1] === 'trailer evaluation').map((c) => c[0]);
const trailersRow = (s) => s.MediaCache.docs.find((d) => d.source === 'trailers');
const span = (row) => new Date(row.expiresAt).getTime() - new Date(row.fetchedAt).getTime();

describe('trailerService: candidates and validation', () => {
  it('validates IGDB videos with one videos.list call, rejects the developer diary, and never searches when one passes', async () => {
    const s = setup({ details: [DIARY, GAMEPLAY] });
    await s.mk({ videos: [DIARY.videoId, GAMEPLAY.videoId], videoMeta: [{ id: DIARY.videoId, name: 'Developer Diary' }, { id: GAMEPLAY.videoId, name: 'Gameplay video' }] });

    await expect(s.service.getTrailers('witcher-3')).resolves.toEqual([{ videoId: GAMEPLAY.videoId, label: 'Gameplay trailer', source: 'igdb' }]);

    expect(s.youtube.search).not.toHaveBeenCalled();
    expect(s.youtube.getVideos).toHaveBeenCalledTimes(1);
    expect(s.youtube.getVideos.mock.calls[0][0].sort()).toEqual([DIARY.videoId, GAMEPLAY.videoId].sort());
    expect(trailersRow(s).payload).toMatchObject({ v: CACHE_VERSION, searched: false });
    expect(trailersRow(s).payload.pool.map((p) => p.videoId)).toEqual([GAMEPLAY.videoId]);
    expect(span(trailersRow(s))).toBe(7 * DAY);
    expect(evaluations(s)).toEqual([expect.objectContaining({ slug: 'witcher-3', units: 1, searches: 0, listCalls: 1, picked: 1, from: 'igdb' })]);
  });

  it('searches "<title> official gameplay trailer" when every IGDB video is rejected, and stops when it finds one', async () => {
    const s = setup({ details: [DIARY, GAMEPLAY], searches: { [Q1]: [GAMEPLAY] } });
    await s.mk({ videos: [DIARY.videoId] });

    await expect(s.service.getTrailers('witcher-3')).resolves.toEqual([{ videoId: GAMEPLAY.videoId, label: 'Gameplay trailer', source: 'youtube' }]);

    expect(s.youtube.search.mock.calls.map((c) => c[0])).toEqual([Q1]); // the second query was not needed
    expect(evaluations(s)).toEqual([expect.objectContaining({ searches: 1, listCalls: 2, units: 102, from: 'youtube' })]);
    expect(trailersRow(s).payload.searched).toBe(true);
  });

  it('falls back to "<title> official trailer" only when the first query yields nothing that passes', async () => {
    const s = setup({
      details: [DIARY, SPANISH, OTHER_GAME, LAUNCH],
      searches: { [Q1]: [DIARY, SPANISH, OTHER_GAME], [Q2]: [OTHER_GAME, LAUNCH] },
    });
    await s.mk();

    await expect(s.service.getTrailers('witcher-3')).resolves.toEqual([{ videoId: LAUNCH.videoId, label: 'Launch trailer', source: 'youtube' }]);

    expect(s.youtube.search.mock.calls.map((c) => c[0])).toEqual([Q1, Q2]);
    // the second query's already-rejected result was not validated again
    expect(s.youtube.getVideos.mock.calls[1][0]).toEqual([LAUNCH.videoId]);
    expect(evaluations(s)).toEqual([expect.objectContaining({ searches: 2, listCalls: 2, units: 202 })]);
  });

  it('shows nothing, and remembers that for 7 days, when no candidate passes', async () => {
    const s = setup({ details: [DIARY, SPANISH, OTHER_GAME], searches: { [Q1]: [DIARY, SPANISH], [Q2]: [OTHER_GAME] } });
    await s.mk({ videos: [DIARY.videoId] });
    await expect(s.service.getTrailers('witcher-3')).resolves.toEqual([]);
    expect(trailersRow(s).payload.pool).toEqual([]);
    expect(span(trailersRow(s))).toBe(7 * DAY);
    const searches = s.youtube.search.mock.calls.length;
    for (let i = 0; i < 5; i += 1) await expect(s.service.getTrailers('witcher-3')).resolves.toEqual([]);
    expect(s.youtube.search.mock.calls.length).toBe(searches);
  });

  it('returns at most 3, best first, and keeps the best 8 in the cache', async () => {
    const many = Array.from({ length: 10 }, (_, i) => vid(`t${i}`, `${WITCHER} Trailer`, { views: 1000 * (i + 1) }));
    const best = vid('best', `${WITCHER} – Official Gameplay Trailer`, { channel: 'CD PROJEKT RED', views: 9_000_000 });
    const s = setup({ details: [...many, best] });
    await s.mk({ videos: [...many, best].map((v) => v.videoId) });
    const shown = await s.service.getTrailers('witcher-3');
    expect(shown).toHaveLength(3);
    expect(shown[0]).toMatchObject({ videoId: best.videoId, label: 'Gameplay trailer' });
    expect(shown.map((t) => t.videoId)).toEqual(trailersRow(s).payload.pool.slice(0, 3).map((p) => p.videoId));
    expect(trailersRow(s).payload.pool).toHaveLength(8);
  });

  it('uses IGDB names as a hint but never trusts them over the video itself', async () => {
    // IGDB calls the developer diary a "Trailer": the title check still rejects it
    const s = setup({ details: [DIARY, PLAIN] });
    await s.mk({ videos: [DIARY.videoId, PLAIN.videoId], videoMeta: [{ id: DIARY.videoId, name: 'Trailer' }, { id: PLAIN.videoId, name: 'Trailer' }] });
    const shown = await s.service.getTrailers('witcher-3');
    expect(shown.map((t) => t.videoId)).toEqual([PLAIN.videoId]);
  });

  it('404s for an unknown game', async () => {
    await expect(setup().service.getTrailers('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('trailerService: cache version and quota guard', () => {
  it('recomputes picks cached by the old version (and ignores the old youtube-source rows)', async () => {
    const s = setup({ details: [GAMEPLAY] });
    const game = await s.mk({ videos: [GAMEPLAY.videoId] });
    const future = new Date('2026-11-01T00:00:00Z');
    await s.MediaCache.create({ gameId: game._id, source: 'trailers', payload: { v: 1, pool: [{ videoId: id('old'), label: 'Trailer', source: 'igdb' }] }, fetchedAt: new Date(), expiresAt: future });
    await s.MediaCache.create({ gameId: game._id, source: 'youtube', payload: { videoId: id('older') }, fetchedAt: new Date(), expiresAt: future });

    const shown = await s.service.getTrailers('witcher-3');

    expect(shown.map((t) => t.videoId)).toEqual([GAMEPLAY.videoId]);
    expect(s.youtube.getVideos).toHaveBeenCalledTimes(1);
    expect(trailersRow(s).payload.v).toBe(CACHE_VERSION);
  });

  it('costs at most one search round per game per 7 days, even when the database cannot store or return the answer', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH] } });
    await s.mk();
    s.MediaCache.findOneAndUpdate = async () => { throw new Error('db down'); };
    s.MediaCache.findOne = () => { throw new Error('db down'); };
    for (let i = 0; i < 10; i += 1) await expect(s.service.getTrailers('witcher-3')).resolves.toHaveLength(1);
    expect(s.youtube.search).toHaveBeenCalledTimes(1);
  });

  it('searches again once the 7 days are over, and not a minute before', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH] } });
    await s.mk();
    await s.service.getTrailers('witcher-3');
    s.setNow(new Date('2026-11-03T09:59:00Z')); // 6 days 23 h 59 min later
    await s.service.getTrailers('witcher-3');
    expect(s.youtube.search).toHaveBeenCalledTimes(1);
    s.setNow(new Date('2026-11-03T10:01:00Z'));
    await s.service.getTrailers('witcher-3');
    expect(s.youtube.search).toHaveBeenCalledTimes(2);
    expect(s.MediaCache.docs.filter((d) => d.source === 'trailers')).toHaveLength(1);
  });

  it('remembers a failed lookup for 6 hours, never retries per page view, and never fails the request', async () => {
    const s = setup({ searchError: new Error('timeout') });
    await s.mk();
    for (let i = 0; i < 6; i += 1) await expect(s.service.getTrailers('witcher-3')).resolves.toEqual([]);
    expect(s.youtube.search).toHaveBeenCalledTimes(1);
    expect(trailersRow(s).payload).toMatchObject({ v: CACHE_VERSION, pool: [], failed: true });
    expect(span(trailersRow(s))).toBe(6 * HOUR); // at most 4 attempts a day per game, not 24
    expect(s.service.isPaused()).toBe(false); // an ordinary error does not pause other games

    s.setNow(new Date('2026-10-27T15:59:00Z')); // not yet
    await s.service.getTrailers('witcher-3');
    expect(s.youtube.search).toHaveBeenCalledTimes(1);
    s.setNow(new Date('2026-10-27T16:01:00Z'));
    await s.service.getTrailers('witcher-3');
    expect(s.youtube.search).toHaveBeenCalledTimes(2);
  });

  it('a quota/key error (403/429) pauses every lookup for 24 hours', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH] }, searchError: Object.assign(new Error('quota'), { quota: true }) });
    await s.mk({ slug: 'a' });
    await s.mk({ slug: 'b', title: 'Another Game' });
    await s.service.getTrailers('a');
    expect(s.service.isPaused()).toBe(true);
    expect(s.logger.error).toHaveBeenCalled();
    const calls = [s.youtube.search.mock.calls.length, s.youtube.getVideos.mock.calls.length];

    await expect(s.service.getTrailers('b')).resolves.toEqual([]); // a different game, but the whole API is paused
    expect([s.youtube.search.mock.calls.length, s.youtube.getVideos.mock.calls.length]).toEqual(calls);
    expect(s.MediaCache.docs.filter((d) => d.source === 'trailers')).toHaveLength(1); // the paused game left no row

    s.setNow(new Date('2026-10-28T10:01:00Z')); // 24 h later
    expect(s.service.isPaused()).toBe(false);
    await s.service.getTrailers('b');
    expect(s.youtube.search.mock.calls.length).toBeGreaterThan(calls[0]);
  });

  it('shares one evaluation between simultaneous requests for the same game', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH] } });
    await s.mk();
    const all = await Promise.all([s.service.getTrailers('witcher-3'), s.service.getTrailers('witcher-3'), s.service.getTrailers('witcher-3')]);
    expect(all.every((r) => r[0].videoId === LAUNCH.videoId)).toBe(true);
    expect(s.youtube.search).toHaveBeenCalledTimes(1);
  });

  it('shows nothing, calls nothing and caches nothing without a YouTube key', async () => {
    const s = setup({ configured: false, details: [LAUNCH] });
    await s.mk({ videos: [LAUNCH.videoId] });
    await expect(s.service.getTrailers('witcher-3')).resolves.toEqual([]);
    expect(s.youtube.getVideos).not.toHaveBeenCalled();
    expect(s.youtube.search).not.toHaveBeenCalled();
    expect(s.MediaCache.docs).toHaveLength(0);
  });
});

describe('trailerService: "Wrong trailer?"', () => {
  const threeGood = () => setup({ details: [GAMEPLAY, LAUNCH, PLAIN] });
  const mkThree = (s) => s.mk({ videos: [GAMEPLAY.videoId, LAUNCH.videoId, PLAIN.videoId] });
  const ids = (list) => list.map((t) => t.videoId);
  const dismissedRow = (s) => s.MediaCache.docs.find((d) => d.source === 'trailer-dismissed');

  it('hides the video for the reporter at once and shows the next candidate, with no new YouTube call', async () => {
    const s = threeGood();
    await mkThree(s);
    expect(ids(await s.service.getTrailers('witcher-3', 'u1'))).toEqual([GAMEPLAY.videoId, LAUNCH.videoId, PLAIN.videoId]);
    const calls = [s.youtube.search.mock.calls.length, s.youtube.getVideos.mock.calls.length];

    const result = await s.service.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId);

    expect(result).toMatchObject({ changed: true, dropped: false });
    expect(ids(result.trailers)).toEqual([LAUNCH.videoId, PLAIN.videoId]);
    expect(ids(await s.service.getTrailers('witcher-3', 'u1'))).toEqual([LAUNCH.videoId, PLAIN.videoId]);
    expect([s.youtube.search.mock.calls.length, s.youtube.getVideos.mock.calls.length]).toEqual(calls);
    expect(dismissedRow(s).payload.reports[GAMEPLAY.videoId]).toEqual(['u1']);
    expect(s.logger.info).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', videoId: GAMEPLAY.videoId, reporters: 1, dropped: false }), 'trailer reported as wrong');
  });

  it('one account cannot remove a video for everyone: other viewers still see it', async () => {
    const s = threeGood();
    await mkThree(s);
    await s.service.getTrailers('witcher-3');
    await s.service.reportTrailer('troll', 'witcher-3', GAMEPLAY.videoId);
    expect(ids(await s.service.getTrailers('witcher-3', 'someone-else'))).toContain(GAMEPLAY.videoId);
    expect(ids(await s.service.getTrailers('witcher-3', 'troll'))).not.toContain(GAMEPLAY.videoId);
    // reporting the same video again is not a second vote
    const again = await s.service.reportTrailer('troll', 'witcher-3', GAMEPLAY.videoId);
    expect(again.changed).toBe(false);
    expect(ids(await s.service.getTrailers('witcher-3', 'someone-else'))).toContain(GAMEPLAY.videoId);
  });

  it('drops the video for everyone once two different users reported it, and keeps that across restarts', async () => {
    const s = threeGood();
    await mkThree(s);
    await s.service.getTrailers('witcher-3');
    await s.service.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId);
    const second = await s.service.reportTrailer('u2', 'witcher-3', GAMEPLAY.videoId);
    expect(second).toMatchObject({ changed: true, dropped: true });
    expect(dismissedRow(s).payload.dropped).toEqual([GAMEPLAY.videoId]);
    expect(dismissedRow(s).payload.reports[GAMEPLAY.videoId].sort()).toEqual(['u1', 'u2']);

    expect(ids(await s.service.getTrailers('witcher-3', 'u3'))).toEqual([LAUNCH.videoId, PLAIN.videoId]);
    const restarted = s.make(); // a new process: empty memo, same database
    expect(ids(await restarted.getTrailers('witcher-3', 'u3'))).toEqual([LAUNCH.videoId, PLAIN.videoId]);
  });

  it('a dropped video never comes back after the cached pick expires', async () => {
    const s = threeGood();
    await mkThree(s);
    await s.service.getTrailers('witcher-3');
    await s.service.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId);
    await s.service.reportTrailer('u2', 'witcher-3', GAMEPLAY.videoId);
    s.setNow(new Date('2026-11-05T10:00:00Z')); // pick expired: recomputed
    const again = s.make();
    expect(ids(await again.getTrailers('witcher-3', 'u3'))).toEqual([LAUNCH.videoId, PLAIN.videoId]);
    expect(s.youtube.getVideos.mock.calls.at(-1)[0]).not.toContain(GAMEPLAY.videoId);
  });

  it('hides the section for the reporter once they reported every candidate, with no new search', async () => {
    const s = threeGood();
    await mkThree(s);
    await s.service.getTrailers('witcher-3');
    for (const v of [GAMEPLAY, LAUNCH, PLAIN]) await s.service.reportTrailer('u1', 'witcher-3', v.videoId);
    await expect(s.service.getTrailers('witcher-3', 'u1')).resolves.toEqual([]);
    expect(s.youtube.search).not.toHaveBeenCalled();
  });

  it('ignores a video that is not in the game pool', async () => {
    const s = threeGood();
    await mkThree(s);
    await s.service.getTrailers('witcher-3');
    const result = await s.service.reportTrailer('u1', 'witcher-3', id('random'));
    expect(result).toMatchObject({ changed: false, dropped: false });
    expect(result.trailers).toHaveLength(3);
    expect(dismissedRow(s)).toBeUndefined(); // nothing user-supplied was stored
  });

  it('caps how many videos can be dropped for everyone per game', async () => {
    const s = setup({ details: [GAMEPLAY, LAUNCH, PLAIN] });
    const capped = s.make({ maxDropped: 1 });
    await mkThree(s);
    await capped.getTrailers('witcher-3');
    for (const user of ['u1', 'u2']) await capped.reportTrailer(user, 'witcher-3', GAMEPLAY.videoId);
    for (const user of ['u1', 'u2']) await capped.reportTrailer(user, 'witcher-3', LAUNCH.videoId);
    expect(ids(await capped.getTrailers('witcher-3', 'u3'))).toEqual([LAUNCH.videoId, PLAIN.videoId]); // only the first drop counted
    expect(dismissedRow(s).payload.dropped).toEqual([GAMEPLAY.videoId]);
  });

  it('a threshold of one makes a single report drop the video (configurable)', async () => {
    const s = setup({ details: [GAMEPLAY, LAUNCH] });
    const strict = s.make({ reportThreshold: 1 });
    await s.mk({ videos: [GAMEPLAY.videoId, LAUNCH.videoId] });
    await strict.getTrailers('witcher-3');
    expect((await strict.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId)).dropped).toBe(true);
    expect(ids(await strict.getTrailers('witcher-3', 'u9'))).toEqual([LAUNCH.videoId]);
  });

  it('does not remember "nothing dropped" when the report row cannot be read', async () => {
    const s = threeGood();
    await mkThree(s);
    await s.service.getTrailers('witcher-3');
    await s.service.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId);
    await s.service.reportTrailer('u2', 'witcher-3', GAMEPLAY.videoId);

    const fresh = s.make(); // empty memo
    const realFindOne = s.MediaCache.findOne;
    s.MediaCache.findOne = (q) => {
      if (q.source === 'trailer-dismissed') throw new Error('db blip');
      return realFindOne(q);
    };
    await fresh.getTrailers('witcher-3', 'u3'); // the drop cannot be read this time
    s.MediaCache.findOne = realFindOne;
    expect(ids(await fresh.getTrailers('witcher-3', 'u3'))).toEqual([LAUNCH.videoId, PLAIN.videoId]); // the next read is right again
  });

  it('keeps counting reports in this process when the database cannot store them', async () => {
    const s = threeGood();
    await mkThree(s);
    await s.service.getTrailers('witcher-3');
    s.MediaCache.findOneAndUpdate = async () => { throw new Error('db down'); };
    const result = await s.service.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId);
    expect(result.changed).toBe(true);
    expect(ids(await s.service.getTrailers('witcher-3', 'u1'))).not.toContain(GAMEPLAY.videoId);
  });

  it('404s for an unknown game and ignores a report for a game with no pick yet', async () => {
    const s = threeGood();
    await expect(s.service.reportTrailer('u1', 'nope', id('x'))).rejects.toMatchObject({ status: 404 });
    await mkThree(s);
    await expect(s.service.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId)).resolves.toMatchObject({ trailers: [], changed: false });
  });
});

describe('trailerService: daily search ceiling and persisted pause', () => {
  const searchesFor = (s) => s.youtube.search.mock.calls.length;

  it('stops searching for on-demand page views once the daily ceiling is used up, and resumes the next UTC day', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH], 'Game B official gameplay trailer': [LAUNCH] } });
    const limited = s.make({ dailySearchCeiling: 1 });
    await s.mk({ slug: 'a' });
    await s.mk({ slug: 'b', title: 'Game B' });

    await expect(limited.getTrailers('a')).resolves.toHaveLength(1); // used the one allowed search
    expect(searchesFor(s)).toBe(1);
    await expect(limited.getTrailers('b')).resolves.toEqual([]); // over the ceiling: nothing shown, nothing searched
    expect(searchesFor(s)).toBe(1);
    expect(s.MediaCache.docs.filter((d) => d.source === 'trailers')).toHaveLength(1); // the skipped game was not cached as "none"
    for (let i = 0; i < 5; i += 1) await limited.getTrailers('b');
    expect(searchesFor(s)).toBe(1);

    s.setNow(new Date('2026-10-28T00:05:00Z')); // next UTC day
    await limited.getTrailers('b');
    expect(searchesFor(s)).toBe(2);
  });

  it('IGDB-validated trailers are still shown past the ceiling', async () => {
    const s = setup({ details: [GAMEPLAY] });
    const limited = s.make({ dailySearchCeiling: 0 });
    await s.mk({ videos: [GAMEPLAY.videoId] });
    expect(ids2(await limited.getTrailers('witcher-3'))).toEqual([GAMEPLAY.videoId]);
    expect(searchesFor(s)).toBe(0);
  });

  it('the count is shared through the database, so a restart does not reset the day', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH] } });
    await s.mk({ slug: 'a' });
    await s.mk({ slug: 'b', title: 'Game B' });
    const first = s.make({ dailySearchCeiling: 1 });
    await first.getTrailers('a');
    expect(s.MediaCache.docs.find((d) => d.source === 'youtube-state').payload).toMatchObject({ day: '2026-10-27', searches: 1, pausedUntil: null });

    const restarted = s.make({ dailySearchCeiling: 1 });
    await expect(restarted.getTrailers('b')).resolves.toEqual([]);
    expect(searchesFor(s)).toBe(1);
  });

  it('the refresh budget and the ceiling both apply to a script run', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH] } });
    const svc = s.make({ dailySearchCeiling: 3 });
    const games = [];
    for (const n of [1, 2, 3, 4]) games.push(await s.mk({ slug: `g${n}`, title: `Game ${n}` }));
    // none of these games has a validated video, so each needs searching; the script's own budget is
    // unlimited here but the day only has 3 searches: game 1 uses two (both queries), game 2 one (its
    // second query is refused), games 3 and 4 get none and are skipped, not cached as "no trailer"
    const statuses = [];
    for (const g of games) statuses.push((await svc.primeGame(g, { allowSearch: () => true })).status);
    expect(statuses).toEqual(['none', 'none', 'skipped', 'skipped']);
    expect(searchesFor(s)).toBe(3);
    expect(s.MediaCache.docs.filter((d) => d.source === 'trailers')).toHaveLength(2);
  });

  it('a quota pause survives a restart and is released after 24 hours', async () => {
    const s = setup({ searchError: Object.assign(new Error('quota'), { quota: true }) });
    await s.mk({ slug: 'a' });
    await s.mk({ slug: 'b', title: 'Game B' });
    await s.service.getTrailers('a');
    expect(s.MediaCache.docs.find((d) => d.source === 'youtube-state').payload.pausedUntil).toBe('2026-10-28T10:00:00.000Z');

    const restarted = s.make();
    const calls = searchesFor(s);
    await expect(restarted.getTrailers('b')).resolves.toEqual([]);
    expect(restarted.isPaused()).toBe(true);
    expect(searchesFor(s)).toBe(calls);

    s.setNow(new Date('2026-10-28T10:01:00Z'));
    s.youtube.search.mockImplementation(async () => []);
    const later = s.make();
    await later.getTrailers('b');
    expect(later.isPaused()).toBe(false);
    expect(searchesFor(s)).toBeGreaterThan(calls);
  });
});

function ids2(list) {
  return list.map((t) => t.videoId);
}

describe('trailerService: refresh helpers', () => {
  it('warm() validates many ids with few calls and the results are reused for an hour', async () => {
    const s = setup({ details: [GAMEPLAY, LAUNCH] });
    await s.mk({ videos: [GAMEPLAY.videoId, LAUNCH.videoId] });
    expect(await s.service.warm([GAMEPLAY.videoId, LAUNCH.videoId, GAMEPLAY.videoId])).toBe(1);
    expect(s.youtube.getVideos).toHaveBeenCalledTimes(1);
    await s.service.getTrailers('witcher-3');
    expect(s.youtube.getVideos).toHaveBeenCalledTimes(1); // answered from the warm details
    expect(await s.service.warm([GAMEPLAY.videoId])).toBe(0);
  });

  it('primeGame reports where the pick came from, honours the search budget, and skips cached games', async () => {
    const s = setup({ details: [GAMEPLAY, LAUNCH], searches: { [Q1]: [LAUNCH] } });
    const igdbGame = await s.mk({ slug: 'igdb', videos: [GAMEPLAY.videoId] });
    const ytGame = await s.mk({ slug: 'yt' });
    const bare = await s.mk({ slug: 'bare', title: 'Obscure Game' });

    expect(await s.service.primeGame(igdbGame)).toEqual({ status: 'igdb', picked: 1 });
    expect(await s.service.primeGame(igdbGame)).toEqual({ status: 'cached' });
    expect(await s.service.primeGame(ytGame)).toEqual({ status: 'youtube', picked: 1 });

    // a game that would need a search past the budget is skipped, not cached
    const noBudget = await s.service.primeGame(bare, { allowSearch: () => false });
    expect(noBudget).toEqual({ status: 'skipped' });
    expect(s.MediaCache.docs.filter((d) => d.gameId === bare._id)).toHaveLength(0);

    // budget for the first query only: it finds nothing, the second query is not allowed, the answer is cached
    let allowed = 0;
    const result = await s.service.primeGame(bare, { allowSearch: () => (allowed += 1) <= 1 });
    expect(result.status).toBe('none');
    expect(s.youtube.search.mock.calls.filter((c) => c[0].startsWith('Obscure Game'))).toHaveLength(1);
  });

  it('primeGame reports paused after a quota error', async () => {
    const s = setup({ searchError: Object.assign(new Error('quota'), { quota: true }) });
    const game = await s.mk();
    expect((await s.service.primeGame(game)).status).toBe('paused');
    expect((await s.service.primeGame(await s.mk({ slug: 'two', title: 'Two' }))).status).toBe('paused');
  });
});

// ── HTTP ────────────────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/games/:slug/trailer and POST .../trailer/report', () => {
  function setupApp() {
    const s = setup({ details: [GAMEPLAY, LAUNCH, PLAIN] });
    const models = createFakeModels();
    const config = testConfig({ YOUTUBE_API_KEY: KEY });
    const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
    const app = createApp({ config, logger: silentLogger, authService, trailerService: s.service });
    return { app, s };
  }
  const register = async (app, name) => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return agent;
  };

  it('requires authentication', async () => {
    const { app } = setupApp();
    expect((await request(app).get('/api/v1/games/witcher-3/trailer')).status).toBe(401);
    expect((await request(app).post('/api/v1/games/witcher-3/trailer/report').send({ videoId: id('a') })).status).toBe(401);
  });

  it('answers { trailers } with labels and never leaks the key', async () => {
    const { app, s } = setupApp();
    await s.mk({ videos: [GAMEPLAY.videoId, LAUNCH.videoId, PLAIN.videoId] });
    const agent = await register(app, 'neo');
    const res = await agent.get('/api/v1/games/witcher-3/trailer');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      trailers: [
        { videoId: GAMEPLAY.videoId, label: 'Gameplay trailer', source: 'igdb' },
        { videoId: LAUNCH.videoId, label: 'Launch trailer', source: 'igdb' },
        { videoId: PLAIN.videoId, label: 'Trailer', source: 'igdb' },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    expect((await agent.get('/api/v1/games/missing/trailer')).status).toBe(404);
    expect((await agent.get('/api/v1/games/BAD SLUG/trailer')).status).toBe(400);
  });

  it('validates the report body, hides the video for the reporter, and drops it for everyone after a second user', async () => {
    const { app, s } = setupApp();
    await s.mk({ videos: [GAMEPLAY.videoId, LAUNCH.videoId] });
    const alice = await register(app, 'alice');
    const bob = await register(app, 'bob');
    const cara = await register(app, 'cara');
    await alice.get('/api/v1/games/witcher-3/trailer');
    const report = (agent, videoId) => agent.post('/api/v1/games/witcher-3/trailer/report').send({ videoId });

    expect((await alice.post('/api/v1/games/witcher-3/trailer/report').send({})).status).toBe(400);
    expect((await report(alice, '"><script>')).status).toBe(400);
    expect((await alice.post('/api/v1/games/BAD SLUG/trailer/report').send({ videoId: id('a') })).status).toBe(400);
    expect((await alice.post('/api/v1/games/missing/trailer/report').send({ videoId: id('a') })).status).toBe(404);

    const first = await report(alice, GAMEPLAY.videoId);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ changed: true, dropped: false });
    expect(first.body.trailers.map((t) => t.videoId)).toEqual([LAUNCH.videoId]);
    expect((await bob.get('/api/v1/games/witcher-3/trailer')).body.trailers).toHaveLength(2); // one report hides it for alice only

    const second = await report(bob, GAMEPLAY.videoId);
    expect(second.body).toMatchObject({ changed: true, dropped: true });
    expect((await cara.get('/api/v1/games/witcher-3/trailer')).body.trailers.map((t) => t.videoId)).toEqual([LAUNCH.videoId]);
  });

  it('rate-limits reports per user (20 an hour), not per IP', async () => {
    const { app, s } = setupApp();
    await s.mk({ videos: [GAMEPLAY.videoId] });
    const a = await register(app, 'alice');
    const b = await register(app, 'bob');
    for (let i = 0; i < 20; i += 1) expect((await a.post('/api/v1/games/witcher-3/trailer/report').send({ videoId: id('nope') })).status).toBe(200);
    const blocked = await a.post('/api/v1/games/witcher-3/trailer/report').send({ videoId: id('nope') });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect((await b.post('/api/v1/games/witcher-3/trailer/report').send({ videoId: id('nope') })).status).toBe(200); // same IP, different user
  });
});

// ── the quota is shared by every process, not counted per process ───────────────────────────────
describe('trailerService: quota shared between instances', () => {
  // Two API instances (or an API and the refresh script) over one database, with empty search results
  // so every game runs both queries.
  function twoInstances(ceiling) {
    const s = setup({ details: [], searches: {} });
    return { s, a: s.make({ dailySearchCeiling: ceiling }), b: s.make({ dailySearchCeiling: ceiling }) };
  }
  const stateRow = (s) => s.MediaCache.docs.find((d) => d.source === 'youtube-state');

  it('the daily ceiling holds across instances: they cannot each spend the full ceiling', async () => {
    const { s, a, b } = twoInstances(3);
    for (const n of [1, 2, 3, 4]) await s.mk({ slug: `g${n}`, title: `Game ${n}` });
    await a.getTrailers('g1'); // 2 searches
    await b.getTrailers('g2'); // 1 search, then the ceiling stops it
    await a.getTrailers('g3');
    await b.getTrailers('g4');
    expect(s.youtube.search.mock.calls.length).toBe(3);
    expect(stateRow(s).payload.searches).toBe(3);
  });

  it('concurrent starts never exceed the ceiling, and the stored count equals the searches made', async () => {
    const { s, a, b } = twoInstances(5);
    for (const n of [1, 2, 3, 4, 5, 6]) await s.mk({ slug: `g${n}`, title: `Game ${n}` });
    await Promise.all([a.getTrailers('g1'), b.getTrailers('g2'), a.getTrailers('g3'), b.getTrailers('g4'), a.getTrailers('g5'), b.getTrailers('g6')]);
    const made = s.youtube.search.mock.calls.length;
    expect(made).toBeLessThanOrEqual(5);
    expect(stateRow(s).payload.searches).toBe(made);
    expect(s.MediaCache.docs.filter((d) => d.source === 'youtube-state')).toHaveLength(1); // the day's counter was started once
  });

  it('starts a fresh counter on a new UTC day and keeps a pause that is still running', async () => {
    const s = setup({ details: [], searches: {} });
    const svc = s.make({ dailySearchCeiling: 1 });
    await s.mk({ slug: 'a', title: 'Game A' });
    await s.mk({ slug: 'b', title: 'Game B' });
    await svc.getTrailers('a');
    expect(stateRow(s).payload).toMatchObject({ day: '2026-10-27', searches: 1 });
    await s.MediaCache.updateOne({ source: 'youtube-state' }, { $set: { 'payload.pausedUntil': '2026-10-29T00:00:00.000Z' } });
    s.setNow(new Date('2026-10-28T00:10:00Z'));
    s.youtube.search.mockClear();
    await s.make({ dailySearchCeiling: 1 }).getTrailers('b'); // paused until the 29th: no search even on a new day
    expect(s.youtube.search).not.toHaveBeenCalled();
    expect(stateRow(s).payload.pausedUntil).toBe('2026-10-29T00:00:00.000Z');
  });

  it('a pause set by another instance is picked up within a minute', async () => {
    const s = setup({ details: [LAUNCH], searches: { [Q1]: [LAUNCH] } });
    const early = s.make();
    await s.mk({ slug: 'a', title: 'Game A' });
    await s.mk({ slug: 'b' });
    await early.getTrailers('a'); // looks at the shared state now
    const other = s.make({ quotaBackoffMs: DAY });
    s.youtube.search.mockRejectedValueOnce(Object.assign(new Error('quota'), { quota: true }));
    await s.mk({ slug: 'c', title: 'Game C' });
    await other.getTrailers('c'); // the other instance hits the quota and persists the pause
    expect(other.isPaused()).toBe(true);
    expect(early.isPaused()).toBe(false); // this one has not looked yet
    s.youtube.search.mockClear();
    s.setNow(new Date('2026-10-27T10:01:30Z')); // more than a minute later
    await expect(early.getTrailers('b')).resolves.toEqual([]);
    expect(early.isPaused()).toBe(true);
    expect(s.youtube.search).not.toHaveBeenCalled();
  });

  it('falls back to counting in this process when the database cannot reserve a search', async () => {
    const s = setup({ details: [], searches: {} });
    const svc = s.make({ dailySearchCeiling: 2 });
    s.MediaCache.findOneAndUpdate = async (q, update) => {
      if (q.source === 'youtube-state') throw new Error('db down');
      return Object.assign({}, update);
    };
    s.MediaCache.findOne = () => { throw new Error('db down'); };
    for (const n of [1, 2, 3]) await s.mk({ slug: `g${n}`, title: `Game ${n}` });
    for (const n of [1, 2, 3]) await svc.getTrailers(`g${n}`);
    expect(s.youtube.search.mock.calls.length).toBe(2); // the ceiling still held
  });
});

describe('trailerService: budget refusals', () => {
  it('a game refused mid-way (first query ran, second was refused) is remembered for 6 hours, not 7 days', async () => {
    const s = setup({ details: [], searches: {} });
    const svc = s.make({ dailySearchCeiling: 1 });
    await s.mk({ slug: 'a', title: 'Game A' });
    await expect(svc.getTrailers('a')).resolves.toEqual([]);
    expect(s.youtube.search.mock.calls.length).toBe(1); // only the first query was allowed
    const row = s.MediaCache.docs.find((d) => d.source === 'trailers');
    expect(row.payload).toMatchObject({ partial: true, pool: [] });
    expect(new Date(row.expiresAt).getTime() - new Date(row.fetchedAt).getTime()).toBe(6 * HOUR);
  });

  it('a game refused outright is not cached, and repeated views do not repeat the work', async () => {
    const s = setup({ details: [GAMEPLAY], searches: {} });
    const svc = s.make({ dailySearchCeiling: 0 });
    await s.mk({ videos: [DIARY.videoId] });
    await svc.getTrailers('witcher-3');
    expect(s.MediaCache.docs.filter((d) => d.source === 'trailers')).toHaveLength(0);

    let reads = 0;
    const realFindOne = s.MediaCache.findOne;
    s.MediaCache.findOne = (q) => {
      reads += 1;
      return realFindOne(q);
    };
    const lists = s.youtube.getVideos.mock.calls.length;
    for (let i = 0; i < 20; i += 1) await expect(svc.getTrailers('witcher-3')).resolves.toEqual([]);
    expect(reads).toBe(0); // no cache lookups
    expect(s.youtube.getVideos.mock.calls.length).toBe(lists); // and no YouTube calls

    // after the memo (10 minutes) it is looked at again, e.g. once the ceiling has room
    s.setNow(new Date('2026-10-27T10:11:00Z'));
    await svc.getTrailers('witcher-3');
    expect(reads).toBeGreaterThan(0);
  });

  it('a drop expires with its cache row (90 days) instead of lasting for years', async () => {
    const s = setup({ details: [GAMEPLAY, LAUNCH] });
    await s.mk({ videos: [GAMEPLAY.videoId, LAUNCH.videoId] });
    await s.service.getTrailers('witcher-3');
    await s.service.reportTrailer('u1', 'witcher-3', GAMEPLAY.videoId);
    const row = s.MediaCache.docs.find((d) => d.source === 'trailer-dismissed');
    expect(new Date(row.expiresAt).getTime() - new Date(row.fetchedAt).getTime()).toBe(90 * DAY);
  });
});

describe('the trailer list is per user, so it is never cacheable by a shared cache', () => {
  it('sets Cache-Control private, no-store on the list and on a report', async () => {
    const s = setup({ details: [GAMEPLAY, LAUNCH] });
    const models = createFakeModels();
    const config = testConfig({ YOUTUBE_API_KEY: KEY });
    const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
    const app = createApp({ config, logger: silentLogger, authService, trailerService: s.service });
    await s.mk({ videos: [GAMEPLAY.videoId, LAUNCH.videoId] });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({ username: 'neo', email: 'neo@example.com', password: 'correct-horse-9' });
    expect((await agent.get('/api/v1/games/witcher-3/trailer')).headers['cache-control']).toBe('private, no-store');
    const report = await agent.post('/api/v1/games/witcher-3/trailer/report').send({ videoId: GAMEPLAY.videoId });
    expect(report.headers['cache-control']).toBe('private, no-store');
  });
});
