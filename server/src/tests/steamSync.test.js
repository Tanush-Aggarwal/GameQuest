import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createSteamAdapter } from '../adapters/platforms/steam.js';
import { createSteamService } from '../services/steamService.js';
import { createSteamSyncService, initialStatus } from '../services/steamSyncService.js';
import { createCatalogImportService } from '../services/catalogImportService.js';
import { createActivityService } from '../services/activityService.js';
import { registerSubscribers } from '../events/subscribers.js';
import { createEventBus } from '../events/eventBus.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

const KEY = 'SECRETKEY1234567890';
const STEAM_ID = '76561198000000001';
const tick = () => new Promise((r) => setImmediate(r));
const reply = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });

// A raw IGDB game like the catalog tests use; game_type 0 = main game.
const raw = (id, name, extra = {}) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  game_type: 0,
  cover: { image_id: `cov${id}` },
  platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
  ...extra,
});

// An owned game as Steam returns it. `w` is playtime_2weeks.
const own = (appid, name, playtime = 0, { w = 0, last = 0 } = {}) => ({
  appid: Number(appid),
  name,
  playtime_forever: playtime,
  ...(w && { playtime_2weeks: w }),
  ...(last && { rtime_last_played: last }),
});

// Fake Steam web API. `ach[appid]` is a list of 0/1 per achievement; an appid without one has no stats (HTTP 400).
function steamFetch({ owned = [], ownedBody, ach = {}, achStatus = {} } = {}) {
  return jest.fn(async (url) => {
    const u = new URL(url);
    const appid = u.searchParams.get('appid');
    if (u.pathname.includes('GetOwnedGames')) return reply(ownedBody ?? { response: { game_count: owned.length, games: owned } });
    if (u.pathname.includes('GetPlayerAchievements')) {
      if (achStatus[appid]) return reply({}, achStatus[appid]);
      if (!ach[appid]) return reply({ playerstats: { success: false, error: 'Requested app has no stats' } }, 400);
      return reply({ playerstats: { success: true, achievements: ach[appid].map((a, i) => ({ apiname: `a${i}`, achieved: a })) } });
    }
    throw new Error(`unexpected ${u.pathname}`);
  });
}

function setup({ fetchOptions, igdbHits = [], igdbFails = false, igdbConfigured = true } = {}) {
  const models = createFakeModels();
  const config = testConfig({ STEAM_API_KEY: KEY });
  const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
  const Game = createFakeCollection({ unique: [['slug']] });
  const LibraryEntry = createFakeCollection({
    unique: [['userId', 'gameId']],
    defaults: { manualProgress: 0, ownerships: [], completedAt: null, hiddenFromFriends: false, lastPlayedAt: null, achievements: { unlocked: null, total: null, fetchedAt: null } },
  });
  const StatusHistory = createFakeCollection();
  const fetchImpl = steamFetch(fetchOptions);
  const steam = createSteamAdapter({ config, fetchImpl });
  const igdb = {
    isConfigured: () => igdbConfigured,
    fetchBySteamAppIds: jest.fn(async (apps) => {
      if (igdbFails) throw new Error('IGDB down');
      return igdbHits.filter((h) => apps.includes(h.appid));
    }),
    withTimeToBeat: async (games) => games,
  };
  const eventBus = createEventBus({ logger: { error: jest.fn() } });
  const events = [];
  eventBus.on('sync.completed', (e) => events.push(e));
  const importGame = createCatalogImportService({ Game, MediaCache: {}, igdb }).upsertGame;
  const service = createSteamSyncService({ User: models.User, Game, LibraryEntry, StatusHistory, steam, igdb, importGame, eventBus, logger });
  const mkUser = async (name, { linked = true } = {}) => {
    const { user } = await authService.register({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    if (linked) models.User.docs.find((u) => u._id === user.id).steam = { steamId: STEAM_ID };
    return user;
  };
  const mkGame = (title, appid, extra = {}) =>
    Game.create({ title, slug: title.toLowerCase().replace(/\W+/g, '-'), externalIds: { steam: String(appid) }, hidden: false, ...extra });
  const entryFor = (userId, game) => LibraryEntry.docs.find((e) => e.userId === userId && String(e.gameId) === String(game._id));
  return { ...models, config, authService, Game, LibraryEntry, StatusHistory, steam, igdb, fetchImpl, eventBus, events, service, mkUser, mkGame, entryFor, importGame };
}

describe('initialStatus', () => {
  it('prefers playing (recent play), then completed (100% achievements), else backlog', () => {
    expect(initialStatus({ playtime2wMin: 30, achievements: { unlocked: 5, total: 5 } })).toBe('playing');
    expect(initialStatus({ playtime2wMin: 0, achievements: { unlocked: 5, total: 5 } })).toBe('completed');
    expect(initialStatus({ playtime2wMin: 0, achievements: { unlocked: 4, total: 5 } })).toBe('backlog');
    expect(initialStatus({ playtime2wMin: 0, achievements: { unlocked: null, total: null } })).toBe('backlog');
    expect(initialStatus({ playtime2wMin: 0, achievements: null })).toBe('backlog');
    expect(initialStatus({ playtime2wMin: 0, achievements: { unlocked: 0, total: 0 } })).toBe('backlog'); // 0/0 is not "100%"
  });
});

describe('steamSyncService: new entries', () => {
  it('creates one entry per game with the right initial status, ownership, achievements and history', async () => {
    const s = setup({
      fetchOptions: {
        owned: [own(1, 'Recent', 600, { w: 90, last: 1_700_000_000 }), own(2, 'Done', 3000), own(3, 'Partial', 120), own(4, 'NoAch', 50), own(5, 'Unplayed', 0)],
        ach: { 1: [1, 0, 0], 2: [1, 1, 1], 3: [1, 0, 0, 0] },
      },
    });
    const games = await Promise.all([s.mkGame('Recent', 1), s.mkGame('Done', 2), s.mkGame('Partial', 3), s.mkGame('NoAch', 4), s.mkGame('Unplayed', 5)]);
    const neo = await s.mkUser('neo');

    const result = await s.service.syncUser(neo.id);

    expect(result).toMatchObject({ added: 5, updated: 0, unmatched: [] });
    expect(s.LibraryEntry.docs).toHaveLength(5);
    const statuses = Object.fromEntries(games.map((g) => [g.title, s.entryFor(neo.id, g).status]));
    expect(statuses).toEqual({ Recent: 'playing', Done: 'completed', Partial: 'backlog', NoAch: 'backlog', Unplayed: 'backlog' });

    const recent = s.entryFor(neo.id, games[0]);
    expect(recent.ownerships).toEqual([expect.objectContaining({ platform: 'Steam', externalId: '1', playtimeMin: 600, lastSyncedAt: expect.any(Date) })]);
    expect(recent.achievements).toMatchObject({ unlocked: 1, total: 3 });
    expect(recent.lastPlayedAt).toEqual(new Date(1_700_000_000_000));
    expect(recent.manualProgress).toBe(0);

    const done = s.entryFor(neo.id, games[1]);
    expect(done.completedAt).toEqual(expect.any(Date));
    expect(s.entryFor(neo.id, games[2]).completedAt).toBeNull();
    // games without achievements are fine: total stays null
    expect(s.entryFor(neo.id, games[3]).achievements).toMatchObject({ unlocked: null, total: null });

    // every new entry has its StatusHistory row (null -> status)
    expect(s.StatusHistory.docs).toHaveLength(5);
    expect(s.StatusHistory.docs.find((h) => h.entryId === done._id)).toMatchObject({ from: null, to: 'completed', userId: neo.id });
  });

  it('merges two Steam appids for one game into a single entry with summed playtime', async () => {
    const s = setup({ fetchOptions: { owned: [own(10, 'Game', 100), own(11, 'Game (Regional)', 400)] } });
    const game = await s.mkGame('Game', 10);
    await s.Game.updateOne({ _id: game._id }, { $set: { 'externalIds.steam': '10' } });
    s.igdb.fetchBySteamAppIds.mockResolvedValue([{ appid: '11', raw: raw(77, 'Game') }]);
    await s.Game.updateOne({ _id: game._id }, { $set: { 'externalIds.igdb': 77 } });
    const neo = await s.mkUser('neo');

    const result = await s.service.syncUser(neo.id);

    expect(result.added).toBe(1);
    expect(s.LibraryEntry.docs).toHaveLength(1);
    expect(s.LibraryEntry.docs[0].ownerships).toEqual([expect.objectContaining({ platform: 'Steam', externalId: '11', playtimeMin: 500 })]);
  });
});

describe('steamSyncService: existing entries', () => {
  it('never overwrites manualProgress or a status the user set, and keeps other platforms', async () => {
    const s = setup({
      fetchOptions: { owned: [own(1, 'Hades', 900, { w: 120, last: 1_700_000_000 })], ach: { 1: [1, 1] } },
    });
    const game = await s.mkGame('Hades', 1);
    const neo = await s.mkUser('neo');
    const earlier = new Date('2024-01-01');
    await s.LibraryEntry.create({
      userId: neo.id,
      gameId: game._id,
      status: 'dropped',
      manualProgress: 42,
      loggedMinutes: 77,
      ownerships: [{ platform: 'Switch', externalId: null, playtimeMin: 10, lastSyncedAt: null }],
      lastPlayedAt: earlier,
    });

    const result = await s.service.syncUser(neo.id);

    expect(result).toMatchObject({ added: 0, updated: 1 });
    const entry = s.LibraryEntry.docs[0];
    expect(entry.status).toBe('dropped'); // even with 100% achievements and recent play
    expect(entry.manualProgress).toBe(42);
    expect(entry.loggedMinutes).toBe(77);
    expect(entry.completedAt).toBeNull();
    expect(entry.ownerships.map((o) => o.platform).sort()).toEqual(['Steam', 'Switch']);
    expect(entry.ownerships.find((o) => o.platform === 'Steam')).toMatchObject({ externalId: '1', playtimeMin: 900 });
    expect(entry.ownerships.find((o) => o.platform === 'Switch').playtimeMin).toBe(10);
    expect(entry.achievements).toMatchObject({ unlocked: 2, total: 2 });
    expect(s.StatusHistory.docs).toHaveLength(0); // a sync never rewrites history of an existing entry
  });

  it('only moves lastPlayedAt forward', async () => {
    const s = setup({ fetchOptions: { owned: [own(1, 'A', 5, { last: 1_600_000_000 })] } });
    const game = await s.mkGame('A', 1);
    const neo = await s.mkUser('neo');
    const later = new Date('2025-06-01');
    await s.LibraryEntry.create({ userId: neo.id, gameId: game._id, status: 'playing', lastPlayedAt: later });
    await s.service.syncUser(neo.id);
    expect(s.LibraryEntry.docs[0].lastPlayedAt).toEqual(later);
  });

  it('is idempotent: a second sync updates in place, with one Steam ownership row', async () => {
    const s = setup({ fetchOptions: { owned: [own(1, 'A', 100), own(2, 'B', 200)] } });
    await s.mkGame('A', 1);
    await s.mkGame('B', 2);
    const neo = await s.mkUser('neo');
    await s.service.syncUser(neo.id);
    const again = await s.service.syncUser(neo.id);
    expect(again).toMatchObject({ added: 0, updated: 2 });
    expect(s.LibraryEntry.docs).toHaveLength(2);
    for (const e of s.LibraryEntry.docs) expect(e.ownerships.filter((o) => o.platform === 'Steam')).toHaveLength(1);
    expect(s.StatusHistory.docs).toHaveLength(2);
  });

  it('survives a game the user added by hand while the sync ran: counts and history stay truthful', async () => {
    const s = setup({ fetchOptions: { owned: [own(1, 'Raced', 100), own(2, 'Fresh A', 50), own(3, 'Fresh B', 70)], ach: { 2: [1, 1] } } });
    const raced = await s.mkGame('Raced', 1);
    await s.mkGame('Fresh A', 2);
    await s.mkGame('Fresh B', 3);
    const neo = await s.mkUser('neo');
    // The entry appears after the sync looked for existing ones, so the bulk insert hits a duplicate key.
    const realFind = s.LibraryEntry.find;
    let looked = false;
    s.LibraryEntry.find = (q) => {
      if (!looked) {
        looked = true;
        return realFind({ _id: 'none' });
      }
      return realFind(q);
    };
    await s.LibraryEntry.create({ userId: neo.id, gameId: raced._id, status: 'wishlist', manualProgress: 15 });

    const result = await s.service.syncUser(neo.id);

    // Mongo stored the two clean docs before throwing; the sync must count those, not zero or three
    expect(result).toMatchObject({ added: 2, updated: 1 });
    expect(s.LibraryEntry.docs).toHaveLength(3);
    // each new entry has its (null -> status) history row, and only the new ones
    expect(s.StatusHistory.docs).toHaveLength(2);
    expect(s.StatusHistory.docs.map((h) => h.to).sort()).toEqual(['backlog', 'completed']);
    // the hand-added entry keeps its status and progress and gains the Steam ownership
    const hand = s.entryFor(neo.id, raced);
    expect(hand).toMatchObject({ status: 'wishlist', manualProgress: 15 });
    expect(hand.ownerships).toEqual([expect.objectContaining({ platform: 'Steam', externalId: '1', playtimeMin: 100 })]);
  });

  it('keeps the previous achievements when Steam fails for a game, and says so', async () => {
    const s = setup({
      fetchOptions: { owned: [own(1, 'A', 100), own(2, 'B', 100)], ach: { 2: [1, 0] }, achStatus: { 1: 500 } },
    });
    const a = await s.mkGame('A', 1);
    const b = await s.mkGame('B', 2);
    const neo = await s.mkUser('neo');
    const fetchedAt = new Date('2025-01-01');
    await s.LibraryEntry.create({ userId: neo.id, gameId: a._id, status: 'playing', achievements: { unlocked: 3, total: 10, fetchedAt } });

    const result = await s.service.syncUser(neo.id);

    // allSettled: the failing game did not fail the sync
    expect(result).toMatchObject({ added: 1, updated: 1 });
    expect(result.warnings.join(' ')).toMatch(/1 game/);
    expect(s.entryFor(neo.id, a).achievements).toMatchObject({ unlocked: 3, total: 10, fetchedAt });
    expect(s.entryFor(neo.id, b).achievements).toMatchObject({ unlocked: 1, total: 2 });
  });
});

describe('steamSyncService: matching and unmatched reporting', () => {
  it('imports an unknown appid found in IGDB, with the catalog filter, and reports the rest', async () => {
    const s = setup({
      fetchOptions: { owned: [own(1, 'Known', 10), own(20, 'Newly Imported', 300), own(30, 'Some Soundtrack', 5), own(40, 'Mystery Tool', 900), own(50, 'A DLC', 60)] },
      igdbHits: [
        { appid: '20', raw: raw(2020, 'Newly Imported') },
        { appid: '30', raw: raw(3030, 'Some Soundtrack', { game_type: 5 }) }, // not a catalog type
        { appid: '50', raw: raw(5050, 'A DLC', { game_type: 1 }) }, // DLC
        // appid 40 is not in IGDB at all
      ],
    });
    const known = await s.mkGame('Known', 1);
    const neo = await s.mkUser('neo');

    const result = await s.service.syncUser(neo.id);

    expect(result.added).toBe(2);
    expect(result.unmatched).toEqual([
      { appid: '40', name: 'Mystery Tool', playtimeMin: 900 },
      { appid: '50', name: 'A DLC', playtimeMin: 60 },
      { appid: '30', name: 'Some Soundtrack', playtimeMin: 5 },
    ]);
    // imported game carries the steam id; unmatched ones were never added to the catalog or library
    const imported = s.Game.docs.find((g) => g.title === 'Newly Imported');
    expect(imported.externalIds).toMatchObject({ steam: '20', igdb: 2020 });
    expect(s.Game.docs.map((g) => g.title).sort()).toEqual(['Known', 'Newly Imported']);
    expect(s.LibraryEntry.docs.map((e) => String(e.gameId)).sort()).toEqual([String(known._id), String(imported._id)].sort());
    // IGDB was asked only for appids we could not match locally
    expect(s.igdb.fetchBySteamAppIds).toHaveBeenCalledWith(['20', '30', '40', '50']);
  });

  it('attaches the Steam id to a catalog game we already hold by IGDB id, without duplicating it', async () => {
    const s = setup({ fetchOptions: { owned: [own(60, 'Held', 100)] }, igdbHits: [{ appid: '60', raw: raw(6060, 'Held') }] });
    const held = await s.Game.create({ title: 'Held', slug: 'held', externalIds: { igdb: 6060 }, hidden: false });
    const neo = await s.mkUser('neo');
    const result = await s.service.syncUser(neo.id);
    expect(result).toMatchObject({ added: 1, unmatched: [] });
    expect(s.Game.docs).toHaveLength(1);
    expect(s.Game.docs[0].externalIds.steam).toBe('60');
    expect(s.LibraryEntry.docs[0].gameId).toBe(held._id);
  });

  it('reports a hidden game (DLC kept for old library entries) instead of adding it', async () => {
    const s = setup({ fetchOptions: { owned: [own(70, 'Hidden DLC', 20)] } });
    await s.mkGame('Hidden DLC', 70, { hidden: true });
    const neo = await s.mkUser('neo');
    const result = await s.service.syncUser(neo.id);
    expect(result.added).toBe(0);
    expect(result.unmatched).toEqual([{ appid: '70', name: 'Hidden DLC', playtimeMin: 20 }]);
    expect(s.LibraryEntry.docs).toHaveLength(0);
  });

  it('still syncs known games and reports the rest when IGDB fails', async () => {
    const s = setup({ fetchOptions: { owned: [own(1, 'Known', 10), own(2, 'Unknown', 20)] }, igdbFails: true });
    await s.mkGame('Known', 1);
    const neo = await s.mkUser('neo');
    const result = await s.service.syncUser(neo.id);
    expect(result.added).toBe(1);
    expect(result.unmatched).toEqual([{ appid: '2', name: 'Unknown', playtimeMin: 20 }]);
    expect(result.warnings.join(' ')).toMatch(/could not be looked up/);
  });

  it('skips the IGDB lookup when IGDB is not configured', async () => {
    const s = setup({ fetchOptions: { owned: [own(2, 'Unknown', 20)] }, igdbConfigured: false });
    const neo = await s.mkUser('neo');
    const result = await s.service.syncUser(neo.id);
    expect(s.igdb.fetchBySteamAppIds).not.toHaveBeenCalled();
    expect(result.unmatched).toHaveLength(1);
  });
});

describe('steamSyncService: failures, lock and events', () => {
  it('turns a private profile into a clear UpstreamError and writes nothing', async () => {
    const s = setup({ fetchOptions: { ownedBody: { response: {} } } });
    await s.mkGame('A', 1);
    const neo = await s.mkUser('neo');
    const err = await s.service.syncUser(neo.id).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' });
    expect(err.message).toMatch(/Game details/);
    expect(err.message).toMatch(/Public/);
    expect(JSON.stringify(err.message)).not.toContain(KEY);
    expect(s.LibraryEntry.docs).toHaveLength(0);
    expect(s.events).toHaveLength(0);
    // the lock was released: a retry after fixing privacy works
    s.fetchImpl.mockImplementation(steamFetch({ owned: [own(1, 'A', 5)] }));
    await expect(s.service.syncUser(neo.id)).resolves.toMatchObject({ added: 1 });
  });

  it('treats a public profile with no games as an empty library, not a private one', async () => {
    const s = setup({ fetchOptions: { ownedBody: { response: { game_count: 0 } } } });
    const neo = await s.mkUser('neo');
    await expect(s.service.syncUser(neo.id)).resolves.toMatchObject({ added: 0, updated: 0, unmatched: [] });
  });

  it('requires a linked account', async () => {
    const s = setup();
    const neo = await s.mkUser('neo', { linked: false });
    await expect(s.service.syncUser(neo.id)).rejects.toMatchObject({ status: 409 });
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a second sync for the same user while one is running', async () => {
    const s = setup({ fetchOptions: { owned: [own(1, 'A', 5)] } });
    await s.mkGame('A', 1);
    const neo = await s.mkUser('neo');
    const [first, second] = await Promise.allSettled([s.service.syncUser(neo.id), s.service.syncUser(neo.id)]);
    expect(first.status).toBe('fulfilled');
    expect(second).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    expect(s.LibraryEntry.docs).toHaveLength(1);
  });

  it('emits sync.completed, stores the last sync on the user, and never exposes the API key', async () => {
    const s = setup({ fetchOptions: { owned: [own(1, 'A', 5), own(2, 'Tool', 5)] } });
    await s.mkGame('A', 1);
    const neo = await s.mkUser('neo');
    const result = await s.service.syncUser(neo.id);
    await tick();
    expect(s.events).toEqual([expect.objectContaining({ userId: neo.id, platform: 'Steam', added: 1, updated: 0, unmatchedCount: 1 })]);
    const user = s.User.docs.find((u) => u._id === neo.id);
    expect(user.steam.lastSync).toMatchObject({ added: 1, updated: 0, unmatchedCount: 1, at: expect.any(Date) });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('records one "synced N games" activity item, and none for a sync that adds nothing', async () => {
    const s = setup({ fetchOptions: { owned: [own(1, 'A', 5), own(2, 'B', 5)] } });
    await s.mkGame('A', 1);
    await s.mkGame('B', 2);
    const Activity = createFakeCollection();
    const activityService = createActivityService({ Activity, LibraryEntry: s.LibraryEntry, Game: s.Game, User: s.User, Collection: createFakeCollection(), social: {} });
    registerSubscribers({ eventBus: s.eventBus, activityService });
    const neo = await s.mkUser('neo');

    await s.service.syncUser(neo.id);
    await tick();
    expect(Activity.docs).toHaveLength(1);
    expect(Activity.docs[0]).toMatchObject({ actorId: neo.id, type: 'sync.completed', data: { platform: 'Steam', count: 2 }, level: 'friends' });
    expect(Activity.docs[0].gameId).toBeUndefined(); // no single game to attach

    await s.service.syncUser(neo.id); // refreshes playtime only
    await tick();
    expect(Activity.docs).toHaveLength(1);
  });
});

describe('POST /api/v1/sync/steam', () => {
  function setupApp({ fetchOptions }) {
    const s = setup({ fetchOptions });
    const steamService = createSteamService({ User: s.User, steam: s.steam });
    const app = createApp({ config: s.config, logger, authService: s.authService, steamService, steamSyncService: s.service });
    return { app, s };
  }
  const register = async (app, name) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return { agent, id: res.body.user.id };
  };

  it('requires authentication', async () => {
    const { app } = setupApp({ fetchOptions: {} });
    expect((await request(app).post('/api/v1/sync/steam')).status).toBe(401);
  });

  it('syncs the signed-in user, answers { added, updated, unmatched }, and allows one sync per 5 minutes', async () => {
    const { app, s } = setupApp({ fetchOptions: { owned: [own(1, 'A', 5), own(2, 'Tool', 9)] } });
    await s.mkGame('A', 1);
    const { agent, id } = await register(app, 'neo');
    s.User.docs.find((u) => u._id === id).steam = { steamId: STEAM_ID };

    const first = await agent.post('/api/v1/sync/steam').send({ userId: 'someone-else' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ added: 1, updated: 0, unmatched: [{ appid: '2', name: 'Tool', playtimeMin: 9 }] });
    expect(s.LibraryEntry.docs[0].userId).toBe(id); // identity from the cookie, not the body

    const second = await agent.post('/api/v1/sync/steam');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not use up the allowance when the sync fails (private profile)', async () => {
    const { app, s } = setupApp({ fetchOptions: { ownedBody: { response: {} } } });
    const { agent, id } = await register(app, 'neo');
    s.User.docs.find((u) => u._id === id).steam = { steamId: STEAM_ID };
    const failed = await agent.post('/api/v1/sync/steam');
    expect(failed.status).toBe(502);
    expect(failed.body.error.message).toMatch(/Game details/);
    s.fetchImpl.mockImplementation(steamFetch({ owned: [] }));
    expect((await agent.post('/api/v1/sync/steam')).status).toBe(200);
  });

  it('limits each user separately', async () => {
    const { app, s } = setupApp({ fetchOptions: { owned: [] } });
    const a = await register(app, 'alice');
    const b = await register(app, 'bob');
    for (const u of [a, b]) s.User.docs.find((x) => x._id === u.id).steam = { steamId: STEAM_ID };
    expect((await a.agent.post('/api/v1/sync/steam')).status).toBe(200);
    expect((await b.agent.post('/api/v1/sync/steam')).status).toBe(200);
  });
});
