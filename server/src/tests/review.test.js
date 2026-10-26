import { describe, it, expect, beforeEach } from '@jest/globals';
import { createFakeCollection } from './helpers.js';
import { createReviewService } from '../services/reviewService.js';

function makeServices() {
  const Review = createFakeCollection({ unique: [['userId', 'gameId']] });
  const Game = createFakeCollection({});
  const User = createFakeCollection({});
  const service = createReviewService({ Review, Game, User, logger: null });
  return { Review, Game, User, service };
}

const uid = 'user-aaa';
const gid = 'game-bbb';

describe('reviewService', () => {
  let ctx;
  beforeEach(() => {
    ctx = makeServices();
  });

  async function addGame() {
    return ctx.Game.create({ _id: gid, title: 'Elden Ring', ratingAvg: 0, ratingCount: 0 });
  }

  async function addUser() {
    return ctx.User.create({ _id: uid, username: 'tanush' });
  }

  it('creates a review and refreshes game rating', async () => {
    await addGame();
    await addUser();
    const review = await ctx.service.upsert(uid, gid, { rating: 5, body: 'Masterpiece' }, null);
    expect(review.rating).toBe(5);
    expect(review.body).toBe('Masterpiece');
    expect(review.username).toBe('tanush');

    const game = await ctx.Game.findOne({ _id: gid });
    expect(game.ratingAvg).toBe(5);
    expect(game.ratingCount).toBe(1);
  });

  it('updates an existing review (upsert)', async () => {
    await addGame();
    await addUser();
    await ctx.service.upsert(uid, gid, { rating: 3 }, null);
    const updated = await ctx.service.upsert(uid, gid, { rating: 4, body: 'Even better' }, null);
    expect(updated.rating).toBe(4);
    expect(updated.body).toBe('Even better');

    // should only be one review
    const count = (await ctx.Review.find({ userId: uid })).length;
    expect(count).toBe(1);

    const game = await ctx.Game.findOne({ _id: gid });
    expect(game.ratingAvg).toBe(4);
    expect(game.ratingCount).toBe(1);
  });

  it('averages ratings from multiple users', async () => {
    await addGame();
    await addUser();
    await ctx.User.create({ _id: 'user-bbb', username: 'other' });
    await ctx.service.upsert(uid, gid, { rating: 5 }, null);
    await ctx.service.upsert('user-bbb', gid, { rating: 3 }, null);

    const game = await ctx.Game.findOne({ _id: gid });
    expect(game.ratingAvg).toBe(4);
    expect(game.ratingCount).toBe(2);
  });

  it('deletes a review and refreshes rating', async () => {
    await addGame();
    await addUser();
    await ctx.service.upsert(uid, gid, { rating: 4 }, null);
    await ctx.service.deleteReview(uid, gid);

    const game = await ctx.Game.findOne({ _id: gid });
    expect(game.ratingAvg).toBe(0);
    expect(game.ratingCount).toBe(0);
  });

  it('getMyReview returns null when no review exists', async () => {
    await addGame();
    const review = await ctx.service.getMyReview(uid, gid);
    expect(review).toBeNull();
  });

  it('listForGame returns paginated reviews', async () => {
    await addGame();
    await addUser();
    await ctx.User.create({ _id: 'user-ccc', username: 'ccc' });
    await ctx.service.upsert(uid, gid, { rating: 5 }, null);
    await ctx.service.upsert('user-ccc', gid, { rating: 2 }, null);

    const { items } = await ctx.service.listForGame(gid);
    expect(items.length).toBe(2);
  });
});
