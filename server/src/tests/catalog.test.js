import { jest } from '@jest/globals';
import { createIgdbAdapter, isCatalogGame, isCatalogType, normaliseGame } from '../adapters/content/igdb.js';
import { createCatalogImportService, blendPopularity } from '../services/catalogImportService.js';
import { createGameService, withParentArt } from '../services/gameService.js';
import { createLibraryService } from '../services/libraryService.js';
import { createRecommendationService } from '../services/recommendationService.js';
import { createFakeCollection, testConfig } from './helpers.js';

const withTwitch = { TWITCH_CLIENT_ID: 'id', TWITCH_CLIENT_SECRET: 'secret' };
const jsonResponse = (body, status = 200, headers = {}) => ({
  ok: status < 400,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});

// A raw IGDB game; `type` is game_type, 0 = main game.
const raw = (id, name, extra = {}) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  game_type: 0,
  cover: { image_id: `cov${id}` },
  platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
  total_rating_count: 10,
  ...extra,
});

describe('catalog rules: which IGDB entries are games', () => {
  const ALLOWED = { 0: 'main game', 4: 'standalone expansion', 8: 'remake', 9: 'remaster', 10: 'expanded game', 11: 'port' };
  const REJECTED = { 1: 'dlc', 2: 'expansion', 3: 'bundle', 5: 'mod', 6: 'episode', 7: 'season', 12: 'fork', 13: 'pack', 14: 'update' };

  it.each(Object.entries(ALLOWED))('keeps game_type %s (%s)', (type) => {
    expect(isCatalogGame(raw(1, 'X', { game_type: Number(type) }))).toBe(true);
  });

  it.each(Object.entries(REJECTED))('drops game_type %s (%s)', (type) => {
    expect(isCatalogGame(raw(1, 'X', { game_type: Number(type) }))).toBe(false);
    expect(isCatalogType(raw(1, 'X', { game_type: Number(type) }))).toBe(false);
  });

  it('drops editions (version_parent set) and entries without a cover or game_type', () => {
    expect(isCatalogGame(raw(1, 'Game Deluxe Edition', { version_parent: 99 }))).toBe(false);
    expect(isCatalogGame(raw(1, 'No Cover', { cover: undefined }))).toBe(false);
    expect(isCatalogType(raw(1, 'No Cover', { cover: undefined }))).toBe(true); // a type check ignores the cover
    expect(isCatalogGame(raw(1, 'Unknown type', { game_type: undefined }))).toBe(false);
  });
});

describe('normaliseGame art and credits', () => {
  it('prefers artwork over screenshots for the backdrop and builds 1080p / 2x URLs', () => {
    const g = normaliseGame(
      raw(1, 'Art', {
        artworks: [{ image_id: 'a1' }, { image_id: 'a2' }],
        screenshots: [{ image_id: 's1' }],
        videos: [{ video_id: 'yt1' }],
      }),
    );
    expect(g.cover).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cov1.jpg');
    expect(g.backdrop).toBe('https://images.igdb.com/igdb/image/upload/t_1080p/a1.jpg');
    expect(g.artworks).toHaveLength(2);
    expect(g.screenshots).toEqual(['https://images.igdb.com/igdb/image/upload/t_1080p/s1.jpg']);
    expect(g.videos).toEqual(['yt1']);
  });

  it('falls back to a screenshot, then to null', () => {
    expect(normaliseGame(raw(1, 'S', { screenshots: [{ image_id: 's9' }] })).backdrop).toMatch(/s9\.jpg$/);
    expect(normaliseGame(raw(1, 'None')).backdrop).toBeNull();
  });

  it('splits developers and publishers, and keeps themes, modes, rating and type', () => {
    const g = normaliseGame(
      raw(1, 'Credits', {
        involved_companies: [
          { developer: true, publisher: false, company: { name: 'Studio' } },
          { developer: false, publisher: true, company: { name: 'Big Pub' } },
          { developer: true, publisher: true, company: { name: 'Both' } },
        ],
        themes: [{ name: 'Fantasy' }],
        game_modes: [{ name: 'Single player' }],
        total_rating: 91.26,
        total_rating_count: 420,
        external_games: [{ category: 1, uid: '730' }],
      }),
    );
    expect(g.developer).toEqual(['Studio', 'Both']);
    expect(g.publisher).toEqual(['Big Pub', 'Both']);
    expect(g).toMatchObject({ themes: ['Fantasy'], gameModes: ['Single player'], totalRating: 91.3, totalRatingCount: 420, gameType: 0 });
    expect(g.externalIds).toEqual({ igdb: 1, steam: '730' });
  });
});

describe('IGDB adapter limits', () => {
  function adapter(responses, opts = {}) {
    const sleeps = [];
    const calls = [];
    let clock = 1_000_000;
    const queue = [...responses];
    const fetchImpl = jest.fn(async (url, init) => {
      if (String(url).startsWith('https://id.twitch.tv')) return jsonResponse({ access_token: 't', expires_in: 3600 });
      calls.push({ url: String(url), body: init?.body, at: clock });
      return queue.length > 1 ? queue.shift() : queue[0];
    });
    const igdb = createIgdbAdapter({
      config: testConfig(withTwitch),
      fetchImpl,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      ...opts,
    });
    return { igdb, sleeps, calls };
  }

  it('live search sends the type filter and drops DLC rows that slip through', async () => {
    const { igdb, calls } = adapter([jsonResponse([raw(1, 'Real Game'), raw(2, 'Real Game: Season Pass', { game_type: 1 }), raw(3, 'Edition', { version_parent: 1 })])], { minIntervalMs: 0 });
    const games = await igdb.search('real game');
    expect(games.map((g) => g.title)).toEqual(['Real Game']);
    expect(calls[0].body).toContain('game_type = (0,4,8,9,10,11)');
    expect(calls[0].body).toContain('version_parent = null');
    expect(calls[0].body).toContain('cover != null');
  });

  it('spaces requests at least 250ms apart (4 per second)', async () => {
    const { igdb, sleeps } = adapter([jsonResponse([])]);
    await igdb.fetchByIds([1]);
    await igdb.fetchByIds([2]);
    await igdb.fetchByIds([3]);
    expect(sleeps).toEqual([250, 250]);
  });

  it('retries a 429 with Retry-After, then with exponential backoff', async () => {
    const { igdb, sleeps, calls } = adapter(
      [jsonResponse({}, 429, { 'retry-after': '2' }), jsonResponse({}, 429), jsonResponse({}, 429), jsonResponse([raw(1, 'Ok')])],
      { minIntervalMs: 0 },
    );
    const rows = await igdb.fetchByIds([1]);
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([2000, 2000, 4000]);
  });

  it('gives up with an UpstreamError after repeated 429s', async () => {
    const { igdb, calls } = adapter([jsonResponse({}, 429)], { minIntervalMs: 0, sleep: async () => {} });
    await expect(igdb.fetchByIds([1])).rejects.toThrow(/HTTP 429/);
    expect(calls).toHaveLength(6); // first try + 5 retries
  });

  it('pages popularity lookups when a batch returns a full page', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ game_id: 1, popularity_type: 5, value: i }));
    const { igdb, calls } = adapter([jsonResponse(rows), jsonResponse([{ game_id: 2, popularity_type: 1, value: 7 }])], { minIntervalMs: 0 });
    const map = await igdb.getPopularityFor([1, 2], [5, 1]);
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toContain('offset 500');
    expect(map.get(2)).toEqual({ 1: 7 });
  });
});

// ── import service, against an in-memory IGDB ─────────────────────────────────────────────────────
const TYPES = [
  { id: 1, name: 'IGDB Visits' },
  { id: 2, name: 'IGDB Want to Play' },
  { id: 5, name: 'Steam 24hr Peak Players' },
];

function fakeIgdb(universe, { popularity = {}, failOn = null } = {}) {
  const byId = new Map(universe.map((g) => [g.id, g]));
  const api = {
    catalogWhere: 'game_type = (0,4,8,9,10,11) & version_parent = null & cover != null',
    fetchByIdsCalls: [],
    getPopularityTypes: async () => TYPES,
    getPopularityTop: async (type, { limit = 500, offset = 0 } = {}) => (popularity[type] ?? []).slice(offset, offset + limit),
    getPopularityFor: async (ids) => {
      const out = new Map();
      for (const [type, rows] of Object.entries(popularity)) {
        for (const r of rows) {
          if (!ids.includes(r.gameId)) continue;
          out.set(r.gameId, { ...(out.get(r.gameId) ?? {}), [type]: r.value });
        }
      }
      return out;
    },
    fetchByIds: jest.fn(async (ids, { extraWhere = '' } = {}) => {
      api.fetchByIdsCalls.push([...ids]);
      if (failOn && api.fetchByIdsCalls.length === failOn.call) throw new Error('IGDB went away');
      let rows = ids.map((id) => byId.get(id)).filter(Boolean);
      const platform = /platforms = \((\d+)\)/.exec(extraWhere)?.[1];
      if (platform) rows = rows.filter((r) => r.platforms?.some((p) => p.id === Number(platform)));
      return rows;
    }),
    fetchPage: jest.fn(async ({ where, offset = 0, limit = 500 }) => {
      let rows = universe;
      const platform = /platforms = \((\d+)\)/.exec(where)?.[1];
      if (platform) rows = rows.filter((r) => r.platforms?.some((p) => p.id === Number(platform)));
      if (/total_rating_count != null/.test(where)) rows = rows.filter((r) => r.total_rating_count != null);
      const range = /first_release_date >= (\d+) & first_release_date <= (\d+)/.exec(where);
      if (range) rows = rows.filter((r) => r.first_release_date >= Number(range[1]) && r.first_release_date <= Number(range[2]));
      return [...rows].sort((a, b) => (b.total_rating_count ?? 0) - (a.total_rating_count ?? 0)).slice(offset, offset + limit);
    }),
    withTimeToBeat: async (games) => games.map((g) => ({ ...g, timeToBeat: { main: 10, extras: 15, full: 20 } })),
  };
  return api;
}

const pc = [{ id: 6, name: 'PC (Microsoft Windows)' }];
const ps5 = [{ id: 167, name: 'PlayStation 5' }];

function setupImport(igdb, opts = {}) {
  const Game = createFakeCollection({ unique: [['slug']] });
  const MediaCache = createFakeCollection();
  const importer = createCatalogImportService({
    Game,
    MediaCache,
    igdb,
    pageSize: 2,
    targets: { pc: 3, consolePerPlatform: 1, recent: 2 },
    now: () => new Date('2026-10-27T00:00:00Z'),
    ...opts,
  });
  return { Game, MediaCache, importer };
}

const unixDaysFromNow = (days) => Math.floor(new Date('2026-10-27T00:00:00Z').getTime() / 1000) + days * 86400;

describe('catalog import', () => {
  const universe = () => [
    raw(10, 'Steam Giant', { platforms: pc, total_rating_count: 900 }),
    raw(11, 'Steam Giant: Soundtrack DLC', { platforms: pc, game_type: 1, parent_game: 10 }), // DLC in the popularity list
    raw(12, 'Indie Hit', { platforms: pc, total_rating_count: 300 }),
    raw(13, 'Console Only', { platforms: ps5, total_rating_count: 500 }),
    raw(14, 'Deluxe Edition', { platforms: pc, version_parent: 10 }),
    raw(15, 'PC Fourth', { platforms: pc, total_rating_count: 100 }),
    raw(16, 'PC Fifth', { platforms: pc, total_rating_count: 50 }),
    raw(17, 'Fresh Release', { platforms: pc, total_rating_count: 5, first_release_date: unixDaysFromNow(-30) }),
    raw(18, 'Ancient Release', { platforms: pc, total_rating_count: 5, first_release_date: unixDaysFromNow(-900) }),
    raw(19, 'Upcoming Release', { platforms: pc, total_rating_count: 5, first_release_date: unixDaysFromNow(40) }),
    raw(20, 'Too Far Away', { platforms: pc, total_rating_count: 5, first_release_date: unixDaysFromNow(400) }),
  ];
  const popularity = () => ({
    5: [10, 11, 12, 14, 13, 15, 16].map((gameId, i) => ({ gameId, value: 1000 - i * 100 })),
    1: [10, 12, 13].map((gameId, i) => ({ gameId, value: 500 - i * 100 })),
  });

  it('imports PC, console and recent games, never DLC or editions, and sets popularity', async () => {
    const { Game, importer } = setupImport(fakeIgdb(universe(), { popularity: popularity() }));
    const result = await importer.runImport();
    const slugs = Game.docs.map((g) => g.slug);

    expect(slugs).toEqual(expect.arrayContaining(['steam-giant', 'indie-hit', 'console-only']));
    expect(slugs).not.toContain('steam-giant-soundtrack-dlc');
    expect(slugs).not.toContain('deluxe-edition');
    expect(result.steps.pc.pc).toBe(3); // capped at the PC target
    expect(slugs).toEqual(expect.arrayContaining(['fresh-release', 'upcoming-release']));
    expect(slugs).not.toContain('ancient-release');
    expect(slugs).not.toContain('too-far-away');

    const giant = Game.docs.find((g) => g.slug === 'steam-giant');
    const indie = Game.docs.find((g) => g.slug === 'indie-hit');
    expect(giant.popularity).toBeGreaterThan(indie.popularity);
    expect(giant).toMatchObject({ hidden: false, gameType: 0, timeToBeat: { main: 10 } });
    expect(result.catalogSize).toBe(Game.docs.length);
    expect(result.withoutBackdrop).toBe(Game.docs.length); // none of the fixtures has art beyond a cover
  });

  it('is idempotent: a second full run creates no duplicates', async () => {
    const { Game, importer } = setupImport(fakeIgdb(universe(), { popularity: popularity() }));
    await importer.runImport();
    const count = Game.docs.length;
    await importer.runImport({ fresh: true });
    expect(Game.docs).toHaveLength(count);
    expect(new Set(Game.docs.map((g) => g.externalIds.igdb)).size).toBe(count);
  });

  it('skips console games that earlier steps already stored', async () => {
    const { Game, importer } = setupImport(fakeIgdb(universe(), { popularity: popularity() }), { targets: { pc: 5, consolePerPlatform: 5, recent: 0 } });
    await importer.runImport();
    expect(Game.docs.filter((g) => g.slug === 'console-only')).toHaveLength(1);
  });

  it('resumes from the saved batch after a failure instead of starting over', async () => {
    const failOn = { call: 2 };
    const igdb = fakeIgdb(universe(), { popularity: popularity(), failOn });
    const { Game, MediaCache, importer } = setupImport(igdb, { targets: { pc: 5, consolePerPlatform: 0, recent: 0 } });

    await expect(importer.runImport()).rejects.toThrow('IGDB went away');
    const saved = MediaCache.docs[0].payload;
    expect(saved.steps.pc.batch).toBe(1);
    expect(Game.docs.length).toBeGreaterThan(0);

    failOn.call = 0; // IGDB is back
    igdb.fetchByIdsCalls.length = 0;
    await importer.runImport();
    const firstBatchIds = saved && igdb.fetchByIdsCalls.flat();
    expect(firstBatchIds).not.toContain(10); // batch 1 (ids 10, 11) was not fetched again
    expect(MediaCache.docs[0].payload.finished).toBe(true);
    expect(Game.docs.map((g) => g.slug)).toEqual(expect.arrayContaining(['steam-giant', 'indie-hit']));
  });

  it('keeps the progress document out of the way of the per-game cache (single document)', async () => {
    const { MediaCache, importer } = setupImport(fakeIgdb(universe(), { popularity: popularity() }));
    await importer.runImport();
    await importer.runImport({ fresh: true });
    expect(MediaCache.docs).toHaveLength(1);
    expect(MediaCache.docs[0].source).toBe('catalog-import');
    expect(MediaCache.docs[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 365 * 86400_000);
  });

  it('survives a slug clash by suffixing the IGDB id', async () => {
    const { Game, importer } = setupImport(fakeIgdb([raw(30, 'Same Name')]));
    await Game.create({ title: 'Other', slug: 'same-name', externalIds: { igdb: 1 } });
    const stored = await importer.upsertGame(normaliseGame(raw(30, 'Same Name')), { popularity: 5 });
    expect(stored.slug).toBe('same-name-30');
    expect(Game.docs).toHaveLength(2);
  });

  it('blends popularity into 0-100 and ranks bigger numbers higher', () => {
    const max = { visits: 1000, wantToPlay: 1000, steamPeak: 1000, ratingCount: 1000 };
    const big = blendPopularity({ visits: 1000, wantToPlay: 1000, steamPeak: 1000, ratingCount: 1000 }, max);
    const small = blendPopularity({ visits: 10, wantToPlay: 0, steamPeak: 0, ratingCount: 5 }, max);
    expect(big).toBe(100);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(big);
    expect(blendPopularity({}, max)).toBe(0);
  });
});

describe('catalog fix', () => {
  it('hides DLC / bundles / editions with their parent, fills art, aligns slugs and counts the rest', async () => {
    const igdbGames = [
      raw(1, 'Parent Game', { slug: 'parent-game', artworks: [{ image_id: 'art1' }] }),
      raw(2, 'Parent Game: Expansion Pass', { slug: 'parent-game-expansion-pass', game_type: 1, parent_game: 1 }),
      raw(3, 'Bundle Of Things', { slug: 'bundle-of-things', game_type: 3 }),
      raw(4, 'Parent Game Deluxe', { slug: 'parent-game-deluxe', version_parent: 1 }),
      raw(5, 'Hades', { slug: 'hades--1', screenshots: [{ image_id: 'shot5' }] }),
      raw(6, 'God of War Ragnarök', { slug: 'god-of-war-ragnark' }),
      raw(7, 'Wrong Slug', { slug: 'right-slug' }),
      raw(8, 'Clash', { slug: 'taken-slug' }),
    ];
    const { Game, importer } = setupImport(fakeIgdb(igdbGames));
    const seedDoc = (igdb, slug, extra = {}) => Game.create({ title: slug, slug, externalIds: { igdb }, ...extra });
    const parent = await seedDoc(1, 'parent-game', { cover: 'seeded-cover' });
    const dlc = await seedDoc(2, 'parent-game-expansion-pass', { cover: 'dlc-cover' });
    await seedDoc(3, 'bundle-of-things');
    await seedDoc(4, 'parent-game-deluxe');
    await seedDoc(5, 'hades', { title: 'Hades', cover: null }); // seeded slug differs from IGDB
    await seedDoc(6, 'god-of-war-ragnarok', { title: 'God of War RagnarÃ¶k', cover: 'c6' });
    await seedDoc(7, 'wrong-slug');
    await seedDoc(8, 'clash');
    await seedDoc(99, 'taken-slug'); // already owns the slug IGDB gives game 8
    await Game.create({ title: 'Not on IGDB', slug: 'ghost', externalIds: { igdb: 404 } });

    const report = await importer.runFix();
    const bySlug = (slug) => Game.docs.find((g) => g.slug === slug);

    expect(report).toMatchObject({ checked: 10, hidden: 3, parentsLinked: 2, slugsFixed: 3, titlesFixed: 1 });
    expect(report.unmatched.sort()).toEqual(['ghost', 'taken-slug']); // neither exists on IGDB
    expect(report.slugConflicts).toEqual(['clash → taken-slug']);

    const hiddenDlc = bySlug('parent-game-expansion-pass');
    expect(hiddenDlc).toMatchObject({ hidden: true, gameType: 1 });
    expect(String(hiddenDlc.parentGameId)).toBe(String(parent._id));
    expect(bySlug('bundle-of-things')).toMatchObject({ hidden: true, gameType: 3 });
    expect(bySlug('bundle-of-things').parentGameId).toBeUndefined(); // a bundle has no single parent
    expect(String(bySlug('parent-game-deluxe').parentGameId)).toBe(String(parent._id)); // edition → version_parent
    expect(hiddenDlc._id).toBe(dlc._id);

    // the real game stays visible, keeps its seeded cover, and gains the missing backdrop
    expect(bySlug('parent-game')).toMatchObject({ hidden: false, cover: 'seeded-cover' });
    expect(bySlug('parent-game').backdrop).toMatch(/art1\.jpg$/);
    // missing cover and backdrop filled, slug aligned to IGDB, screenshot used as backdrop
    const hades = bySlug('hades--1');
    expect(hades.cover).toMatch(/cov5\.jpg$/);
    expect(hades.backdrop).toMatch(/shot5\.jpg$/);
    expect(report.coversFilled).toBeGreaterThanOrEqual(1);
    expect(report.backdropsFilled).toBeGreaterThanOrEqual(2);
    expect(bySlug('right-slug')).toBeDefined();
    expect(bySlug('clash')).toBeDefined(); // conflicting slug left alone
    expect(bySlug('god-of-war-ragnark').title).toBe('God of War Ragnarök');
  });

  it('keeps a main game visible when IGDB has no cover for it', async () => {
    const noCover = raw(1, 'Coverless', { cover: undefined });
    const { Game, importer } = setupImport(fakeIgdb([noCover]));
    await Game.create({ title: 'Coverless', slug: 'coverless', externalIds: { igdb: 1 } });
    const report = await importer.runFix();
    expect(report.hidden).toBe(0);
    expect(Game.docs[0].hidden).toBe(false);
  });

  it('un-hides a game that turns out to be a real one and backfills popularity', async () => {
    const { Game, importer } = setupImport(fakeIgdb([raw(1, 'Back Again')]));
    await Game.create({ title: 'Back Again', slug: 'back-again', externalIds: { igdb: 1 }, hidden: true });
    const report = await importer.runFix();
    expect(report.unhidden).toBe(1);
    expect(Game.docs[0]).toMatchObject({ hidden: false, popularity: 0 });
  });
});

describe('hidden games in services', () => {
  const noIgdb = { isConfigured: () => false };

  it('search and browse leave hidden games out and sort by popularity', async () => {
    const Game = createFakeCollection({ unique: [['slug']] });
    await Game.create({ title: 'Niche', slug: 'niche', popularity: 5, externalIds: { igdb: 1 } });
    await Game.create({ title: 'Blockbuster', slug: 'blockbuster', popularity: 90, externalIds: { igdb: 2 } });
    await Game.create({ title: 'Blockbuster DLC', slug: 'blockbuster-dlc', popularity: 99, hidden: true, externalIds: { igdb: 3 } });
    await Game.create({ title: 'Middling', slug: 'middling', popularity: 40, externalIds: { igdb: 4 } });
    const service = createGameService({ Game, igdb: noIgdb });

    const page1 = await service.search({ limit: 2 });
    expect(page1.items.map((g) => g.slug)).toEqual(['blockbuster', 'middling']);
    const page2 = await service.search({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items.map((g) => g.slug)).toEqual(['niche']);
    expect(page2.nextCursor).toBeNull();
    expect((await service.search({ q: 'blockbuster', limit: 5 })).items.map((g) => g.slug)).toEqual(['blockbuster']);
  });

  it('a hidden game shows its parent game art, in the game page and the library', async () => {
    const Game = createFakeCollection({ unique: [['slug']] });
    const parent = await Game.create({ title: 'Parent', slug: 'parent', cover: 'parent-cover', backdrop: 'parent-backdrop', externalIds: { igdb: 1 } });
    const dlc = await Game.create({ title: 'Parent DLC', slug: 'parent-dlc', hidden: true, parentGameId: parent._id, cover: null, externalIds: { igdb: 2 } });
    const solo = await Game.create({ title: 'Orphan DLC', slug: 'orphan-dlc', hidden: true, cover: 'own-cover', externalIds: { igdb: 3 } });

    const service = createGameService({ Game, igdb: noIgdb });
    expect(await service.getBySlug('parent-dlc')).toMatchObject({ cover: 'parent-cover', backdrop: 'parent-backdrop' });
    expect((await service.getBySlug('orphan-dlc')).cover).toBe('own-cover');
    expect((await withParentArt(Game, [await Game.findOne({ _id: dlc._id })]))[0].cover).toBe('parent-cover');

    const LibraryEntry = createFakeCollection();
    const library = createLibraryService({ LibraryEntry, StatusHistory: createFakeCollection(), Game });
    const entry = await LibraryEntry.create({ userId: 'u1', gameId: dlc._id, status: 'backlog' });
    await LibraryEntry.create({ userId: 'u1', gameId: solo._id, status: 'backlog' });
    const { items } = await library.list('u1', { limit: 10 });
    expect(items.find((i) => i.gameId === dlc._id).game.cover).toBe('parent-cover');
    expect(items.find((i) => i.gameId === solo._id).game.cover).toBe('own-cover');
    expect((await library.getEntry('u1', entry._id)).game.cover).toBe('parent-cover');
  });

  it('refuses to recommend a hidden game', async () => {
    const Game = createFakeCollection();
    const hiddenGame = await Game.create({ title: 'DLC', slug: 'dlc', hidden: true });
    const service = createRecommendationService({
      Recommendation: createFakeCollection(),
      Game,
      User: createFakeCollection(),
      Review: createFakeCollection(),
      LibraryEntry: createFakeCollection(),
      social: { isBlocked: async () => false, isFriend: async () => true },
    });
    await expect(
      service.send('000000000000000000000001', { toId: '000000000000000000000002', gameId: hiddenGame._id, message: 'try this' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
