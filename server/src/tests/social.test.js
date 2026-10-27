import request from 'supertest';
import { jest } from '@jest/globals';
import { updateProfileSchema } from '@gamequest/shared';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createFriendService } from '../services/friendService.js';
import { createActivityService } from '../services/activityService.js';
import { createProfileService } from '../services/profileService.js';
import { createCollectionService } from '../services/collectionService.js';
import { createReviewService } from '../services/reviewService.js';
import { createLibraryService } from '../services/libraryService.js';
import { createEventBus } from '../events/eventBus.js';
import { registerSubscribers } from '../events/subscribers.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

function setup({ subscribe = true } = {}) {
  const models = createFakeModels();
  const config = testConfig();
  const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
  const { User } = models;
  const Friendship = createFakeCollection({ unique: [['userA', 'userB']] });
  const Block = createFakeCollection({ unique: [['blockerId', 'blockedId']] });
  const Activity = createFakeCollection();
  const Game = createFakeCollection();
  const LibraryEntry = createFakeCollection({ unique: [['userId', 'gameId']], defaults: { manualProgress: 0, hiddenFromFriends: false, ownerships: [], loggedMinutes: 0 } });
  const StatusHistory = createFakeCollection();
  const Collection = createFakeCollection({ defaults: { description: '', rules: [], coverGameId: null } });
  const CollectionItem = createFakeCollection({ unique: [['collectionId', 'entryId']] });
  const Review = createFakeCollection({ unique: [['userId', 'gameId']] });
  const eventBus = createEventBus({ logger: { error: jest.fn() } });

  const friendService = createFriendService({ Friendship, Block, User, LibraryEntry, Game, eventBus });
  const collectionService = createCollectionService({ Collection, CollectionItem, LibraryEntry, Game, User, eventBus, logger, social: friendService });
  const activityService = createActivityService({ Activity, LibraryEntry, Game, User, Collection, social: friendService, logger });
  const profileService = createProfileService({ User, LibraryEntry, Review, friendService, activityService, collectionService, Game });
  const libraryService = createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus, logger });
  const reviewService = createReviewService({ Review, Game, User, eventBus });
  if (subscribe) registerSubscribers({ eventBus, collectionService, activityService }); // createApp registers its own

  const mkUser = async (name) => (await authService.register({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' })).user;
  const mkGame = (title) => Game.create({ title, slug: title.toLowerCase().replace(/\s+/g, '-'), genres: [], platforms: [], cover: `${title}.jpg` });
  const befriend = async (a, b) => {
    const { friendshipId } = await friendService.sendRequest(a.id, { username: b.username });
    await friendService.accept(b.id, friendshipId);
  };
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    config, authService, eventBus, models, User, Friendship, Block, Activity, Game, LibraryEntry, Collection, CollectionItem, Review,
    friendService, activityService, profileService, collectionService, libraryService, reviewService, mkUser, mkGame, befriend, tick,
  };
}

describe('friendService — requests and friendships', () => {
  it('creates one pending request per pair, stored sorted, whoever asks', async () => {
    const ctx = setup();
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    const res = await ctx.friendService.sendRequest(b.id, { username: 'Alice' }); // case-insensitive
    expect(res).toMatchObject({ status: 'pending', user: { username: 'alice' } });
    const doc = ctx.Friendship.docs[0];
    expect(doc.userA < doc.userB).toBe(true);
    expect(doc.requestedBy).toBe(b.id);
    await expect(ctx.friendService.sendRequest(b.id, { username: 'alice' })).rejects.toMatchObject({ status: 409 });
    expect(ctx.Friendship.docs).toHaveLength(1);
    expect(a.id).toBeTruthy();
  });

  it('rejects requests to yourself and to unknown players', async () => {
    const ctx = setup();
    const a = await ctx.mkUser('alice');
    await expect(ctx.friendService.sendRequest(a.id, { username: 'alice' })).rejects.toMatchObject({ status: 400 });
    await expect(ctx.friendService.sendRequest(a.id, { username: 'nobody' })).rejects.toMatchObject({ status: 404 });
  });

  it('only the recipient can accept; then both see each other as friends', async () => {
    const ctx = setup();
    const [a, b, c] = [await ctx.mkUser('alice'), await ctx.mkUser('bob'), await ctx.mkUser('carol')];
    const { friendshipId } = await ctx.friendService.sendRequest(a.id, { username: 'bob' });
    await expect(ctx.friendService.accept(a.id, friendshipId)).rejects.toMatchObject({ status: 403 }); // the sender
    await expect(ctx.friendService.accept(c.id, friendshipId)).rejects.toMatchObject({ status: 404 }); // a stranger
    await ctx.friendService.accept(b.id, friendshipId);
    expect(await ctx.friendService.isFriend(a.id, b.id)).toBe(true);
    expect(await ctx.friendService.isFriend(b.id, a.id)).toBe(true);
    expect((await ctx.friendService.listFriends(a.id)).map((f) => f.username)).toEqual(['bob']);
    expect((await ctx.friendService.listFriends(b.id)).map((f) => f.username)).toEqual(['alice']);
    await expect(ctx.friendService.accept(b.id, friendshipId)).rejects.toMatchObject({ status: 409 });
  });

  it('exposes a friend’s currently playing game with art, respecting hidden and privacy settings', async () => {
    const ctx = setup();
    const [a, b, c] = [await ctx.mkUser('alice'), await ctx.mkUser('bob'), await ctx.mkUser('carol')];
    await ctx.befriend(a, b);
    await ctx.befriend(a, c);

    const hades = await ctx.mkGame('Hades');
    const celeste = await ctx.mkGame('Celeste');

    // Bob is playing Hades
    await ctx.LibraryEntry.create({
      userId: b.id,
      gameId: hades._id,
      status: 'playing',
      hiddenFromFriends: false,
    });

    // Carol is playing Celeste but hid it from friends
    await ctx.LibraryEntry.create({
      userId: c.id,
      gameId: celeste._id,
      status: 'playing',
      hiddenFromFriends: true,
    });

    const friendsOfA = await ctx.friendService.listFriends(a.id);
    const bobRow = friendsOfA.find((f) => f.username === 'bob');
    const carolRow = friendsOfA.find((f) => f.username === 'carol');

    expect(bobRow.currentlyPlaying).toMatchObject({
      title: 'Hades',
      slug: 'hades',
      cover: 'Hades.jpg',
    });
    expect(carolRow.currentlyPlaying).toBeNull();

    // If Bob sets profile privacy to private, his currently playing game is hidden
    await ctx.models.User.updateOne({ _id: b.id }, { $set: { privacy: 'private' } });
    const friendsOfAAgain = await ctx.friendService.listFriends(a.id);
    expect(friendsOfAAgain.find((f) => f.username === 'bob').currentlyPlaying).toBeNull();
  });

  it('treats crossed requests as an acceptance', async () => {
    const ctx = setup();
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    await ctx.friendService.sendRequest(a.id, { username: 'bob' });
    const back = await ctx.friendService.sendRequest(b.id, { username: 'alice' });
    expect(back.status).toBe('accepted');
    expect(await ctx.friendService.isFriend(a.id, b.id)).toBe(true);
    expect(ctx.Friendship.docs).toHaveLength(1);
    await expect(ctx.friendService.sendRequest(a.id, { username: 'bob' })).rejects.toMatchObject({ status: 409 }); // already friends
  });

  it('lists incoming and outgoing requests', async () => {
    const ctx = setup();
    const [a, b, c] = [await ctx.mkUser('alice'), await ctx.mkUser('bob'), await ctx.mkUser('carol')];
    await ctx.friendService.sendRequest(a.id, { username: 'bob' });
    await ctx.friendService.sendRequest(c.id, { username: 'alice' });
    const forAlice = await ctx.friendService.listRequests(a.id);
    expect(forAlice.outgoing.map((r) => r.user.username)).toEqual(['bob']);
    expect(forAlice.incoming.map((r) => r.user.username)).toEqual(['carol']);
    expect((await ctx.friendService.listRequests(b.id)).incoming.map((r) => r.user.username)).toEqual(['alice']);
  });

  it('decline removes the request (and the sender may ask again); cancel is for the sender only', async () => {
    const ctx = setup();
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    const first = await ctx.friendService.sendRequest(a.id, { username: 'bob' });
    await expect(ctx.friendService.decline(a.id, first.friendshipId)).rejects.toMatchObject({ status: 403 });
    await ctx.friendService.decline(b.id, first.friendshipId);
    expect(ctx.Friendship.docs).toHaveLength(0);

    const second = await ctx.friendService.sendRequest(a.id, { username: 'bob' });
    await expect(ctx.friendService.cancel(b.id, second.friendshipId)).rejects.toMatchObject({ status: 403 });
    await ctx.friendService.cancel(a.id, second.friendshipId);
    expect(ctx.Friendship.docs).toHaveLength(0);
    await expect(ctx.friendService.cancel(a.id, second.friendshipId)).rejects.toMatchObject({ status: 404 });
  });

  it('unfriends, and 404s when there is no friendship', async () => {
    const ctx = setup();
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    await expect(ctx.friendService.unfriend(a.id, b.id)).rejects.toMatchObject({ status: 404 });
    await ctx.befriend(a, b);
    await ctx.friendService.unfriend(b.id, a.id);
    expect(await ctx.friendService.isFriend(a.id, b.id)).toBe(false);
  });

  it('emits friend.requested and friend.accepted', async () => {
    const ctx = setup();
    const seen = [];
    ctx.eventBus.on('friend.requested', (e) => seen.push(['requested', e.userId]));
    ctx.eventBus.on('friend.accepted', (e) => seen.push(['accepted', e.userId]));
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    await ctx.befriend(a, b);
    await ctx.tick();
    expect(seen).toEqual([['requested', a.id], ['accepted', b.id]]);
  });
});

describe('friendService — search and blocks', () => {
  it('searches by username prefix with relation labels, excluding yourself', async () => {
    const ctx = setup();
    const [me, pal, pending, stranger] = [await ctx.mkUser('meme'), await ctx.mkUser('mal_pal'), await ctx.mkUser('mara'), await ctx.mkUser('mixer')];
    await ctx.befriend(me, pal);
    await ctx.friendService.sendRequest(me.id, { username: 'mara' });
    const found = await ctx.friendService.searchUsers(me.id, { q: 'm' + 'a' });
    expect(found.map((u) => [u.username, u.relation]).sort()).toEqual([['mal_pal', 'friend'], ['mara', 'pending_out']]);
    const all = await ctx.friendService.searchUsers(me.id, { q: 'mi' });
    expect(all).toEqual([expect.objectContaining({ username: 'mixer', relation: 'none' })]);
    expect(stranger.id).toBeTruthy();
    expect(pending.id).toBeTruthy();
  });

  it('treats regex characters in the search as plain text', async () => {
    const ctx = setup();
    const me = await ctx.mkUser('alice');
    await ctx.mkUser('bob');
    expect(await ctx.friendService.searchUsers(me.id, { q: '.*' })).toEqual([]);
  });

  it('a block ends the friendship and hides both players from each other', async () => {
    const ctx = setup();
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    await ctx.befriend(a, b);
    await ctx.friendService.block(a.id, b.id);
    expect(ctx.Friendship.docs).toHaveLength(0);
    expect(await ctx.friendService.isBlocked(a.id, b.id)).toBe(true);
    expect(await ctx.friendService.isBlocked(b.id, a.id)).toBe(true);
    // the blocked player can't find or contact the blocker …
    expect(await ctx.friendService.searchUsers(b.id, { q: 'al' })).toEqual([]);
    await expect(ctx.friendService.sendRequest(b.id, { username: 'alice' })).rejects.toMatchObject({ status: 404 });
    // … and the blocker must unblock first
    await expect(ctx.friendService.sendRequest(a.id, { username: 'bob' })).rejects.toMatchObject({ status: 403 });
    expect((await ctx.friendService.listBlocked(a.id)).map((u) => u.username)).toEqual(['bob']);
    expect(await ctx.friendService.listBlocked(b.id)).toEqual([]);
  });

  it('blocking is idempotent, can’t target yourself, and unblock restores contact', async () => {
    const ctx = setup();
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    await expect(ctx.friendService.block(a.id, a.id)).rejects.toMatchObject({ status: 400 });
    await expect(ctx.friendService.block(a.id, '9'.repeat(24))).rejects.toMatchObject({ status: 404 });
    await ctx.friendService.block(a.id, b.id);
    await ctx.friendService.block(a.id, b.id);
    expect(ctx.Block.docs).toHaveLength(1);
    await ctx.friendService.unblock(a.id, b.id);
    await expect(ctx.friendService.unblock(a.id, b.id)).rejects.toMatchObject({ status: 404 });
    expect((await ctx.friendService.sendRequest(a.id, { username: 'bob' })).status).toBe('pending');
  });

  it('a block cancels a pending request in either direction', async () => {
    const ctx = setup();
    const [a, b] = [await ctx.mkUser('alice'), await ctx.mkUser('bob')];
    await ctx.friendService.sendRequest(a.id, { username: 'bob' });
    await ctx.friendService.block(b.id, a.id);
    expect(ctx.Friendship.docs).toHaveLength(0);
    expect((await ctx.friendService.listRequests(b.id)).incoming).toEqual([]);
  });
});

describe('activity feed', () => {
  async function world() {
    const ctx = setup();
    const [demo, alex, zed] = [await ctx.mkUser('demo'), await ctx.mkUser('alex'), await ctx.mkUser('zed')];
    await ctx.befriend(demo, alex);
    const game = await ctx.mkGame('Hades');
    const entry = await ctx.LibraryEntry.create({ userId: alex.id, gameId: game._id, status: 'backlog' });
    return { ...ctx, demo, alex, zed, game, entry };
  }
  const texts = (feed) => feed.items.map((i) => `${i.actor.username}:${i.type}`);

  it('subscribers turn domain events into activity (and nothing else writes it)', async () => {
    const ctx = await world();
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.alex.id, entryId: ctx.entry._id, gameId: ctx.game._id, from: 'backlog', to: 'playing' });
    ctx.eventBus.emit('library.sessionLogged', { userId: ctx.alex.id, entryId: ctx.entry._id, minutes: 45, date: '2026-10-26' });
    await ctx.tick();
    expect(ctx.Activity.docs.map((d) => d.type).sort()).toEqual(['library.sessionLogged', 'library.statusChanged']);
    const feed = await ctx.activityService.feed(ctx.demo.id);
    expect(feed.items[0]).toMatchObject({ actor: { username: 'alex' }, game: { title: 'Hades', slug: 'hades' } });
    expect(feed.friendCount).toBe(1);
  });

  it('real services drive it: status change, first review (not edits) and a public collection', async () => {
    const ctx = await world();
    await ctx.libraryService.changeStatus(ctx.alex.id, ctx.entry._id, 'playing');
    await ctx.reviewService.upsert(ctx.alex.id, ctx.game._id, { rating: 5, body: 'great' }, ctx.LibraryEntry);
    await ctx.reviewService.upsert(ctx.alex.id, ctx.game._id, { rating: 4, body: 'edited' }, ctx.LibraryEntry);
    await ctx.collectionService.create(ctx.alex.id, { name: 'Faves', visibility: 'public', type: 'manual', rules: [] });
    await ctx.collectionService.create(ctx.alex.id, { name: 'Secret', visibility: 'private', type: 'manual', rules: [] });
    await ctx.tick();
    const types = ctx.Activity.docs.map((d) => d.type).sort();
    expect(types).toEqual(['collection.created', 'library.statusChanged', 'review.created']);
    expect(ctx.Activity.docs.find((d) => d.type === 'review.created')).toMatchObject({ level: 'public', data: { rating: 5 } });
  });

  it('shows friends’ activity only: not your own, not strangers’', async () => {
    const ctx = await world();
    const zGame = await ctx.mkGame('Doom');
    const zEntry = await ctx.LibraryEntry.create({ userId: ctx.zed.id, gameId: zGame._id, status: 'playing' });
    const dEntry = await ctx.LibraryEntry.create({ userId: ctx.demo.id, gameId: zGame._id, status: 'playing' });
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.alex.id, entryId: ctx.entry._id, gameId: ctx.game._id, from: null, to: 'backlog' });
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.zed.id, entryId: zEntry._id, gameId: zGame._id, from: null, to: 'playing' });
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.demo.id, entryId: dEntry._id, gameId: zGame._id, from: null, to: 'playing' });
    await ctx.tick();
    expect(texts(await ctx.activityService.feed(ctx.demo.id))).toEqual(['alex:library.statusChanged']);
    expect(await ctx.activityService.feed(ctx.zed.id)).toMatchObject({ items: [], friendCount: 0 });
  });

  it('drops activity for entries hidden from friends — including ones hidden afterwards', async () => {
    const ctx = await world();
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.alex.id, entryId: ctx.entry._id, gameId: ctx.game._id, from: null, to: 'playing' });
    await ctx.tick();
    expect((await ctx.activityService.feed(ctx.demo.id)).items).toHaveLength(1);
    await ctx.libraryService.setHiddenFromFriends(ctx.alex.id, ctx.entry._id, true);
    expect((await ctx.activityService.feed(ctx.demo.id)).items).toHaveLength(0);
    // the owner still sees it on their own profile activity
    expect((await ctx.activityService.forUser(ctx.alex.id, ctx.alex.id)).items).toHaveLength(1);
  });

  it('drops library activity when the game leaves the library', async () => {
    const ctx = await world();
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.alex.id, entryId: ctx.entry._id, gameId: ctx.game._id, from: null, to: 'playing' });
    await ctx.tick();
    await ctx.libraryService.remove(ctx.alex.id, ctx.entry._id);
    expect((await ctx.activityService.feed(ctx.demo.id)).items).toHaveLength(0);
  });

  it('follows a collection’s current visibility', async () => {
    const ctx = await world();
    const c = await ctx.collectionService.create(ctx.alex.id, { name: 'Faves', visibility: 'friends', type: 'manual', rules: [] });
    await ctx.tick();
    expect(texts(await ctx.activityService.feed(ctx.demo.id))).toEqual(['alex:collection.created']);
    await ctx.collectionService.update(ctx.alex.id, c.id, { visibility: 'private' });
    expect((await ctx.activityService.feed(ctx.demo.id)).items).toHaveLength(0);
    await ctx.collectionService.remove(ctx.alex.id, c.id);
    expect((await ctx.activityService.feed(ctx.demo.id)).items).toHaveLength(0);
  });

  it('blocking or unfriending removes someone from your feed', async () => {
    const ctx = await world();
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.alex.id, entryId: ctx.entry._id, gameId: ctx.game._id, from: null, to: 'playing' });
    await ctx.tick();
    await ctx.friendService.unfriend(ctx.demo.id, ctx.alex.id);
    expect((await ctx.activityService.feed(ctx.demo.id)).items).toHaveLength(0);
  });

  it('pages newest first with a cursor, and keeps going past hidden items to fill a page', async () => {
    const ctx = await world();
    const hiddenEntry = await ctx.LibraryEntry.create({ userId: ctx.alex.id, gameId: (await ctx.mkGame('Secret'))._id, status: 'playing', hiddenFromFriends: true });
    for (let i = 0; i < 3; i += 1) {
      ctx.eventBus.emit('library.sessionLogged', { userId: ctx.alex.id, entryId: ctx.entry._id, minutes: 10 + i, date: '2026-10-26' });
      await ctx.tick();
    }
    for (let i = 0; i < 6; i += 1) {
      ctx.eventBus.emit('library.sessionLogged', { userId: ctx.alex.id, entryId: hiddenEntry._id, minutes: 5, date: '2026-10-26' });
      await ctx.tick();
    }
    const p1 = await ctx.activityService.feed(ctx.demo.id, { limit: 2 });
    expect(p1.items.map((i) => i.data.minutes)).toEqual([12, 11]);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await ctx.activityService.feed(ctx.demo.id, { limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((i) => i.data.minutes)).toEqual([10]);
    expect(p2.nextCursor).toBeNull();
  });

  it('profile activity depends on who is looking: self, friend, stranger', async () => {
    const ctx = await world();
    ctx.eventBus.emit('library.statusChanged', { userId: ctx.alex.id, entryId: ctx.entry._id, gameId: ctx.game._id, from: null, to: 'playing' }); // friends-level
    await ctx.reviewService.upsert(ctx.alex.id, ctx.game._id, { rating: 5 }, ctx.LibraryEntry); // public-level
    await ctx.collectionService.create(ctx.alex.id, { name: 'F', visibility: 'friends', type: 'manual', rules: [] });
    await ctx.collectionService.create(ctx.alex.id, { name: 'P', visibility: 'public', type: 'manual', rules: [] });
    await ctx.tick();
    const kinds = async (viewer) => (await ctx.activityService.forUser(viewer, ctx.alex.id)).items.map((i) => i.type + (i.data.name ? `:${i.data.name}` : '')).sort();
    expect(await kinds(ctx.alex.id)).toEqual(['collection.created:F', 'collection.created:P', 'library.statusChanged', 'review.created']);
    expect(await kinds(ctx.demo.id)).toEqual(['collection.created:F', 'collection.created:P', 'library.statusChanged', 'review.created']);
    expect(await kinds(ctx.zed.id)).toEqual(['collection.created:P', 'review.created']);
  });
});

describe('profileService', () => {
  async function world() {
    const ctx = setup();
    const [demo, alex, zed] = [await ctx.mkUser('demo'), await ctx.mkUser('alex'), await ctx.mkUser('zed')];
    await ctx.befriend(demo, alex);
    const [g1, g2, g3] = [await ctx.mkGame('One'), await ctx.mkGame('Two'), await ctx.mkGame('Three')];
    await ctx.LibraryEntry.create({ userId: alex.id, gameId: g1._id, status: 'completed', loggedMinutes: 120 });
    await ctx.LibraryEntry.create({ userId: alex.id, gameId: g2._id, status: 'playing', loggedMinutes: 60 });
    await ctx.LibraryEntry.create({ userId: alex.id, gameId: g3._id, status: 'backlog', hiddenFromFriends: true, loggedMinutes: 600 });
    return { ...ctx, demo, alex, zed };
  }
  const setPrivacy = (ctx, privacy) => ctx.User.findOneAndUpdate({ _id: ctx.alex.id }, { $set: { privacy } }, { returnDocument: 'after' });

  it('shows a public profile with stats that leave out hidden games for others', async () => {
    const ctx = await world();
    const asOther = await ctx.profileService.getProfile(ctx.zed.id, 'ALEX');
    expect(asOther).toMatchObject({ relation: 'none', restricted: false, user: { username: 'alex' }, stats: { games: 2, completed: 1, playing: 1, hours: 3 } });
    expect(asOther.user.privacy).toBeUndefined(); // only the owner sees their own setting
    const asSelf = await ctx.profileService.getProfile(ctx.alex.id, 'alex');
    expect(asSelf).toMatchObject({ relation: 'self', stats: { games: 3, hours: 13 }, user: { privacy: 'public' } });
  });

  it('reports the relation to the viewer', async () => {
    const ctx = await world();
    expect((await ctx.profileService.getProfile(ctx.demo.id, 'alex')).relation).toBe('friend');
    await ctx.friendService.sendRequest(ctx.zed.id, { username: 'alex' });
    expect((await ctx.profileService.getProfile(ctx.zed.id, 'alex')).relation).toBe('pending_out');
    expect((await ctx.profileService.getProfile(ctx.alex.id, 'zed')).relation).toBe('pending_in');
  });

  it('friends-only profile: restricted for strangers, open to friends', async () => {
    const ctx = await world();
    await setPrivacy(ctx, 'friends');
    const stranger = await ctx.profileService.getProfile(ctx.zed.id, 'alex');
    expect(stranger).toMatchObject({ restricted: true, stats: null });
    await expect(ctx.profileService.getActivity(ctx.zed.id, 'alex', {})).rejects.toMatchObject({ status: 403 });
    await expect(ctx.profileService.getCollections(ctx.zed.id, 'alex')).rejects.toMatchObject({ status: 403 });
    expect((await ctx.profileService.getProfile(ctx.demo.id, 'alex')).restricted).toBe(false);
  });

  it('a restricted profile shows no favourite games and so no game art, to anyone but those it is shared with', async () => {
    const ctx = await world();
    const game = await ctx.mkGame('Hades');
    await ctx.Game.updateOne({ _id: game._id }, { $set: { backdrop: 'hades-backdrop.jpg' } });
    await ctx.profileService.updateProfile(ctx.alex.id, { favouriteGames: [game._id] });
    await setPrivacy(ctx, 'friends');
    const stranger = await ctx.profileService.getProfile(ctx.zed.id, 'alex');
    expect(stranger.restricted).toBe(true);
    expect(stranger.user.favouriteGames ?? []).toEqual([]);
    expect(JSON.stringify(stranger)).not.toContain('hades-backdrop');
    const friend = await ctx.profileService.getProfile(ctx.demo.id, 'alex');
    expect(friend.user.favouriteGames[0]).toMatchObject({ title: 'Hades', backdrop: 'hades-backdrop.jpg' });
  });

  it('private profile: only the owner', async () => {
    const ctx = await world();
    await setPrivacy(ctx, 'private');
    expect((await ctx.profileService.getProfile(ctx.demo.id, 'alex')).restricted).toBe(true);
    expect((await ctx.profileService.getProfile(ctx.alex.id, 'alex')).restricted).toBe(false);
  });

  it('a block makes the profile not exist for the blocked player (and the blocker)', async () => {
    const ctx = await world();
    await ctx.friendService.block(ctx.alex.id, ctx.zed.id);
    await expect(ctx.profileService.getProfile(ctx.zed.id, 'alex')).rejects.toMatchObject({ status: 404 });
    await expect(ctx.profileService.getProfile(ctx.alex.id, 'zed')).rejects.toMatchObject({ status: 404 });
    await expect(ctx.profileService.getProfile(ctx.zed.id, 'ghost')).rejects.toMatchObject({ status: 404 });
  });

  it('lists only the collections the viewer may see and saves a privacy setting', async () => {
    const ctx = await world();
    for (const visibility of ['public', 'friends', 'private']) await ctx.collectionService.create(ctx.alex.id, { name: visibility, visibility, type: 'manual', rules: [] });
    const names = async (viewer) => (await ctx.profileService.getCollections(viewer, 'alex')).items.map((c) => c.name).sort();
    expect(await names(ctx.zed.id)).toEqual(['public']);
    expect(await names(ctx.demo.id)).toEqual(['friends', 'public']);
    expect(await names(ctx.alex.id)).toEqual(['friends', 'private', 'public']);
    expect(await ctx.profileService.setPrivacy(ctx.alex.id, 'friends')).toEqual({ privacy: 'friends' });
  });

  it('updates profile bio, avatar, and favourite games with populated details', async () => {
    const ctx = await world();
    const [g1, g2] = [await ctx.mkGame('Hades'), await ctx.mkGame('Celeste')];
    await ctx.Game.updateOne({ _id: g1._id }, { $set: { backdrop: 'hades-backdrop.jpg' } });
    const updated = await ctx.profileService.updateProfile(ctx.demo.id, {
      bio: 'Lifelong gamer & indie enthusiast',
      avatar: 'https://images.igdb.com/avatar.jpg',
      favouriteGames: [g1._id, g2._id],
    });
    expect(updated.user).toMatchObject({
      bio: 'Lifelong gamer & indie enthusiast',
      avatar: 'https://images.igdb.com/avatar.jpg',
      favouriteGames: expect.arrayContaining([
        expect.objectContaining({ title: 'Hades', slug: 'hades', backdrop: 'hades-backdrop.jpg' }), // art for the profile banner
        expect.objectContaining({ title: 'Celeste', slug: 'celeste', backdrop: null }),
      ]),
    });

    const viewed = await ctx.profileService.getProfile(ctx.alex.id, 'demo');
    expect(viewed.user.bio).toBe('Lifelong gamer & indie enthusiast');
    expect(viewed.user.favouriteGames).toHaveLength(2);
  });
});

describe('social routes', () => {
  function setupApp() {
    const ctx = setup({ subscribe: false });
    const app = createApp({
      config: ctx.config,
      logger,
      authService: ctx.authService,
      eventBus: ctx.eventBus,
      friendService: ctx.friendService,
      activityService: ctx.activityService,
      profileService: ctx.profileService,
      collectionService: ctx.collectionService,
      libraryService: ctx.libraryService,
      reviewService: ctx.reviewService,
    });
    return { app, ...ctx };
  }
  const login = async (app, name) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' });
    return { agent, id: res.body.user.id };
  };

  it('requires authentication on every social route', async () => {
    const { app } = setupApp();
    for (const [method, url] of [
      ['get', '/api/v1/friends'],
      ['get', '/api/v1/friends/requests'],
      ['post', '/api/v1/friends/requests'],
      ['get', '/api/v1/blocks'],
      ['get', '/api/v1/users/search?q=al'],
      ['get', '/api/v1/users/alex'],
      ['get', '/api/v1/feed'],
    ]) {
      expect((await request(app)[method](url)).status).toBe(401);
    }
  });

  it('validates input', async () => {
    const { app } = setupApp();
    const { agent } = await login(app, 'demo');
    expect((await agent.post('/api/v1/friends/requests').send({})).status).toBe(400);
    expect((await agent.post('/api/v1/friends/requests').send({ username: 'no spaces!' })).status).toBe(400);
    expect((await agent.get('/api/v1/users/search?q=a')).status).toBe(400);
    expect((await agent.post('/api/v1/friends/requests/not-an-id/accept')).status).toBe(400);
    expect((await agent.post('/api/v1/blocks/not-an-id')).status).toBe(400);
    expect((await agent.patch('/api/v1/users/me/privacy').send({ privacy: 'everyone' })).status).toBe(400);
    expect((await agent.get('/api/v1/feed?limit=500')).status).toBe(400);
  });

  it('runs search → request → accept → feed → profile → unfriend', async () => {
    const ctx = setupApp();
    const demo = await login(ctx.app, 'demo');
    const alex = await login(ctx.app, 'alex');
    const game = await ctx.mkGame('Hades');
    const entry = await ctx.LibraryEntry.create({ userId: alex.id, gameId: game._id, status: 'backlog' });

    const found = await demo.agent.get('/api/v1/users/search?q=al');
    expect(found.body.items).toEqual([{ id: alex.id, username: 'alex', relation: 'none' }]);

    const sent = await demo.agent.post('/api/v1/friends/requests').send({ username: 'alex' });
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe('pending');
    expect((await demo.agent.post('/api/v1/friends/requests').send({ username: 'alex' })).status).toBe(409);

    const incoming = (await alex.agent.get('/api/v1/friends/requests')).body.incoming;
    expect(incoming).toHaveLength(1);
    expect((await alex.agent.post(`/api/v1/friends/requests/${incoming[0].id}/accept`)).status).toBe(204);
    expect((await demo.agent.get('/api/v1/friends')).body.items.map((f) => f.username)).toEqual(['alex']);

    expect((await alex.agent.patch(`/api/v1/library/${entry._id}/status`).send({ status: 'playing' })).status).toBe(200);
    await ctx.tick();
    const feed = (await demo.agent.get('/api/v1/feed')).body;
    expect(feed.items[0]).toMatchObject({ type: 'library.statusChanged', actor: { username: 'alex' }, data: { to: 'playing' } });

    const profile = (await demo.agent.get('/api/v1/users/alex')).body;
    expect(profile).toMatchObject({ relation: 'friend', restricted: false, stats: { games: 1, playing: 1 } });
    expect((await demo.agent.get('/api/v1/users/alex/activity')).body.items).toHaveLength(1);
    expect((await demo.agent.get('/api/v1/users/alex/collections')).body.items).toEqual([]);

    expect((await demo.agent.delete(`/api/v1/friends/${alex.id}`)).status).toBe(204);
    expect((await demo.agent.get('/api/v1/feed')).body.items).toEqual([]);
  });

  it('never trusts an identity from the body', async () => {
    const ctx = setupApp();
    const demo = await login(ctx.app, 'demo');
    const alex = await login(ctx.app, 'alex');
    const res = await demo.agent.post('/api/v1/friends/requests').send({ username: 'alex', requestedBy: alex.id, userId: alex.id });
    expect(res.status).toBe(201);
    expect(ctx.Friendship.docs[0].requestedBy).toBe(demo.id);
  });

  it('blocks override everything: no profile, no request, gone from search and lists', async () => {
    const ctx = setupApp();
    const demo = await login(ctx.app, 'demo');
    const alex = await login(ctx.app, 'alex');
    expect((await alex.agent.post(`/api/v1/blocks/${demo.id}`)).status).toBe(204);
    expect((await demo.agent.get('/api/v1/users/alex')).status).toBe(404);
    expect((await demo.agent.post('/api/v1/friends/requests').send({ username: 'alex' })).status).toBe(404);
    expect((await demo.agent.get('/api/v1/users/search?q=al')).body.items).toEqual([]);
    expect((await alex.agent.get('/api/v1/blocks')).body.items.map((u) => u.username)).toEqual(['demo']);
    expect((await alex.agent.delete(`/api/v1/blocks/${demo.id}`)).status).toBe(204);
    expect((await demo.agent.get('/api/v1/users/alex')).status).toBe(200);
  });

  it('saves the privacy setting and enforces it on the profile endpoints', async () => {
    const ctx = setupApp();
    const demo = await login(ctx.app, 'demo');
    const alex = await login(ctx.app, 'alex');
    expect((await alex.agent.patch('/api/v1/users/me/privacy').send({ privacy: 'private' })).body).toEqual({ privacy: 'private' });
    const profile = (await demo.agent.get('/api/v1/users/alex')).body;
    expect(profile).toMatchObject({ restricted: true, stats: null });
    expect((await demo.agent.get('/api/v1/users/alex/activity')).status).toBe(403);
    expect((await demo.agent.get('/api/v1/users/alex/collections')).status).toBe(403);
    expect((await alex.agent.get('/api/v1/users/alex')).body.user.privacy).toBe('private');
  });
  it('PATCH /api/v1/users/me updates profile and rejects >4 favourite games', async () => {
    const ctx = setupApp();
    const demo = await login(ctx.app, 'demo');
    const [g1, g2] = [await ctx.mkGame('Hades'), await ctx.mkGame('Celeste')];

    const patchRes = await demo.agent.patch('/api/v1/users/me').send({
      bio: 'Exploring vast worlds',
      favouriteGames: [g1._id, g2._id],
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user.bio).toBe('Exploring vast worlds');
    expect(patchRes.body.user.favouriteGames).toHaveLength(2);

    // Rejects more than 4 games
    const tooMany = [g1._id, g2._id, '000000000000000000000003', '000000000000000000000004', '000000000000000000000005'];
    const badRes = await demo.agent.patch('/api/v1/users/me').send({ favouriteGames: tooMany });
    expect(badRes.status).toBe(400);
  });
});

describe('updateProfileSchema avatar', () => {
  it('accepts https URLs, empty and null; rejects other schemes', () => {
    const parse = (avatar) => updateProfileSchema.safeParse({ avatar }).success;
    expect(parse('https://images.example.com/a.png')).toBe(true);
    expect(parse('')).toBe(true);
    expect(parse(null)).toBe(true);
    expect(parse('http://images.example.com/a.png')).toBe(false);
    expect(parse('javascript:alert(1)')).toBe(false);
    expect(parse('not a url')).toBe(false);
  });
});
