import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createFriendService } from '../services/friendService.js';
import { createHomeService } from '../services/homeService.js';
import { createNotificationService } from '../services/notificationService.js';
import { createAccountService, levelForXp, xpForLevel } from '../services/accountService.js';
import { createRequirementsService } from '../services/requirementsService.js';
import { parseRequirementsHtml } from '../adapters/platforms/steam.js';
import { createEventBus } from '../events/eventBus.js';
import { LEGAL_UPDATED, PRIVACY, TERMS, registerSchema } from '@gamequest/shared';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

const DAY = 86_400_000;

function setup({ steam } = {}) {
  const models = createFakeModels();
  const { User, RefreshToken } = models;
  const config = testConfig();
  const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
  const c = (unique) => createFakeCollection({ unique });
  const m = {
    User,
    RefreshToken,
    Game: c(),
    LibraryEntry: c([['userId', 'gameId']]),
    StatusHistory: c(),
    PlayLog: c(),
    JournalEntry: c(),
    Review: c([['userId', 'gameId']]),
    Collection: c(),
    CollectionItem: c(),
    Friendship: c([['userA', 'userB']]),
    Block: c([['blockerId', 'blockedId']]),
    Activity: c(),
    GameSession: c(),
    Rsvp: c([['sessionId', 'userId']]),
    Recommendation: c([['fromId', 'toId', 'gameId']]),
    MediaCache: c([['gameId', 'source']]),
  };
  const eventBus = createEventBus({ logger: { error: jest.fn() } });
  const friendService = createFriendService({ Friendship: m.Friendship, Block: m.Block, User, eventBus });
  const insightsService = { getPlayNext: jest.fn(async () => ({ items: [] })) };
  const homeService = createHomeService({ ...m, insightsService });
  const notificationService = createNotificationService(m);
  const accountService = createAccountService({ ...m, notificationService, logger });
  const requirementsService = createRequirementsService({ Game: m.Game, MediaCache: m.MediaCache, steam, logger });
  const app = createApp({
    config,
    logger,
    authService,
    friendService,
    homeService,
    notificationService,
    accountService,
    requirementsService,
    insightsService,
    eventBus,
  });

  const login = async (name) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return { agent, user: res.body.user };
  };
  return { ...m, app, insightsService, friendService, homeService, notificationService, accountService, login };
}

const game = (s, over = {}) =>
  s.Game.create({
    title: 'Hades',
    slug: `g-${Math.random().toString(36).slice(2, 8)}`,
    cover: 'c.jpg',
    backdrop: 'b.jpg',
    releaseDate: new Date(Date.now() - 400 * DAY),
    popularity: 10,
    totalRating: 93,
    ...over,
  });

describe('home data (real numbers, real games)', () => {
  it('counts catalog games, players and public collections for the hero', async () => {
    const s = setup();
    await game(s);
    await game(s, { hidden: true });
    await s.login('alice');
    await s.Collection.create({ ownerId: 'x', name: 'Public', visibility: 'public' });
    await s.Collection.create({ ownerId: 'x', name: 'Mine', visibility: 'private' });
    const res = await request(s.app).get('/api/v1/public/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ games: 1, players: 1, collections: 1, reviews: 0 });
  });

  it('features released popular games with art, best first, with a 10-point rating', async () => {
    const s = setup();
    await game(s, { title: 'Second', popularity: 5, totalRating: 88 });
    await game(s, { title: 'First', popularity: 50, totalRating: 96.4 });
    await game(s, { title: 'No art', popularity: 99, backdrop: null });
    await game(s, { title: 'Upcoming', popularity: 98, releaseDate: new Date(Date.now() + 30 * DAY) });
    await game(s, { title: 'Hidden DLC', popularity: 97, hidden: true });
    const { agent } = await s.login('alice');
    const res = await agent.get('/api/v1/games/featured?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.items.map((g) => g.title)).toEqual(['First', 'Second']);
    expect(res.body.items[0].rating).toBe(9.6);
  });

  it('next adventure falls back to a popular game the user does not own', async () => {
    const s = setup();
    const owned = await game(s, { title: 'Owned', popularity: 90 });
    await game(s, { title: 'Popular', popularity: 80 });
    const { agent, user } = await s.login('alice');
    await s.LibraryEntry.create({ userId: user.id, gameId: owned._id, status: 'completed' });
    const res = await agent.get('/api/v1/insights/next-adventure');
    expect(res.body.pick).toMatchObject({ source: 'popular', game: { title: 'Popular' } });
  });
});

describe('notifications (the bell)', () => {
  it('lists friend requests, recommendations and unanswered session invites, then marks them read', async () => {
    const s = setup();
    const { agent, user: alice } = await s.login('alice');
    const { user: bob } = await s.login('bob');
    const { user: cara } = await s.login('cara');
    const g = await game(s, { title: 'Hades' });
    await s.friendService.sendRequest(bob.id, { username: 'alice' });
    await s.Recommendation.create({ fromId: cara.id, toId: alice.id, gameId: g._id, status: 'pending' });
    const invite = await s.GameSession.create({
      hostId: bob.id,
      gameId: g._id,
      title: 'Hades night',
      startsAt: new Date(Date.now() + DAY),
      invitees: [alice.id],
      status: 'scheduled',
    });
    const answered = await s.GameSession.create({
      hostId: bob.id,
      gameId: g._id,
      startsAt: new Date(Date.now() + DAY),
      invitees: [alice.id],
      status: 'scheduled',
    });
    await s.Rsvp.create({ sessionId: answered._id, userId: alice.id, response: 'going' });

    const res = await agent.get('/api/v1/notifications');
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(3);
    expect(res.body.items.map((n) => n.type).sort()).toEqual(['friend_request', 'recommendation', 'session_invite']);
    const inv = res.body.items.find((n) => n.type === 'session_invite');
    expect(inv).toMatchObject({ text: 'bob invited you to Hades night', link: `/sessions/${invite._id}` });

    expect((await agent.post('/api/v1/notifications/read')).body.unread).toBe(0);
    const after = await agent.get('/api/v1/notifications');
    expect(after.body.unread).toBe(0);
    expect(after.body.items).toHaveLength(3); // still listed, just read
  });

  it('needs a signed-in user', async () => {
    const s = setup();
    expect((await request(s.app).get('/api/v1/notifications')).status).toBe(401);
  });
});

describe('account summary and level', () => {
  it('levels come from real activity: hours, completed games and reviews', async () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(400)).toBe(3);
    expect(xpForLevel(3)).toBe(400);

    const s = setup();
    const { agent, user } = await s.login('alice');
    const g1 = await game(s);
    const g2 = await game(s);
    await s.LibraryEntry.create({ userId: user.id, gameId: g1._id, status: 'completed', loggedMinutes: 600 });
    await s.LibraryEntry.create({ userId: user.id, gameId: g2._id, status: 'playing', ownerships: [{ platform: 'Steam', playtimeMin: 1200 }] });
    await s.Review.create({ userId: user.id, gameId: g1._id, rating: 5 });
    const res = await agent.get('/api/v1/account/summary');
    expect(res.status).toBe(200);
    // 30 h * 10 + 1 completed * 100 + 1 review * 25 = 425 XP -> level 3
    expect(res.body).toMatchObject({ username: 'alice', xp: 425, level: 3, levelStartXp: 400, nextLevelXp: 900, unreadNotifications: 0 });
  });
});

describe('account deletion', () => {
  it('requires the exact username', async () => {
    const s = setup();
    const { agent } = await s.login('alice');
    const res = await agent.delete('/api/v1/account').send({ confirmUsername: 'bob' });
    expect(res.status).toBe(400);
    expect(await s.User.countDocuments({})).toBe(1);
  });

  it('removes the user and their data, recalculates ratings, and signs them out', async () => {
    const s = setup();
    const { agent, user: alice } = await s.login('alice');
    const { user: bob } = await s.login('bob');
    const g = await game(s);
    const entry = await s.LibraryEntry.create({ userId: alice.id, gameId: g._id, status: 'playing' });
    await s.PlayLog.create({ userId: alice.id, entryId: entry._id, minutes: 30 });
    await s.Review.create({ userId: alice.id, gameId: g._id, rating: 5 });
    await s.Review.create({ userId: bob.id, gameId: g._id, rating: 3 });
    await s.Game.updateOne({ _id: g._id }, { $set: { ratingAvg: 4, ratingCount: 2 } });
    const col = await s.Collection.create({ ownerId: alice.id, name: 'Mine', visibility: 'public' });
    await s.CollectionItem.create({ collectionId: col._id, entryId: entry._id, position: 1 });
    await s.friendService.sendRequest(alice.id, { username: 'bob' });
    await s.Activity.create({ actorId: alice.id, type: 'library.statusChanged' });
    await s.Recommendation.create({ fromId: alice.id, toId: bob.id, gameId: g._id });

    const res = await agent.delete('/api/v1/account').send({ confirmUsername: 'Alice' });
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/gq_access=;/);

    expect(await s.User.countDocuments({ _id: alice.id })).toBe(0);
    expect(await s.User.countDocuments({ _id: bob.id })).toBe(1);
    for (const model of [s.LibraryEntry, s.PlayLog, s.Collection, s.CollectionItem, s.Activity, s.Recommendation, s.Friendship]) {
      expect(model.docs.filter((d) => [d.userId, d.ownerId, d.actorId, d.fromId, d.userA, d.userB].map(String).includes(alice.id))).toHaveLength(0);
    }
    expect(s.CollectionItem.docs).toHaveLength(0);
    const after = await s.Game.findOne({ _id: g._id });
    expect(after).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
    expect((await agent.get('/api/v1/account/summary')).status).toBe(401);
  });
});

describe('system requirements (Steam store)', () => {
  it('parses a Steam requirements block into label/value rows', () => {
    const rows = parseRequirementsHtml(
      '<strong>Minimum:</strong><br><ul class="bb_ul"><li><strong>OS:</strong> Windows 10 64-bit<br></li><li><strong>Memory:</strong> 8 GB RAM<br></li><li>Requires a 64-bit processor</li></ul>',
    );
    expect(rows).toEqual([
      { label: 'OS', value: 'Windows 10 64-bit' },
      { label: 'Memory', value: '8 GB RAM' },
      { label: null, value: 'Requires a 64-bit processor' },
    ]);
  });

  it('serves requirements for Steam games, caches them, and explains when there are none', async () => {
    const steam = { getRequirements: jest.fn(async () => ({ minimum: [{ label: 'OS', value: 'Windows 10' }], recommended: [] })) };
    const s = setup({ steam });
    const onSteam = await game(s, { slug: 'hades', externalIds: { steam: '1145360' } });
    await game(s, { slug: 'zelda', externalIds: {} });
    const { agent } = await s.login('alice');

    const first = await agent.get('/api/v1/games/hades/requirements');
    expect(first.body).toMatchObject({ available: true, minimum: [{ label: 'OS', value: 'Windows 10' }], source: { name: 'Steam' } });
    await agent.get('/api/v1/games/hades/requirements');
    expect(steam.getRequirements).toHaveBeenCalledTimes(1);
    expect(s.MediaCache.docs.find((d) => String(d.gameId) === String(onSteam._id))?.source).toBe('steam-requirements');

    const none = await agent.get('/api/v1/games/zelda/requirements');
    expect(none.body).toMatchObject({ available: false, minimum: [] });
    expect(none.body.reason).toMatch(/not on Steam/);
  });

  it('a failing Steam store gives a readable message instead of an error', async () => {
    const steam = { getRequirements: jest.fn(async () => Promise.reject(new Error('down'))) };
    const s = setup({ steam });
    await game(s, { slug: 'hades', externalIds: { steam: '1145360' } });
    const { agent } = await s.login('alice');
    const res = await agent.get('/api/v1/games/hades/requirements');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: false });
    expect(res.body.reason).toMatch(/could not be loaded/);
  });
});

describe('terms and privacy', () => {
  it('ships plain-language terms and privacy text, and registration records acceptance', async () => {
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS.length).toBeGreaterThan(2);
    expect(PRIVACY.map((p) => p.heading)).toEqual(expect.arrayContaining(['What we store', 'Cookies', 'Deleting your data']));
    expect(registerSchema.safeParse({ username: 'abc', email: 'a@b.co', password: 'longenough1', acceptTerms: false }).success).toBe(false);

    const s = setup();
    const agent = request.agent(s.app);
    const res = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'dana', email: 'dana@example.com', password: 'correct-horse-9', acceptTerms: true });
    expect(res.status).toBe(201);
    expect(typeof (await s.User.findOne({ usernameLower: 'dana' })).termsAcceptedAt?.getTime()).toBe('number');
  });
});
