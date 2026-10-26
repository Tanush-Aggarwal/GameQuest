import { jest } from '@jest/globals';
import { createSteamAdapter } from '../adapters/platforms/steam.js';
import { createArtService } from '../services/artService.js';
import { createGameService, toUpsertUpdate } from '../services/gameService.js';
import { createFakeCollection, logger, testConfig } from './helpers.js';

const KEY = 'SECRETKEY1234567890';
const DAY = 24 * 60 * 60 * 1000;
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const COVER = `${CDN}/620/library_600x900_2x.jpg`;
const HERO = `${CDN}/620/library_hero.jpg`;
const HEADER = `${CDN}/620/header.jpg`;

// A fake Steam CDN: HEAD answers 200 for the urls in `present`, 404 otherwise, or throws for `broken`.
function cdn({ present = [], broken = false } = {}) {
  return jest.fn(async (url) => {
    if (broken) throw new Error(`connect failed for ${url}`);
    const ok = present.includes(url);
    return { ok, status: ok ? 200 : 404, headers: { get: () => null }, json: async () => ({}) };
  });
}

const adapter = (fetchImpl) => createSteamAdapter({ config: testConfig({ STEAM_API_KEY: KEY }), fetchImpl });

describe('steam adapter: probeArt', () => {
  it('uses the library cover and hero when the CDN has them, without touching header.jpg', async () => {
    const fetchImpl = cdn({ present: [COVER, HERO, HEADER] });
    await expect(adapter(fetchImpl).probeArt(620)).resolves.toEqual({ cover: COVER, backdrop: HERO });
    expect(fetchImpl.mock.calls.map((c) => c[0])).not.toContain(HEADER);
  });

  it('falls back to header.jpg for whichever of cover/backdrop is missing', async () => {
    await expect(adapter(cdn({ present: [COVER, HEADER] })).probeArt(620)).resolves.toEqual({ cover: COVER, backdrop: HEADER });
    await expect(adapter(cdn({ present: [HERO, HEADER] })).probeArt(620)).resolves.toEqual({ cover: HEADER, backdrop: HERO });
    await expect(adapter(cdn({ present: [HEADER] })).probeArt(620)).resolves.toEqual({ cover: HEADER, backdrop: HEADER });
  });

  it('returns nulls when the CDN has nothing', async () => {
    await expect(adapter(cdn()).probeArt(620)).resolves.toEqual({ cover: null, backdrop: null });
  });

  it('probes with HEAD, needs no API key, and never sends one', async () => {
    const fetchImpl = cdn({ present: [COVER, HERO] });
    await createSteamAdapter({ config: testConfig(), fetchImpl }).probeArt(620); // no key configured
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(options.method).toBe('HEAD');
      expect(url).not.toContain('key=');
    }
  });

  it('throws on a network failure or CDN outage instead of reporting "no art"', async () => {
    const err = await adapter(cdn({ broken: true })).probeArt(620).catch((e) => e);
    expect(err).toMatchObject({ status: 502 });
    expect(err.message).not.toContain(KEY);
    const down = jest.fn(async () => ({ ok: false, status: 503 }));
    await expect(adapter(down).probeArt(620)).rejects.toMatchObject({ status: 502 });
  });

  it('ignores an appid that is not numeric without calling the CDN', async () => {
    const fetchImpl = cdn();
    await expect(adapter(fetchImpl).probeArt('../etc/passwd')).resolves.toEqual({ cover: null, backdrop: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('artService.fillSteamArt', () => {
  function setup({ present = [COVER, HERO, HEADER], broken = false, at = new Date('2026-10-27T10:00:00Z') } = {}) {
    const Game = createFakeCollection({ unique: [['slug']] });
    const MediaCache = createFakeCollection({ unique: [['gameId', 'source']] });
    const fetchImpl = cdn({ present, broken });
    let clock = at;
    const art = createArtService({ Game, MediaCache, steam: adapter(fetchImpl), logger, now: () => clock });
    const mk = (extra = {}) => Game.create({ title: 'Portal 2', slug: 'portal-2', externalIds: { steam: '620' }, cover: null, backdrop: null, hidden: false, ...extra });
    return { Game, MediaCache, fetchImpl, art, mk, setNow: (d) => { clock = d; } };
  }

  it('fills a missing backdrop but keeps the IGDB cover', async () => {
    const s = setup();
    const game = await s.mk({ cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg' });
    const filled = await s.art.fillSteamArt(game);
    expect(filled).toMatchObject({ cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg', backdrop: HERO });
    const stored = s.Game.docs[0];
    expect(stored.backdrop).toBe(HERO);
    expect(stored.cover).toMatch(/igdb/);
  });

  it('fills a missing cover and backdrop together', async () => {
    const s = setup();
    const filled = await s.art.fillSteamArt(await s.mk());
    expect(filled).toMatchObject({ cover: COVER, backdrop: HERO });
    expect(s.Game.docs[0]).toMatchObject({ cover: COVER, backdrop: HERO });
  });

  it('probes once per game: the answer is cached for 30 days and reused', async () => {
    const s = setup();
    const game = await s.mk();
    await s.art.fillSteamArt(game);
    const probes = s.fetchImpl.mock.calls.length;
    expect(probes).toBe(2); // cover + hero, no header needed

    const cache = s.MediaCache.docs[0];
    expect(cache).toMatchObject({ gameId: game._id, source: 'steam-art', payload: { cover: COVER, backdrop: HERO } });
    expect(new Date(cache.expiresAt).getTime() - new Date(cache.fetchedAt).getTime()).toBe(30 * DAY);

    // an IGDB refresh wiped the art again: it is restored from the cache, with no new probe
    await s.Game.updateOne({ _id: game._id }, { $set: { cover: null, backdrop: null } });
    const again = await s.art.fillSteamArt(s.Game.docs[0]);
    expect(again).toMatchObject({ cover: COVER, backdrop: HERO });
    expect(s.fetchImpl.mock.calls.length).toBe(probes);
    expect(s.MediaCache.docs).toHaveLength(1);
  });

  it('caches "nothing on the CDN" for 7 days, then probes again after it expires', async () => {
    const s = setup({ present: [] });
    const game = await s.mk();
    expect(await s.art.fillSteamArt(game)).toMatchObject({ cover: null, backdrop: null });
    const probes = s.fetchImpl.mock.calls.length;
    expect(probes).toBe(3); // cover, hero, header
    const cache = s.MediaCache.docs[0];
    expect(new Date(cache.expiresAt).getTime() - new Date(cache.fetchedAt).getTime()).toBe(7 * DAY);

    await s.art.fillSteamArt(game);
    expect(s.fetchImpl.mock.calls.length).toBe(probes); // still cached

    s.setNow(new Date('2026-11-04T10:00:00Z')); // 8 days later
    await s.art.fillSteamArt(game);
    expect(s.fetchImpl.mock.calls.length).toBe(probes + 3);
    expect(s.MediaCache.docs).toHaveLength(1);
  });

  it('never throws and caches nothing when the CDN cannot be reached', async () => {
    const s = setup({ broken: true });
    const game = await s.mk();
    await expect(s.art.fillSteamArt(game)).resolves.toMatchObject({ cover: null, backdrop: null });
    expect(s.MediaCache.docs).toHaveLength(0);
    expect(s.Game.docs[0].backdrop).toBeNull();
  });

  it('treats a 403 from the CDN as "no art" and caches that as a miss', async () => {
    const s = setup();
    s.fetchImpl.mockImplementation(async () => ({ ok: false, status: 403 }));
    await s.art.fillSteamArt(await s.mk());
    expect(s.MediaCache.docs[0].payload).toEqual({ cover: null, backdrop: null });
  });

  it('backs off after a failure: one short probe, then no more CDN calls during the cooldown', async () => {
    const s = setup({ broken: true });
    const a = await s.mk({ slug: 'a', externalIds: { steam: '1' } });
    const b = await s.mk({ slug: 'b', externalIds: { steam: '2' } });
    const c = await s.mk({ slug: 'c', externalIds: { steam: '3' } });
    await s.art.fillSteamArt(a);
    const calls = s.fetchImpl.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await s.art.fillSteamArt(b);
    await s.art.fillSteamArt(c);
    expect(s.fetchImpl.mock.calls.length).toBe(calls); // skipped while cooling down
    expect(s.art.failureCount()).toBe(3); // and counted, so a script can report them

    s.setNow(new Date('2026-10-27T10:02:00Z')); // cooldown over, CDN is back
    s.fetchImpl.mockImplementation(cdn({ present: [`${CDN}/2/library_hero.jpg`, `${CDN}/2/library_600x900_2x.jpg`] }));
    expect(await s.art.fillSteamArt(b)).toMatchObject({ backdrop: `${CDN}/2/library_hero.jpg` });
  });

  it('does not overwrite art that IGDB supplied after the game was read', async () => {
    const s = setup();
    const stale = await s.mk(); // read with no backdrop...
    await s.Game.updateOne({ _id: stale._id }, { $set: { backdrop: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg' } }); // ...IGDB fills it
    const filled = await s.art.fillSteamArt(stale);
    expect(s.Game.docs[0].backdrop).toMatch(/images\.igdb\.com/);
    expect(filled.backdrop).toBeNull(); // not claimed either
    expect(s.Game.docs[0].cover).toBe(COVER); // the other, still-empty field is filled
  });

  it('tolerates a concurrent request storing the same cache row', async () => {
    const s = setup();
    const game = await s.mk();
    const real = s.MediaCache.findOneAndUpdate.bind(s.MediaCache);
    s.MediaCache.findOneAndUpdate = async () => {
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    };
    await expect(s.art.fillSteamArt(game)).resolves.toMatchObject({ backdrop: HERO });
    s.MediaCache.findOneAndUpdate = real;
  });

  it.each([
    ['has no Steam id', { externalIds: {} }],
    ['is hidden', { hidden: true }],
    ['already has both', { cover: 'c.jpg', backdrop: 'b.jpg' }],
  ])('does not probe a game that %s', async (_label, extra) => {
    const s = setup();
    await s.art.fillSteamArt(await s.mk(extra));
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.MediaCache.docs).toHaveLength(0);
  });
});

describe('an IGDB refresh keeps art filled from Steam', () => {
  it('does not null cover/backdrop when IGDB has none, but does take real IGDB art', () => {
    const base = { title: 'X', slug: 'x', externalIds: { igdb: 1 }, genres: [] };
    const none = toUpsertUpdate({ ...base, cover: null, backdrop: null }, new Date()).$set;
    expect(none).not.toHaveProperty('cover');
    expect(none).not.toHaveProperty('backdrop');
    expect(none.genres).toEqual([]); // everything else still refreshes
    const real = toUpsertUpdate({ ...base, cover: 'c.jpg', backdrop: 'b.jpg' }, new Date()).$set;
    expect(real).toMatchObject({ cover: 'c.jpg', backdrop: 'b.jpg' });
  });
});

describe('game page uses the Steam art fallback', () => {
  it('serves Steam art for a game with a Steam id and no backdrop (and probes only once)', async () => {
    const Game = createFakeCollection({ unique: [['slug']] });
    const MediaCache = createFakeCollection({ unique: [['gameId', 'source']] });
    const fetchImpl = cdn({ present: [COVER, HERO] });
    const artService = createArtService({ Game, MediaCache, steam: adapter(fetchImpl), logger });
    const gameService = createGameService({ Game, igdb: { isConfigured: () => false }, logger, artService });
    await Game.create({ title: 'Portal 2', slug: 'portal-2', externalIds: { steam: '620' }, cover: 'igdb-cover.jpg', backdrop: null, hidden: false });

    const first = await gameService.getBySlug('portal-2');
    expect(first).toMatchObject({ cover: 'igdb-cover.jpg', backdrop: HERO });
    await gameService.getBySlug('portal-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2); // one probe round (cover + hero), not two
  });

  it('still serves the game when the CDN is down', async () => {
    const Game = createFakeCollection({ unique: [['slug']] });
    const artService = createArtService({ Game, MediaCache: createFakeCollection(), steam: adapter(cdn({ broken: true })), logger });
    const gameService = createGameService({ Game, igdb: { isConfigured: () => false }, logger, artService });
    await Game.create({ title: 'Portal 2', slug: 'portal-2', externalIds: { steam: '620' }, cover: null, backdrop: null, hidden: false });
    await expect(gameService.getBySlug('portal-2')).resolves.toMatchObject({ slug: 'portal-2', backdrop: null });
  });
});
