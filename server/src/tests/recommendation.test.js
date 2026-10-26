import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { createApp } from '../app.js';
import { createAuthService } from '../services/authService.js';
import { createFriendService } from '../services/friendService.js';
import { createRecommendationService } from '../services/recommendationService.js';
import { createLibraryService } from '../services/libraryService.js';
import { createEventBus } from '../events/eventBus.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { createFakeCollection, createFakeModels, logger, testConfig } from './helpers.js';

function setup() {
  const models = createFakeModels();
  const config = testConfig();
  const authService = createAuthService({ ...models, config, bcryptRounds: 4, reuseGraceMs: 0 });
  const { User } = models;
  const Friendship = createFakeCollection({ unique: [['userA', 'userB']] });
  const Block = createFakeCollection({ unique: [['blockerId', 'blockedId']] });
  const Game = createFakeCollection();
  const Review = createFakeCollection({ unique: [['userId', 'gameId']] });
  const LibraryEntry = createFakeCollection({ unique: [['userId', 'gameId']] });
  const StatusHistory = createFakeCollection();
  const Recommendation = createFakeCollection({ unique: [['fromId', 'toId', 'gameId']] });
  const eventBus = createEventBus({ logger: { error: jest.fn() } });

  const friendService = createFriendService({ Friendship, Block, User, eventBus });
  const libraryService = createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus });
  const recommendationService = createRecommendationService({
    Recommendation,
    Game,
    User,
    Review,
    LibraryEntry,
    libraryService,
    social: friendService,
    eventBus,
  });

  const mkUser = async (name) =>
    (await authService.register({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' })).user;

  const befriend = async (a, b) => {
    const { friendshipId } = await friendService.sendRequest(a.id, { username: b.username });
    await friendService.accept(b.id, friendshipId);
  };

  return {
    recommendationService,
    friendService,
    libraryService,
    authService,
    config,
    Game,
    Review,
    LibraryEntry,
    Recommendation,
    eventBus,
    mkUser,
    befriend,
  };
}

describe('recommendationService', () => {
  it('sends a recommendation to a friend with optional review', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const bob = await s.mkUser('bob');
    await s.befriend(alice, bob);

    const game = await s.Game.create({ title: 'Hades', slug: 'hades', cover: 'hades.png', genres: ['Roguelike'] });
    await s.Review.create({ userId: alice.id, gameId: game._id, rating: 5, body: 'A masterpiece' });

    const rec = await s.recommendationService.send(alice.id, {
      toId: bob.id,
      gameId: game._id,
      message: 'You have to play this!',
    });

    expect(rec.from.username).toBe('alice');
    expect(rec.to.username).toBe('bob');
    expect(rec.game.title).toBe('Hades');
    expect(rec.message).toBe('You have to play this!');
    expect(rec.review).toEqual({ rating: 5, body: 'A masterpiece' });
    expect(rec.status).toBe('pending');
  });

  it('rejects recommending to self', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const game = await s.Game.create({ title: 'Celeste', slug: 'celeste' });

    await expect(
      s.recommendationService.send(alice.id, { toId: alice.id, gameId: game._id }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects recommending to a non-friend', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const stranger = await s.mkUser('stranger');
    const game = await s.Game.create({ title: 'Celeste', slug: 'celeste' });

    await expect(
      s.recommendationService.send(alice.id, { toId: stranger.id, gameId: game._id }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects recommending to a blocked player', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const bob = await s.mkUser('bob');
    await s.befriend(alice, bob);
    await s.friendService.block(alice.id, bob.id);

    const game = await s.Game.create({ title: 'Celeste', slug: 'celeste' });

    await expect(
      s.recommendationService.send(alice.id, { toId: bob.id, gameId: game._id }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects duplicate pending recommendations for the same game', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const bob = await s.mkUser('bob');
    await s.befriend(alice, bob);
    const game = await s.Game.create({ title: 'Hades', slug: 'hades' });

    await s.recommendationService.send(alice.id, { toId: bob.id, gameId: game._id, message: 'First' });

    await expect(
      s.recommendationService.send(alice.id, { toId: bob.id, gameId: game._id, message: 'Second' }),
    ).rejects.toThrow(ConflictError);
  });

  it('lists recommendations in the recipient inbox with recipient status', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const bob = await s.mkUser('bob');
    await s.befriend(alice, bob);
    const game = await s.Game.create({ title: 'Hades', slug: 'hades' });

    // Bob has Hades in his library as backlog
    await s.LibraryEntry.create({ userId: bob.id, gameId: game._id, status: 'backlog' });

    await s.recommendationService.send(alice.id, { toId: bob.id, gameId: game._id, message: 'Play it!' });

    const inbox = await s.recommendationService.listInbox(bob.id, { status: 'pending' });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].from.username).toBe('alice');
    expect(inbox.items[0].recipientStatus).toBe('backlog');
  });

  it('accepting a recommendation adds the game to the recipient library', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const bob = await s.mkUser('bob');
    await s.befriend(alice, bob);
    const game = await s.Game.create({ title: 'Hades', slug: 'hades' });

    const rec = await s.recommendationService.send(alice.id, { toId: bob.id, gameId: game._id });

    const updated = await s.recommendationService.respond(bob.id, rec.id, {
      status: 'accepted',
      libraryStatus: 'backlog',
    });

    expect(updated.status).toBe('accepted');

    // Verify Bob's library now has Hades
    const entry = await s.LibraryEntry.findOne({ userId: bob.id, gameId: game._id });
    expect(entry).toBeTruthy();
    expect(entry.status).toBe('backlog');
  });

  it('rejects a non-recipient responding to a recommendation', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const bob = await s.mkUser('bob');
    const eve = await s.mkUser('eve');
    await s.befriend(alice, bob);
    const game = await s.Game.create({ title: 'Hades', slug: 'hades' });

    const rec = await s.recommendationService.send(alice.id, { toId: bob.id, gameId: game._id });

    await expect(
      s.recommendationService.respond(eve.id, rec.id, { status: 'accepted' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('tracks pick score and updates outcome on status and review', async () => {
    const s = setup();
    const alice = await s.mkUser('alice');
    const bob = await s.mkUser('bob');
    await s.befriend(alice, bob);
    const game = await s.Game.create({ title: 'Hades', slug: 'hades' });

    const rec = await s.recommendationService.send(alice.id, { toId: bob.id, gameId: game._id });
    await s.recommendationService.respond(bob.id, rec.id, { status: 'accepted' });

    // Bob completes the game
    await s.recommendationService.updateOutcomeOnStatusChange({
      userId: bob.id,
      gameId: game._id,
      to: 'completed',
    });

    // Bob reviews the game with 5 stars
    await s.recommendationService.updateOutcomeOnReview({
      userId: bob.id,
      gameId: game._id,
      rating: 5,
    });

    // Check Alice's pick score
    const score = await s.recommendationService.getPickScore(alice.id);
    expect(score.totalSent).toBe(1);
    expect(score.acceptedCount).toBe(1);
    expect(score.completedCount).toBe(1);
    expect(score.averageRating).toBe(5);
  });
});

describe('recommendations API routes', () => {
  function setupApp() {
    const s = setup();
    const app = createApp({
      config: s.config,
      logger,
      authService: s.authService,
      friendService: s.friendService,
      libraryService: s.libraryService,
      recommendationService: s.recommendationService,
      eventBus: s.eventBus,
    });
    return { app, ...s };
  }

  const login = async (app, name) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({
      username: name,
      email: `${name}@example.com`,
      password: 'correct-horse-9',
    });
    return { agent, id: res.body.user.id };
  };

  it('requires authentication for recommendation endpoints', async () => {
    const { app } = setupApp();
    for (const [method, url] of [
      ['get', '/api/v1/recommendations/inbox'],
      ['get', '/api/v1/recommendations/sent'],
      ['post', '/api/v1/recommendations'],
      ['patch', `/api/v1/recommendations/${'1'.repeat(24)}/respond`],
      ['delete', `/api/v1/recommendations/${'1'.repeat(24)}`],
    ]) {
      expect((await request(app)[method](url)).status).toBe(401);
    }
  });

  it('sends, lists, responds, and checks pick score via API', async () => {
    const ctx = setupApp();
    const alice = await login(ctx.app, 'alice');
    const bob = await login(ctx.app, 'bob');
    await ctx.befriend({ id: alice.id, username: 'alice' }, { id: bob.id, username: 'bob' });

    const game = await ctx.Game.create({ title: 'Hades', slug: 'hades', genres: ['Roguelike'] });

    // Alice sends recommendation
    const sendRes = await alice.agent.post('/api/v1/recommendations').send({
      toId: bob.id,
      gameId: game._id,
      message: 'Check this out!',
    });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.recommendation.message).toBe('Check this out!');
    const recId = sendRes.body.recommendation.id;

    // Bob checks inbox
    const inboxRes = await bob.agent.get('/api/v1/recommendations/inbox');
    expect(inboxRes.status).toBe(200);
    expect(inboxRes.body.items).toHaveLength(1);
    expect(inboxRes.body.items[0].from.username).toBe('alice');

    // Bob accepts and adds to backlog
    const respondRes = await bob.agent.patch(`/api/v1/recommendations/${recId}/respond`).send({
      status: 'accepted',
      libraryStatus: 'backlog',
    });
    expect(respondRes.status).toBe(200);
    expect(respondRes.body.recommendation.status).toBe('accepted');

    // Alice checks pick score
    const scoreRes = await alice.agent.get('/api/v1/recommendations/score');
    expect(scoreRes.status).toBe(200);
    expect(scoreRes.body.totalSent).toBe(1);
    expect(scoreRes.body.acceptedCount).toBe(1);
  });
});
