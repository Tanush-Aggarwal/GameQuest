/**
 * Demo seed script — creates a demo account plus a handful of games with
 * library entries, play logs and reviews so graders can log in immediately
 * and see the app in action.
 *
 * Usage (from repo root):
 *   cd server && node scripts/seed.js
 *
 * The script is idempotent: re-running it skips already-existing documents.
 * Set MONGODB_URI in server/.env (or the environment) before running.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI is not set. Add it to server/.env first.');
  process.exit(1);
}

/* ── Inline schemas (avoids importing the full app stack) ─────────────────── */

const userSchema = new mongoose.Schema({ username: String, usernameLower: String, email: String, passwordHash: String, role: { type: String, default: 'user' } }, { timestamps: true });
const gameSchema = new mongoose.Schema({
  title: String, slug: String, summary: String, cover: String, releaseYear: Number,
  genres: [String], platforms: [String], developer: String,
  ratingAvg: { type: Number, default: 0 }, ratingCount: { type: Number, default: 0 },
  timeToBeatMain: Number,
}, { timestamps: true });
const libraryEntrySchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId, gameId: mongoose.Schema.Types.ObjectId,
  status: String, manualProgress: { type: Number, default: 0 },
  loggedMinutes: { type: Number, default: 0 }, lastPlayedAt: Date,
  ownerships: [{ platform: String, playtimeMin: Number }],
  completedAt: Date, hiddenFromFriends: { type: Boolean, default: false },
}, { timestamps: true });
const playLogSchema = new mongoose.Schema({
  entryId: mongoose.Schema.Types.ObjectId, userId: mongoose.Schema.Types.ObjectId,
  gameId: mongoose.Schema.Types.ObjectId, date: Date, minutes: Number, note: String,
}, { timestamps: true });
const reviewSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId, gameId: mongoose.Schema.Types.ObjectId,
  rating: Number, body: String,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Game = mongoose.model('Game', gameSchema);
const LibraryEntry = mongoose.model('LibraryEntry', libraryEntrySchema);
const PlayLog = mongoose.model('PlayLog', playLogSchema);
const Review = mongoose.model('Review', reviewSchema);

/* ── Demo data ─────────────────────────────────────────────────────────────── */

const DEMO_EMAIL = 'demo@gamequest.dev';
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_USERNAME = 'demo';

const GAMES = [
  {
    title: 'Elden Ring',
    slug: 'elden-ring',
    summary: 'A vast open world action RPG from FromSoftware and George R. R. Martin. Rise, Tarnished, and become an Elden Lord.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg',
    releaseYear: 2022,
    genres: ['RPG', 'Action'],
    platforms: ['PC', 'PS5', 'Xbox'],
    developer: 'FromSoftware',
    timeToBeatMain: 55,
  },
  {
    title: 'Hollow Knight',
    slug: 'hollow-knight',
    summary: 'A challenging 2D action adventure through a vast ruined kingdom of insects and heroes.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rgi.jpg',
    releaseYear: 2017,
    genres: ['Metroidvania', 'Platformer'],
    platforms: ['PC', 'Switch', 'PS4'],
    developer: 'Team Cherry',
    timeToBeatMain: 40,
  },
  {
    title: 'Celeste',
    slug: 'celeste',
    summary: 'Help Madeline survive her inner demons on her journey to the top of Celeste Mountain.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1nsa.jpg',
    releaseYear: 2018,
    genres: ['Platformer', 'Indie'],
    platforms: ['PC', 'Switch', 'PS4', 'Xbox'],
    developer: 'Maddy Makes Games',
    timeToBeatMain: 8,
  },
  {
    title: 'Hades',
    slug: 'hades',
    summary: 'Defy the god of the dead as you hack and slash your way out of the Underworld.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co20yy.jpg',
    releaseYear: 2020,
    genres: ['Roguelike', 'Action'],
    platforms: ['PC', 'Switch', 'PS4', 'Xbox'],
    developer: 'Supergiant Games',
    timeToBeatMain: 22,
  },
  {
    title: 'Stardew Valley',
    slug: 'stardew-valley',
    summary: "You've inherited your grandfather's old farm plot. With a few coin, some old tools, and a good deal of determination, you set out to begin your new life.",
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/xrpmydnu9rpxvxfjkiu7.jpg',
    releaseYear: 2016,
    genres: ['Simulation', 'RPG'],
    platforms: ['PC', 'Switch', 'PS4', 'Xbox', 'Mobile'],
    developer: 'ConcernedApe',
    timeToBeatMain: 52,
  },
  {
    title: 'The Witcher 3: Wild Hunt',
    slug: 'the-witcher-3-wild-hunt',
    summary: 'You are Geralt of Rivia, a professional monster hunter known as a Witcher. You have a contract: track down the Child of Prophecy.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
    releaseYear: 2015,
    genres: ['RPG', 'Open World'],
    platforms: ['PC', 'PS4', 'PS5', 'Xbox', 'Switch'],
    developer: 'CD Projekt Red',
    timeToBeatMain: 51,
  },
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function days(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function upsertGame(data) {
  const existing = await Game.findOne({ slug: data.slug });
  if (existing) return existing;
  return Game.create(data);
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

async function seed() {
  console.log('🌱  Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('✅  Connected.');

  // Demo user
  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    user = await User.create({
      username: DEMO_USERNAME,
      usernameLower: DEMO_USERNAME,
      email: DEMO_EMAIL,
      passwordHash,
      role: 'user',
    });
    console.log(`👤  Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } else {
    console.log(`👤  Demo user already exists (${DEMO_EMAIL})`);
  }

  // Games
  const games = {};
  for (const g of GAMES) {
    games[g.slug] = await upsertGame(g);
  }
  console.log(`🎮  ${Object.keys(games).length} games ready`);

  // Library entries
  async function ensureEntry(slug, status, extraData = {}) {
    const gameId = games[slug]._id;
    const existing = await LibraryEntry.findOne({ userId: user._id, gameId });
    if (existing) return existing;
    return LibraryEntry.create({ userId: user._id, gameId, status, ...extraData });
  }

  const eldenRingEntry = await ensureEntry('elden-ring', 'playing', {
    manualProgress: 65,
    loggedMinutes: 1830,
    ownerships: [{ platform: 'PC', playtimeMin: 1800 }],
    lastPlayedAt: days(1),
  });

  const hollowKnightEntry = await ensureEntry('hollow-knight', 'completed', {
    manualProgress: 100,
    loggedMinutes: 2580,
    completedAt: days(45),
    ownerships: [{ platform: 'PC', playtimeMin: 2550 }],
  });

  await ensureEntry('celeste', 'backlog', {
    ownerships: [{ platform: 'Switch', playtimeMin: 0 }],
  });

  const hadesEntry = await ensureEntry('hades', 'playing', {
    manualProgress: 30,
    loggedMinutes: 840,
    lastPlayedAt: days(5),
    ownerships: [{ platform: 'PC', playtimeMin: 800 }],
  });

  await ensureEntry('stardew-valley', 'wishlist');

  const witcherEntry = await ensureEntry('the-witcher-3-wild-hunt', 'dropped', {
    manualProgress: 20,
    loggedMinutes: 720,
  });

  console.log('📚  Library entries ready');

  // Play logs
  const logPairs = [
    { entry: eldenRingEntry, game: games['elden-ring'], sessions: [
      { daysAgo: 1, minutes: 90, note: 'Defeated Morgott!' },
      { daysAgo: 3, minutes: 120 },
      { daysAgo: 7, minutes: 60, note: 'Exploring Mountaintops' },
    ]},
    { entry: hadesEntry, game: games['hades'], sessions: [
      { daysAgo: 5, minutes: 60 },
      { daysAgo: 6, minutes: 45 },
    ]},
  ];

  for (const { entry, game, sessions } of logPairs) {
    for (const s of sessions) {
      const existingLog = await PlayLog.findOne({ entryId: entry._id, minutes: s.minutes });
      if (!existingLog) {
        const d = days(s.daysAgo);
        d.setUTCHours(0, 0, 0, 0);
        await PlayLog.create({
          entryId: entry._id,
          userId: user._id,
          gameId: game._id,
          date: d,
          minutes: s.minutes,
          note: s.note ?? null,
        });
      }
    }
  }
  console.log('🕐  Play logs ready');

  // Reviews
  const reviewData = [
    { entry: hollowKnightEntry, gameId: games['hollow-knight']._id, rating: 5, body: 'An absolute masterpiece. The atmosphere, the boss fights, the lore — all perfect. One of the best games I have ever played.' },
    { entry: hadesEntry, gameId: games['hades']._id, rating: 4, body: 'Incredibly polished roguelike with amazing writing. The voice acting alone is worth playing for.' },
    { entry: witcherEntry, gameId: games['the-witcher-3-wild-hunt']._id, rating: 3, body: "Stunning world and story, but I bounced off the combat. Maybe I'll come back someday." },
  ];

  for (const { gameId, rating, body } of reviewData) {
    const existing = await Review.findOne({ userId: user._id, gameId });
    if (!existing) {
      await Review.create({ userId: user._id, gameId, rating, body });
      // refresh avg
      const [agg] = await Review.aggregate([
        { $match: { gameId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]);
      await Game.updateOne({ _id: gameId }, { $set: { ratingAvg: Math.round((agg?.avg ?? 0) * 10) / 10, ratingCount: agg?.count ?? 0 } });
    }
  }
  console.log('⭐  Reviews ready');

  console.log('\n✨  Seed complete!');
  console.log(`\n   Demo login:`);
  console.log(`     Email:    ${DEMO_EMAIL}`);
  console.log(`     Password: ${DEMO_PASSWORD}`);
  console.log('');
}

seed()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => mongoose.disconnect());
