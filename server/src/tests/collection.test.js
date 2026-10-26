import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createCollectionService } from '../services/collectionService.js';
import { createEventBus } from '../events/eventBus.js';
import { registerSubscribers } from '../events/subscribers.js';
import { compileRules } from '../utils/smartRules.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

const rule = (field, op, value) => ({ field, op, value });

describe('compileRules (whitelist)', () => {
  it('splits rules by source and coerces values', () => {
    const out = compileRules([
      rule('status', 'eq', 'backlog'),
      rule('timeToBeat.main', 'lte', 15),
      rule('lastPlayedAt', 'gte', '2026-01-01'),
      rule('genres', 'in', ['RPG', 'Indie']),
    ]);
    expect(out.entry.$and).toEqual([
      { status: { $eq: 'backlog' } },
      { lastPlayedAt: { $gte: new Date('2026-01-01') } },
    ]);
    expect(out.game.$and).toEqual([{ 'timeToBeat.main': { $lte: 15 } }, { genres: { $in: ['RPG', 'Indie'] } }]);
  });

  it.each([
    ['unknown field', [rule('passwordHash', 'eq', 'x')]],
    ['operator-looking field', [rule('$where', 'eq', 'x')]],
    ['prototype field', [rule('__proto__', 'eq', 'x')]],
    ['inherited field', [rule('constructor', 'eq', 'x')]],
    ['unknown operator', [rule('status', 'regex', 'back.*')]],
    ['mongo operator as op', [rule('status', '$ne', 'backlog')]],
    ['operator not allowed for the field kind', [rule('status', 'gt', 'backlog')]],
    ['range operator on a string field', [rule('genres', 'lt', 'RPG')]],
    ['object value (operator injection)', [rule('status', 'eq', { $ne: null })]],
    ['array for a scalar operator', [rule('manualProgress', 'gt', [1, 2])]],
    ['scalar for a list operator', [rule('status', 'in', 'backlog')]],
    ['string for a number field', [rule('manualProgress', 'gt', '50')]],
    ['NaN for a number field', [rule('manualProgress', 'gt', Number.NaN)]],
    ['bad enum value', [rule('status', 'eq', 'archived')]],
    ['bad date', [rule('releaseDate', 'gt', 'not a date')]],
    ['no rules', []],
    ['not an array', { field: 'status' }],
    ['too many rules', Array.from({ length: 11 }, () => rule('status', 'eq', 'backlog'))],
  ])('rejects %s with ValidationError', (_name, rules) => {
    expect(() => compileRules(rules)).toThrow(expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }));
  });
});

function setupService({ friends = [], blocks = [] } = {}) {
  const Collection = createFakeCollection({ defaults: { description: '', rules: [], coverGameId: null } });
  const CollectionItem = createFakeCollection({ unique: [['collectionId', 'entryId']], defaults: { note: '' } });
  const LibraryEntry = createFakeCollection({ unique: [['userId', 'gameId']], defaults: { manualProgress: 0, hiddenFromFriends: false, ownerships: [] } });
  const Game = createFakeCollection();
  const User = createFakeCollection();
  const eventBus = createEventBus({ logger: { error: jest.fn() } });
  const events = [];
  eventBus.on('collection.created', (e) => events.push(e));
  const pair = (a, b) => [String(a), String(b)].sort().join(':');
  const friendSet = new Set(friends.map(([a, b]) => pair(a, b)));
  const blockSet = new Set(blocks.map(([a, b]) => pair(a, b)));
  const social = {
    isFriend: async (a, b) => friendSet.has(pair(a, b)),
    isBlocked: async (a, b) => blockSet.has(pair(a, b)),
  };
  const service = createCollectionService({ Collection, CollectionItem, LibraryEntry, Game, User, eventBus, logger, social });
  registerSubscribers({ eventBus, collectionService: service });

  const addGame = (title, extra = {}) => Game.create({ title, slug: title.toLowerCase().replace(/\s+/g, '-'), genres: [], platforms: [], cover: `${title}.jpg`, ...extra });
  const addEntry = async (userId, title, status = 'backlog', extra = {}) => {
    const { game, ...entryExtra } = extra;
    const g = await addGame(title, game);
    return LibraryEntry.create({ userId, gameId: g._id, status, ...entryExtra });
  };
  return { service, Collection, CollectionItem, LibraryEntry, Game, User, eventBus, events, addEntry };
}

const tick = () => new Promise((r) => setImmediate(r));
const manual = (extra = {}) => ({ name: 'Favourites', description: '', visibility: 'private', type: 'manual', rules: [], ...extra });
const titles = (res) => res.items.map((i) => i.entry.game.title);

describe('collectionService — manual collections', () => {
  it('creates a private manual collection and emits collection.created', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('u1', manual({ name: 'Best of' }));
    expect(c).toMatchObject({ name: 'Best of', visibility: 'private', type: 'manual', itemCount: 0, isOwner: true });
    await tick();
    expect(ctx.events).toEqual([expect.objectContaining({ userId: 'u1', collectionId: c.id, type: 'manual', visibility: 'private' })]);
  });

  it('rejects rules on a manual collection, and a smart collection with bad or no rules, saving nothing', async () => {
    const ctx = setupService();
    await expect(ctx.service.create('u1', manual({ rules: [rule('status', 'eq', 'backlog')] }))).rejects.toMatchObject({ status: 400 });
    await expect(ctx.service.create('u1', manual({ type: 'smart', rules: [] }))).rejects.toMatchObject({ status: 400 });
    await expect(ctx.service.create('u1', manual({ type: 'smart', rules: [rule('passwordHash', 'eq', 'x')] }))).rejects.toMatchObject({ status: 400 });
    expect(ctx.Collection.docs).toHaveLength(0);
    expect(ctx.events).toHaveLength(0);
  });

  it('adds items at the end, rejects duplicates, and only accepts the caller’s own entries', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('u1', manual());
    const a = await ctx.addEntry('u1', 'A');
    const b = await ctx.addEntry('u1', 'B');
    const foreign = await ctx.addEntry('u2', 'Z');
    const first = await ctx.service.addItem('u1', c.id, { entryId: a._id, note: 'start here' });
    const second = await ctx.service.addItem('u1', c.id, { entryId: b._id });
    expect(second.position).toBeGreaterThan(first.position);
    expect(first.note).toBe('start here');
    await expect(ctx.service.addItem('u1', c.id, { entryId: a._id })).rejects.toMatchObject({ status: 409 });
    await expect(ctx.service.addItem('u1', c.id, { entryId: foreign._id })).rejects.toMatchObject({ status: 404 });
    expect(titles(await ctx.service.get('u1', c.id))).toEqual(['A', 'B']);
  });

  it('removes an item and 404s for an unknown one', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('u1', manual());
    const e = await ctx.addEntry('u1', 'A');
    const item = await ctx.service.addItem('u1', c.id, { entryId: e._id });
    await ctx.service.removeItem('u1', c.id, item.id);
    expect((await ctx.service.get('u1', c.id)).items).toHaveLength(0);
    await expect(ctx.service.removeItem('u1', c.id, item.id)).rejects.toMatchObject({ status: 404 });
  });

  async function threeItems() {
    const ctx = setupService();
    const c = await ctx.service.create('u1', manual());
    const items = [];
    for (const t of ['A', 'B', 'C']) {
      const e = await ctx.addEntry('u1', t);
      items.push(await ctx.service.addItem('u1', c.id, { entryId: e._id }));
    }
    return { ctx, c, items };
  }

  it('moves an item between neighbours by writing the midpoint', async () => {
    const { ctx, c, items } = await threeItems();
    const [a, b, cc] = items;
    const moved = await ctx.service.moveItem('u1', c.id, cc.id, a.id); // C directly after A → between A and B
    expect(moved.position).toBeCloseTo((a.position + b.position) / 2);
    expect(titles(await ctx.service.get('u1', c.id))).toEqual(['A', 'C', 'B']);
  });

  it('moves to the top (null) and to the bottom', async () => {
    const { ctx, c, items } = await threeItems();
    const [a, , cc] = items;
    await ctx.service.moveItem('u1', c.id, cc.id, null);
    expect(titles(await ctx.service.get('u1', c.id))).toEqual(['C', 'A', 'B']);
    await ctx.service.moveItem('u1', c.id, a.id, items[1].id);
    expect(titles(await ctx.service.get('u1', c.id))).toEqual(['C', 'B', 'A']);
  });

  it('renumbers the list when the gap between neighbours drops below 1e-9, keeping the order', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('u1', manual());
    const ids = [];
    for (const [t, position] of [['A', 1], ['B', 1 + 1e-10], ['C', 5]]) {
      const e = await ctx.addEntry('u1', t);
      const item = await ctx.CollectionItem.create({ collectionId: c.id, entryId: e._id, position });
      ids.push(item._id);
    }
    await ctx.service.moveItem('u1', c.id, ids[2], ids[0]); // C between A and B, whose gap is 1e-10
    expect(titles(await ctx.service.get('u1', c.id))).toEqual(['A', 'C', 'B']);
    const positions = ctx.CollectionItem.docs.map((d) => d.position).sort((x, y) => x - y);
    expect(positions).toEqual([1, 1.5, 2]); // A, B renumbered to 1, 2; C takes the midpoint
  });

  it('rejects placing an item after itself or after an item that is not in the collection', async () => {
    const { ctx, c, items } = await threeItems();
    await expect(ctx.service.moveItem('u1', c.id, items[0].id, items[0].id)).rejects.toMatchObject({ status: 400 });
    await expect(ctx.service.moveItem('u1', c.id, items[0].id, '9'.repeat(24))).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.moveItem('u1', c.id, '9'.repeat(24), null)).rejects.toMatchObject({ status: 404 });
  });

  it('pages items with a position cursor', async () => {
    const { ctx, c } = await threeItems();
    const p1 = await ctx.service.get('u1', c.id, { limit: 2 });
    expect(titles(p1)).toEqual(['A', 'B']);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await ctx.service.get('u1', c.id, { limit: 2, cursor: p1.nextCursor });
    expect(titles(p2)).toEqual(['C']);
    expect(p2.nextCursor).toBeNull();
  });

  it('deleting a collection deletes its items; forgetting an entry removes it from every collection', async () => {
    const { ctx, c, items } = await threeItems();
    const other = await ctx.service.create('u1', manual({ name: 'Other' }));
    await ctx.service.addItem('u1', other.id, { entryId: ctx.CollectionItem.docs[0].entryId });
    await ctx.service.forgetEntry(ctx.CollectionItem.docs[0].entryId);
    expect(ctx.CollectionItem.docs).toHaveLength(2);
    await ctx.service.remove('u1', c.id);
    expect(ctx.CollectionItem.docs.filter((d) => d.collectionId === c.id)).toHaveLength(0);
    expect(items).toHaveLength(3);
  });

  it('removes an entry from collections when library.entryRemoved is emitted', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('u1', manual());
    const e = await ctx.addEntry('u1', 'A');
    await ctx.service.addItem('u1', c.id, { entryId: e._id });
    ctx.eventBus.emit('library.entryRemoved', { userId: 'u1', entryId: e._id });
    await tick();
    expect(ctx.CollectionItem.docs).toHaveLength(0);
  });
});

describe('collectionService — ownership and privacy', () => {
  it('private: only the owner can see it; others get 404 for read and write', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('owner', manual({ visibility: 'private' }));
    await expect(ctx.service.get('other', c.id)).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.update('other', c.id, { name: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.remove('other', c.id)).rejects.toMatchObject({ status: 404 });
  });

  it('public: anyone can read, but only the owner can change (403)', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('owner', manual({ visibility: 'public' }));
    expect((await ctx.service.get('other', c.id)).collection.isOwner).toBe(false);
    await expect(ctx.service.update('other', c.id, { name: 'x' })).rejects.toMatchObject({ status: 403 });
    await expect(ctx.service.addItem('other', c.id, { entryId: '1'.repeat(24) })).rejects.toMatchObject({ status: 403 });
    await expect(ctx.service.remove('other', c.id)).rejects.toMatchObject({ status: 403 });
    expect(ctx.Collection.docs).toHaveLength(1);
  });

  it('friends: visible to friends only', async () => {
    const ctx = setupService({ friends: [['owner', 'pal']] });
    const c = await ctx.service.create('owner', manual({ visibility: 'friends' }));
    expect((await ctx.service.get('pal', c.id)).collection.name).toBe('Favourites');
    await expect(ctx.service.get('stranger', c.id)).rejects.toMatchObject({ status: 404 });
  });

  it('a block overrides public and friends visibility', async () => {
    const ctx = setupService({ friends: [['owner', 'pal']], blocks: [['owner', 'pal'], ['owner', 'troll']] });
    const pub = await ctx.service.create('owner', manual({ visibility: 'public' }));
    const fr = await ctx.service.create('owner', manual({ visibility: 'friends' }));
    await expect(ctx.service.get('troll', pub.id)).rejects.toMatchObject({ status: 404 });
    await expect(ctx.service.get('pal', fr.id)).rejects.toMatchObject({ status: 404 });
    expect(await ctx.service.listVisibleFor('pal', 'owner')).toEqual([]);
  });

  it('hides entries marked hiddenFromFriends from everyone but the owner (manual and smart)', async () => {
    const ctx = setupService();
    const manualC = await ctx.service.create('owner', manual({ visibility: 'public' }));
    const smartC = await ctx.service.create('owner', manual({ visibility: 'public', type: 'smart', rules: [rule('status', 'eq', 'backlog')] }));
    const shown = await ctx.addEntry('owner', 'Shown');
    const secret = await ctx.addEntry('owner', 'Secret', 'backlog', { hiddenFromFriends: true });
    for (const e of [shown, secret]) await ctx.service.addItem('owner', manualC.id, { entryId: e._id });

    for (const id of [manualC.id, smartC.id]) {
      const asOwner = await ctx.service.get('owner', id);
      const asOther = await ctx.service.get('other', id);
      expect(titles(asOwner).sort()).toEqual(['Secret', 'Shown']);
      expect(titles(asOther)).toEqual(['Shown']);
      expect(asOther.collection.itemCount).toBe(1); // the hidden game is not even counted
    }
  });

  it('lists a profile’s collections by what the viewer may see', async () => {
    const ctx = setupService({ friends: [['owner', 'pal']] });
    for (const visibility of ['public', 'friends', 'private']) await ctx.service.create('owner', manual({ name: visibility, visibility }));
    const names = async (viewer) => (await ctx.service.listVisibleFor(viewer, 'owner')).map((c) => c.name).sort();
    expect(await names('owner')).toEqual(['friends', 'private', 'public']);
    expect(await names('pal')).toEqual(['friends', 'public']);
    expect(await names('stranger')).toEqual(['public']);
  });

  it('keeps the collection type fixed and rejects rules on a manual one', async () => {
    const ctx = setupService();
    const c = await ctx.service.create('u1', manual());
    await expect(ctx.service.update('u1', c.id, { rules: [rule('status', 'eq', 'backlog')] })).rejects.toMatchObject({ status: 400 });
    const renamed = await ctx.service.update('u1', c.id, { name: 'New name', visibility: 'public' });
    expect(renamed).toMatchObject({ name: 'New name', visibility: 'public', type: 'manual' });
  });
});

describe('collectionService — smart collections', () => {
  async function library() {
    const ctx = setupService();
    await ctx.addEntry('u1', 'Short backlog', 'backlog', { game: { timeToBeat: { main: 8 }, genres: ['Indie'] } });
    await ctx.addEntry('u1', 'Long backlog', 'backlog', { game: { timeToBeat: { main: 60 }, genres: ['RPG'] } });
    await ctx.addEntry('u1', 'Short playing', 'playing', { game: { timeToBeat: { main: 5 }, genres: ['Indie'] } });
    await ctx.addEntry('u1', 'No estimate', 'backlog', { game: {} });
    await ctx.addEntry('u2', 'Their short backlog', 'backlog', { game: { timeToBeat: { main: 3 } } });
    return ctx;
  }

  it('computes items on read from the owner’s library only, combining entry and game rules', async () => {
    const ctx = await library();
    const c = await ctx.service.create('u1', manual({
      type: 'smart',
      rules: [rule('status', 'eq', 'backlog'), rule('timeToBeat.main', 'lte', 15)],
    }));
    const res = await ctx.service.get('u1', c.id);
    expect(titles(res)).toEqual(['Short backlog']);
    expect(res.collection).toMatchObject({ type: 'smart', itemCount: 1 });
    expect(ctx.CollectionItem.docs).toHaveLength(0); // nothing is stored
  });

  it('reflects library changes without any update to the collection', async () => {
    const ctx = await library();
    const c = await ctx.service.create('u1', manual({ type: 'smart', rules: [rule('status', 'eq', 'playing')] }));
    expect(titles(await ctx.service.get('u1', c.id))).toEqual(['Short playing']);
    await ctx.LibraryEntry.findOneAndUpdate({ userId: 'u1', status: 'backlog' }, { $set: { status: 'playing' } });
    expect((await ctx.service.get('u1', c.id)).items).toHaveLength(2);
  });

  it('supports in / nin / ne on array and enum fields', async () => {
    const ctx = await library();
    const run = async (rules) => titles(await ctx.service.get('u1', (await ctx.service.create('u1', manual({ type: 'smart', rules }))).id)).sort();
    expect(await run([rule('genres', 'in', ['Indie'])])).toEqual(['Short backlog', 'Short playing']);
    expect(await run([rule('genres', 'nin', ['Indie', 'RPG'])])).toEqual(['No estimate']);
    expect(await run([rule('status', 'ne', 'backlog')])).toEqual(['Short playing']);
    expect(await run([rule('status', 'nin', ['backlog', 'playing'])])).toEqual([]);
  });

  it('rejects manual item operations and saving invalid rules on update', async () => {
    const ctx = await library();
    const c = await ctx.service.create('u1', manual({ type: 'smart', rules: [rule('status', 'eq', 'backlog')] }));
    await expect(ctx.service.addItem('u1', c.id, { entryId: '1'.repeat(24) })).rejects.toMatchObject({ status: 409 });
    await expect(ctx.service.moveItem('u1', c.id, '1'.repeat(24), null)).rejects.toMatchObject({ status: 409 });
    await expect(ctx.service.update('u1', c.id, { rules: [rule('$where', 'eq', 'x')] })).rejects.toMatchObject({ status: 400 });
    expect((await ctx.service.update('u1', c.id, { rules: [rule('status', 'eq', 'playing')] })).itemCount).toBe(1);
  });

  it('previews unsaved rules against the caller’s library', async () => {
    const ctx = await library();
    const res = await ctx.service.preview('u1', { rules: [rule('timeToBeat.main', 'lt', 10)] });
    expect(res.total).toBe(2);
    expect(res.items.map((i) => i.entry.game.title).sort()).toEqual(['Short backlog', 'Short playing']);
    await expect(ctx.service.preview('u1', { rules: [rule('status', 'gt', 'x')] })).rejects.toMatchObject({ status: 400 });
  });
});

describe('collectionService — profile privacy and covers', () => {
  async function ownerWith(privacy, friends = []) {
    const ctx = setupService({ friends });
    const owner = await ctx.User.create({ username: 'owner', usernameLower: 'owner', privacy });
    return { ...ctx, ownerId: owner._id };
  }

  it('a private profile hides even its public collections from direct links', async () => {
    const ctx = await ownerWith('private');
    const c = await ctx.service.create(ctx.ownerId, manual({ visibility: 'public' }));
    await expect(ctx.service.get('stranger', c.id)).rejects.toMatchObject({ status: 404 });
    expect((await ctx.service.get(ctx.ownerId, c.id)).collection.isOwner).toBe(true);
  });

  it('a friends-only profile shows its public collections to friends only', async () => {
    const ctx = await ownerWith('friends', [['__owner__', 'pal']]);
    const c = await ctx.service.create(ctx.ownerId, manual({ visibility: 'public' }));
    await expect(ctx.service.get('stranger', c.id)).rejects.toMatchObject({ status: 404 });
    const withFriend = setupService({ friends: [[ctx.ownerId, 'pal']] });
    const owner = await withFriend.User.create({ username: 'owner', usernameLower: 'owner', privacy: 'friends' });
    const pub = await withFriend.service.create(owner._id, manual({ visibility: 'public' }));
    expect((await withFriend.service.get('pal', pub.id)).collection.name).toBe('Favourites');
    await expect(withFriend.service.get('stranger', pub.id)).rejects.toMatchObject({ status: 404 });
  });

  it('only accepts a cover from a visible game in the owner’s own library', async () => {
    const ctx = setupService();
    const shown = await ctx.addEntry('u1', 'Shown');
    const hidden = await ctx.addEntry('u1', 'Hidden', 'backlog', { hiddenFromFriends: true });
    const foreign = await ctx.addEntry('u2', 'Theirs');
    await expect(ctx.service.create('u1', manual({ coverGameId: hidden.gameId }))).rejects.toMatchObject({ status: 400 });
    await expect(ctx.service.create('u1', manual({ coverGameId: foreign.gameId }))).rejects.toMatchObject({ status: 400 });
    const c = await ctx.service.create('u1', manual({ coverGameId: shown.gameId }));
    expect(c.covers).toEqual(['Shown.jpg']);
    await expect(ctx.service.update('u1', c.id, { coverGameId: hidden.gameId })).rejects.toMatchObject({ status: 400 });
    expect((await ctx.service.update('u1', c.id, { coverGameId: null })).coverGameId).toBeNull();
  });
});
describe('/api/v1/collections', () => {
  function setupApp() {
    const config = testConfig();
    const authService = createAuthService({ ...createFakeModels(), config, bcryptRounds: 4, reuseGraceMs: 0 });
    const ctx = setupService();
    const app = createApp({ config, logger, authService, collectionService: ctx.service, eventBus: ctx.eventBus });
    return { app, ...ctx };
  }
  const register = async (app, name) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return { agent, id: res.body.user.id };
  };

  it('requires authentication', async () => {
    const { app } = setupApp();
    expect((await request(app).get('/api/v1/collections')).status).toBe(401);
    expect((await request(app).post('/api/v1/collections').send(manual())).status).toBe(401);
  });

  it('validates input with the shared schemas', async () => {
    const { app } = setupApp();
    const { agent } = await register(app, 'neo');
    const post = (body) => agent.post('/api/v1/collections').send(body);
    expect((await post({ name: '' })).status).toBe(400);
    expect((await post({ name: 'x', type: 'smart' })).status).toBe(400); // no rules
    expect((await post({ name: 'x', rules: [rule('status', 'eq', 'backlog')] })).status).toBe(400); // rules on manual
    expect((await post({ name: 'x', type: 'smart', rules: [rule('passwordHash', 'eq', 'a')] })).status).toBe(400);
    expect((await post({ name: 'x', type: 'smart', rules: [rule('status', 'eq', { $ne: null })] })).status).toBe(400);
    expect((await post({ name: 'x', visibility: 'everyone' })).status).toBe(400);
    expect((await agent.get('/api/v1/collections/not-an-id')).status).toBe(400);
    expect((await agent.post('/api/v1/collections/preview').send({ rules: [] })).status).toBe(400);
  });

  it('ignores an ownerId in the body: the owner is always the caller', async () => {
    const { app, Collection } = setupApp();
    const { agent, id } = await register(app, 'neo');
    const res = await agent.post('/api/v1/collections').send({ ...manual(), ownerId: 'someone-else' });
    expect(res.status).toBe(201);
    expect(Collection.docs[0].ownerId).toBe(id);
  });

  it('runs create → add → move → get → rename → remove → delete', async () => {
    const { app, addEntry } = setupApp();
    const { agent, id: uid } = await register(app, 'neo');
    const created = (await agent.post('/api/v1/collections').send(manual({ name: 'Mine' }))).body.collection;
    const [a, b] = [await addEntry(uid, 'A'), await addEntry(uid, 'B')];
    const itemA = (await agent.post(`/api/v1/collections/${created.id}/items`).send({ entryId: a._id })).body.item;
    const itemB = (await agent.post(`/api/v1/collections/${created.id}/items`).send({ entryId: b._id })).body.item;
    expect((await agent.post(`/api/v1/collections/${created.id}/items`).send({ entryId: a._id })).status).toBe(409);

    const moved = await agent.patch(`/api/v1/collections/${created.id}/items/${itemB.id}/position`).send({ afterItemId: null });
    expect(moved.status).toBe(200);
    const detail = (await agent.get(`/api/v1/collections/${created.id}`)).body;
    expect(titles(detail)).toEqual(['B', 'A']);
    expect(detail.collection.itemCount).toBe(2);

    expect((await agent.get('/api/v1/collections')).body.items[0]).toMatchObject({ name: 'Mine', itemCount: 2 });
    expect((await agent.patch(`/api/v1/collections/${created.id}`).send({ name: 'Renamed' })).body.collection.name).toBe('Renamed');
    expect((await agent.delete(`/api/v1/collections/${created.id}/items/${itemA.id}`)).status).toBe(204);
    expect((await agent.delete(`/api/v1/collections/${created.id}`)).status).toBe(204);
    expect((await agent.get(`/api/v1/collections/${created.id}`)).status).toBe(404);
  });

  it('shows a public collection to another user but not a private one, and blocks their writes', async () => {
    const { app } = setupApp();
    const owner = await register(app, 'owner');
    const other = await register(app, 'other');
    const pub = (await owner.agent.post('/api/v1/collections').send(manual({ visibility: 'public' }))).body.collection;
    const priv = (await owner.agent.post('/api/v1/collections').send(manual({ name: 'Secret' }))).body.collection;
    expect((await other.agent.get(`/api/v1/collections/${pub.id}`)).status).toBe(200);
    expect((await other.agent.get(`/api/v1/collections/${priv.id}`)).status).toBe(404);
    expect((await other.agent.patch(`/api/v1/collections/${pub.id}`).send({ name: 'hijack' })).status).toBe(403);
    expect((await other.agent.delete(`/api/v1/collections/${priv.id}`)).status).toBe(404);
    expect((await other.agent.get('/api/v1/collections')).body.items).toEqual([]);
  });

  it('previews smart rules for the caller', async () => {
    const { app, addEntry } = setupApp();
    const { agent, id } = await register(app, 'neo');
    await addEntry(id, 'Quick', 'backlog', { game: { timeToBeat: { main: 4 } } });
    await addEntry(id, 'Epic', 'backlog', { game: { timeToBeat: { main: 90 } } });
    const res = await agent.post('/api/v1/collections/preview').send({ rules: [rule('timeToBeat.main', 'lte', 15)] });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });
});
