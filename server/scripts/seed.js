/**
 * Demo seed — creates a demo account plus eight games with library entries,
 * status history, play logs and reviews so graders can log in and see the app.
 *
 * Usage (from repo root):  npm run seed
 *   or (from server/):     npm run seed
 *
 * Idempotent: re-running skips documents that already exist.
 * Reads MONGODB_URI from server/.env via Node's built-in --env-file.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from '../src/models/User.js';
import { Game } from '../src/models/Game.js';
import { LibraryEntry } from '../src/models/LibraryEntry.js';
import { StatusHistory } from '../src/models/StatusHistory.js';
import { PlayLog } from '../src/models/PlayLog.js';
import { Review } from '../src/models/Review.js';
import { Collection } from '../src/models/Collection.js';
import { CollectionItem } from '../src/models/CollectionItem.js';
import { Friendship } from '../src/models/Friendship.js';
import { Activity } from '../src/models/Activity.js';
import { createEventBus } from '../src/events/eventBus.js';
import { registerSubscribers } from '../src/events/subscribers.js';
import { createLibraryService } from '../src/services/libraryService.js';
import { createReviewService } from '../src/services/reviewService.js';
import { createCollectionService } from '../src/services/collectionService.js';
import { createActivityService } from '../src/services/activityService.js';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('MONGODB_URI is not set. Add it to server/.env first.');
  process.exit(1);
}

const DEMO_EMAIL = 'demo@gamequest.dev';
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_USERNAME = 'demo';
const ALEX_EMAIL = 'alex@gamequest.dev';

// externalIds.igdb lets live IGDB results merge into these docs instead of
// colliding on the unique slug.
const GAMES = [
  {
    title: 'Elden Ring', slug: 'elden-ring', externalIds: { igdb: 119133 },
    summary: 'A vast open-world action RPG from FromSoftware. Rise, Tarnished, and become an Elden Lord.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg',
    releaseDate: new Date('2022-02-25'), genres: ['Role-playing (RPG)', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 55 },
  },
  {
    title: 'Hollow Knight', slug: 'hollow-knight', externalIds: { igdb: 14593 },
    summary: 'A challenging 2D action adventure through a vast ruined kingdom of insects and heroes.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rgi.jpg',
    releaseDate: new Date('2017-02-24'), genres: ['Platform', 'Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 4'], timeToBeat: { main: 27 },
  },
  {
    title: 'Celeste', slug: 'celeste', externalIds: { igdb: 26226 },
    summary: 'Help Madeline survive her inner demons on her journey to the top of Celeste Mountain.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3byy.jpg',
    releaseDate: new Date('2018-01-25'), genres: ['Platform', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], timeToBeat: { main: 8 },
  },
  {
    // IGDB's slug for Supergiant's Hades is "hades--1"; plain "hades" is an unrelated 2015 game.
    title: 'Hades', slug: 'hades--1', externalIds: { igdb: 113112 },
    summary: 'Defy the god of the dead as you hack and slash your way out of the Underworld.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co39vc.jpg',
    releaseDate: new Date('2020-09-17'), genres: ['Role-playing (RPG)', 'Hack and slash/Beat \'em up', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], timeToBeat: { main: 22 },
  },
  {
    title: 'Stardew Valley', slug: 'stardew-valley', externalIds: { igdb: 17000 },
    summary: "You've inherited your grandfather's old farm plot. With a few coins and some old tools, you set out to begin your new life.",
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/xrpmydnu9rpxvxfjkiu7.jpg',
    releaseDate: new Date('2016-02-26'), genres: ['Simulator', 'Role-playing (RPG)', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], timeToBeat: { main: 52 },
  },
  {
    title: 'The Witcher 3: Wild Hunt', slug: 'the-witcher-3-wild-hunt', externalIds: { igdb: 1942 },
    summary: 'You are Geralt of Rivia, a monster hunter for hire, searching for the Child of Prophecy.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
    releaseDate: new Date('2015-05-19'), genres: ['Role-playing (RPG)', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 4', 'Xbox One'], timeToBeat: { main: 51 },
  },
  {
    title: 'A Short Hike', slug: 'a-short-hike', externalIds: { igdb: 116753 },
    summary: 'A Short Hike is an exploration adventure game set in Hawk Peak Provincial Park. Climb, glide and fly to the summit.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co6e83.jpg',
    releaseDate: new Date('2019-07-30'), genres: ['Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], timeToBeat: { main: 2.5 },
  },
  {
    title: 'Undertale', slug: 'undertale', externalIds: { igdb: 12517 },
    summary: 'A small child falls into the Underground, where monsters have long been banished by humans.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cob1t2.jpg',
    releaseDate: new Date('2015-09-15'), genres: ['Puzzle', 'Role-playing (RPG)', 'Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], timeToBeat: { main: 8.3 },
  },
];

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const utcDay = (n) => { const d = daysAgo(n); d.setUTCHours(0, 0, 0, 0); return d; };

async function ensureGame(data) {
  // The IGDB id is the identity; the slug is only corrected on a previously seeded doc.
  const existing = (await Game.findOne({ 'externalIds.igdb': data.externalIds.igdb })) ?? (await Game.findOne({ slug: data.slug }));
  if (!existing) return Game.create({ ...data, source: 'igdb' });
  if (existing.slug !== data.slug && existing.externalIds?.igdb === data.externalIds.igdb) {
    existing.slug = data.slug;
    await existing.save();
  }
  return existing;
}

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);

  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    user = await User.create({
      username: DEMO_USERNAME, usernameLower: DEMO_USERNAME, email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12), role: 'user',
    });
    console.log(`Created demo user ${DEMO_EMAIL}`);
  } else {
    console.log(`Demo user already exists (${DEMO_EMAIL})`);
  }

  const games = {};
  for (const g of GAMES) games[g.slug] = await ensureGame(g);
  console.log(`${GAMES.length} games ready`);

  async function ensureEntry(slug, status, extra = {}) {
    const gameId = games[slug]._id;
    const existing = await LibraryEntry.findOne({ userId: user._id, gameId });
    if (existing) return existing;
    const entry = await LibraryEntry.create({ userId: user._id, gameId, status, ...extra });
    await StatusHistory.create({ userId: user._id, entryId: entry._id, from: null, to: status }).catch(() => {});
    return entry;
  }

  const elden = await ensureEntry('elden-ring', 'playing', {
    manualProgress: 65, loggedMinutes: 270, lastPlayedAt: daysAgo(1),
    ownerships: [{ platform: 'Steam', playtimeMin: 1800 }],
  });
  const hollow = await ensureEntry('hollow-knight', 'completed', {
    manualProgress: 100, completedAt: daysAgo(45),
    ownerships: [{ platform: 'Steam', playtimeMin: 2550 }],
  });
  await ensureEntry('celeste', 'backlog', { ownerships: [{ platform: 'Nintendo Switch', playtimeMin: 0 }] });
  const hades = await ensureEntry('hades--1', 'playing', {
    manualProgress: 30, loggedMinutes: 105, lastPlayedAt: daysAgo(5),
    ownerships: [{ platform: 'Steam', playtimeMin: 800 }],
  });
  await ensureEntry('stardew-valley', 'wishlist');
  const witcher = await ensureEntry('the-witcher-3-wild-hunt', 'dropped', {
    manualProgress: 20, ownerships: [{ platform: 'GOG', playtimeMin: 720 }],
  });
  await ensureEntry('a-short-hike', 'backlog', { ownerships: [{ platform: 'PC', playtimeMin: 0 }] });
  await ensureEntry('undertale', 'backlog', { ownerships: [{ platform: 'PC', playtimeMin: 0 }] });
  console.log('Library entries ready');

  const sessions = [
    [elden, 'elden-ring', [[1, 90, 'Defeated Morgott!'], [3, 120, ''], [7, 60, 'Exploring the Mountaintops']]],
    [hades, 'hades--1', [[5, 60, 'First Theseus clear'], [6, 45, '']]],
  ];
  for (const [entry, slug, logs] of sessions) {
    for (const [ago, minutes, note] of logs) {
      const date = utcDay(ago);
      if (!(await PlayLog.findOne({ entryId: entry._id, date }))) {
        await PlayLog.create({ entryId: entry._id, userId: user._id, gameId: games[slug]._id, date, minutes, note });
      }
    }
  }
  console.log('Play logs ready');

  const reviews = [
    [hollow, 5, 'An absolute masterpiece. The atmosphere, the boss fights, the lore: all perfect.'],
    [hades, 4, 'Incredibly polished roguelike with amazing writing. The voice acting alone is worth it.'],
    [witcher, 3, "Stunning world and story, but I bounced off the combat. Maybe I'll come back someday."],
  ];
  for (const [entry, rating, body] of reviews) {
    const gameId = entry.gameId;
    if (await Review.findOne({ userId: user._id, gameId })) continue;
    await Review.create({ userId: user._id, gameId, rating, body });
    const [agg] = await Review.aggregate([
      { $match: { gameId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Game.updateOne({ _id: gameId }, { $set: { ratingAvg: Math.round((agg?.avg ?? 0) * 10) / 10, ratingCount: agg?.count ?? 0 } });
  }
  console.log('Reviews ready');

  async function ensureCollection(data) {
    return (await Collection.findOne({ ownerId: user._id, name: data.name })) ?? Collection.create({ ownerId: user._id, ...data });
  }
  const favourites = await ensureCollection({
    name: 'All-time favourites', description: 'The games I keep coming back to.', visibility: 'public', type: 'manual',
  });
  for (const [i, entry] of [hollow, hades, elden].entries()) {
    if (!(await CollectionItem.findOne({ collectionId: favourites._id, entryId: entry._id }))) {
      await CollectionItem.create({ collectionId: favourites._id, entryId: entry._id, position: i + 1 });
    }
  }
  await ensureCollection({
    name: 'Short backlog', description: 'Backlog games I can finish in a weekend.', visibility: 'public', type: 'smart',
    rules: [
      { field: 'status', op: 'eq', value: 'backlog' },
      { field: 'timeToBeat.main', op: 'lte', value: 15 },
    ],
  });
  console.log('Collections ready');

  // ── a second player, friends with demo, whose activity fills the feed ─────────
  // Activity is only ever written by event-bus subscribers, so alex's library is built through the
  // real services and the same subscribers the API uses (never by inserting Activity rows here).
  let alex = await User.findOne({ email: ALEX_EMAIL });
  if (!alex) {
    alex = await User.create({
      username: 'alex', usernameLower: 'alex', email: ALEX_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12), role: 'user',
    });
    console.log(`Created user ${ALEX_EMAIL}`);
  }
  const [userA, userB] = [String(user._id), String(alex._id)].sort();
  if (!(await Friendship.findOne({ userA, userB }))) {
    await Friendship.create({ userA, userB, status: 'accepted', requestedBy: user._id, acceptedAt: new Date() });
  }
  console.log('Friendship ready');

  if (!(await Activity.countDocuments({ actorId: alex._id }))) {
    const eventBus = createEventBus();
    const collectionService = createCollectionService({ Collection, CollectionItem, LibraryEntry, Game, User, eventBus });
    const activityService = createActivityService({ Activity, LibraryEntry, Game, User, Collection, social: {} });
    registerSubscribers({ eventBus, collectionService, activityService });
    const libraryService = createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus });
    const reviewService = createReviewService({ Review, Game, User, eventBus });

    // [slug, statuses to walk through, optional review]
    const plan = [
      ['hollow-knight', ['playing', 'completed'], [5, 'Gorgeous, haunting and enormous. Hallownest stays with you.']],
      ['celeste', ['playing', 'completed'], [5, 'Short, tough and kind. The assist mode is a lovely touch.']],
      ['hades--1', ['playing'], null],
      ['undertale', ['backlog'], null],
    ];
    for (const [slug, steps, review] of plan) {
      const gameId = games[slug]._id;
      if (await LibraryEntry.findOne({ userId: alex._id, gameId })) continue;
      const [first, ...rest] = steps;
      const entry = await libraryService.add(alex._id, { gameId, status: first });
      for (const next of rest) await libraryService.changeStatus(alex._id, entry.id, next);
      if (review) await reviewService.upsert(alex._id, gameId, { rating: review[0], body: review[1] }, LibraryEntry);
    }
    if (!(await Collection.findOne({ ownerId: alex._id, name: 'Cosy weekend games' }))) {
      await collectionService.create(alex._id, {
        name: 'Cosy weekend games', description: 'Low-stress picks.', visibility: 'public', type: 'manual', rules: [],
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 800)); // let the async subscribers finish writing
  }
  console.log('Alex activity ready');

  console.log(`\nSeed complete. Log in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

seed()
  .catch((err) => { console.error('Seed failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
