/**
 * Demo seed — creates a demo account plus 32 high-profile games with high-quality
 * 1080p posters, library entries, status history, play logs, reviews and collections
 * so graders and users can experience a rich, vibrant catalog and library.
 *
 * Usage (from repo root):  npm run seed
 *   or (from server/):     npm run seed
 *
 * Idempotent: re-running skips existing documents and updates covers to high-res.
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
import { GameSession } from '../src/models/GameSession.js';
import { Rsvp } from '../src/models/Rsvp.js';
import { Block } from '../src/models/Block.js';
import { createFriendService } from '../src/services/friendService.js';
import { createSessionService } from '../src/services/sessionService.js';
import { Recommendation } from '../src/models/Recommendation.js';
import { createRecommendationService } from '../src/services/recommendationService.js';
import { syncAllIndexes } from './sync-indexes.js';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('MONGODB_URI is not set. Add it to server/.env first.');
  process.exit(1);
}

const DEMO_EMAIL = 'demo@gamequest.dev';
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_USERNAME = 'demo';
const ALEX_EMAIL = 'alex@gamequest.dev';

// High-quality 1080p poster images from IGDB image CDN.
const GAMES = [
  {
    title: 'Elden Ring', slug: 'elden-ring', externalIds: { igdb: 119133 },
    summary: 'A vast open-world action RPG from FromSoftware. Rise, Tarnished, and become an Elden Lord in the Lands Between.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co4jni.jpg',
    releaseDate: new Date('2022-02-25'), genres: ['Role-playing (RPG)', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 55, extras: 100, full: 135 },
  },
  {
    title: 'Hollow Knight', slug: 'hollow-knight', externalIds: { igdb: 14593 },
    summary: 'A challenging 2D action adventure through a vast ruined kingdom of insects and heroes beneath Hallownest.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1rgi.jpg',
    releaseDate: new Date('2017-02-24'), genres: ['Platform', 'Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 4'], timeToBeat: { main: 27, extras: 42, full: 63 },
  },
  {
    title: 'Celeste', slug: 'celeste', externalIds: { igdb: 26226 },
    summary: 'Help Madeline survive her inner demons on her journey to the top of Celeste Mountain in this super-tight platformer.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co3byy.jpg',
    releaseDate: new Date('2018-01-25'), genres: ['Platform', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], timeToBeat: { main: 8, extras: 14, full: 38 },
  },
  {
    title: 'Hades', slug: 'hades--1', externalIds: { igdb: 113112 },
    summary: 'Defy the god of the dead as you hack and slash your way out of the Underworld in this rogue-like dungeon crawler.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co39vc.jpg',
    releaseDate: new Date('2020-09-17'), genres: ['Role-playing (RPG)', 'Hack and slash/Beat \'em up', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 22, extras: 48, full: 96 },
  },
  {
    title: 'Stardew Valley', slug: 'stardew-valley', externalIds: { igdb: 17000 },
    summary: "You've inherited your grandfather's old farm plot. With a few coins and some old tools, you set out to begin your new life.",
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/xrpmydnu9rpxvxfjkiu7.jpg',
    releaseDate: new Date('2016-02-26'), genres: ['Simulator', 'Role-playing (RPG)', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 4'], timeToBeat: { main: 52, extras: 95, full: 160 },
  },
  {
    title: 'The Witcher 3: Wild Hunt', slug: 'the-witcher-3-wild-hunt', externalIds: { igdb: 1942 },
    summary: 'You are Geralt of Rivia, a monster hunter for hire, searching for the Child of Prophecy across a war-torn fantasy world.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1wyy.jpg',
    releaseDate: new Date('2015-05-19'), genres: ['Role-playing (RPG)', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X|S'], timeToBeat: { main: 51, extras: 103, full: 173 },
  },
  {
    title: 'A Short Hike', slug: 'a-short-hike', externalIds: { igdb: 116753 },
    summary: 'A Short Hike is an exploration adventure game set in Hawk Peak Provincial Park. Climb, glide and fly to the summit.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co6e83.jpg',
    releaseDate: new Date('2019-07-30'), genres: ['Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], timeToBeat: { main: 2, extras: 3.5, full: 5 },
  },
  {
    title: 'Undertale', slug: 'undertale', externalIds: { igdb: 12517 },
    summary: 'A small child falls into the Underground, where monsters have long been banished by humans. Fight or spare your way out.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/cob1t2.jpg',
    releaseDate: new Date('2015-09-15'), genres: ['Puzzle', 'Role-playing (RPG)', 'Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 4'], timeToBeat: { main: 6.5, extras: 8.5, full: 20 },
  },
  {
    title: "Baldur's Gate 3", slug: 'baldurs-gate-3', externalIds: { igdb: 119171 },
    summary: "Gather your party and return to the Forgotten Realms in a tale of fellowship, betrayal, sacrifice and the lure of absolute power.",
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co670h.jpg',
    releaseDate: new Date('2023-08-03'), genres: ['Role-playing (RPG)', 'Adventure', 'Strategy', 'Tactical'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S', 'Mac'], timeToBeat: { main: 65, extras: 105, full: 155 },
  },
  {
    title: 'Cyberpunk 2077', slug: 'cyberpunk-2077', externalIds: { igdb: 1877 },
    summary: 'An open-world action-adventure RPG set in the megalopolis of Night City, where you fight for survival as a mercenary outlaw.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co4829.jpg',
    releaseDate: new Date('2020-12-10'), genres: ['Role-playing (RPG)', 'Shooter', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 25, extras: 60, full: 105 },
  },
  {
    title: 'The Legend of Zelda: Tears of the Kingdom', slug: 'the-legend-of-zelda-tears-of-the-kingdom', externalIds: { igdb: 119388 },
    summary: 'An epic adventure across the land and skies of Hyrule awaits. Harness the power of Link’s new abilities to save the kingdom.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co5vmg.jpg',
    releaseDate: new Date('2023-05-12'), genres: ['Adventure', 'Role-playing (RPG)'],
    platforms: ['Nintendo Switch'], timeToBeat: { main: 59, extras: 110, full: 230 },
  },
  {
    title: 'Red Dead Redemption 2', slug: 'red-dead-redemption-2', externalIds: { igdb: 25076 },
    summary: 'America, 1899. Arthur Morgan and the Van der Linde gang are outlaws on the run, fighting to survive in a rugged, dying frontier.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1q1f.jpg',
    releaseDate: new Date('2018-10-26'), genres: ['Adventure', 'Shooter', 'Role-playing (RPG)'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 4', 'Xbox One'], timeToBeat: { main: 50, extras: 82, full: 180 },
  },
  {
    title: 'God of War Ragnarök', slug: 'god-of-war-ragnarok', externalIds: { igdb: 112875 },
    summary: 'Kratos and Atreus embark on an epic and heartfelt journey across each of the Nine Realms as Asgardian forces prepare for war.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co5s5v.jpg',
    releaseDate: new Date('2022-11-09'), genres: ['Adventure', 'Hack and slash/Beat \'em up'],
    platforms: ['PlayStation 5', 'PlayStation 4', 'PC (Microsoft Windows)'], timeToBeat: { main: 26, extras: 45, full: 55 },
  },
  {
    title: 'Portal 2', slug: 'portal-2', externalIds: { igdb: 72 },
    summary: 'The acclaimed sequel drawing from the innovative formula of spatial puzzle physics, dark comedy, and a mind-bending story.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1x7d.jpg',
    releaseDate: new Date('2011-04-18'), genres: ['Puzzle', 'Platform', 'Shooter'],
    platforms: ['PC (Microsoft Windows)', 'Mac', 'Linux', 'Nintendo Switch'], timeToBeat: { main: 8.5, extras: 11, full: 16 },
  },
  {
    title: 'Disco Elysium', slug: 'disco-elysium', externalIds: { igdb: 26472 },
    summary: 'A groundbreaking open world RPG. You are a detective with a unique skill system and a whole city block to interrogate and explore.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1r0b.jpg',
    releaseDate: new Date('2019-10-15'), genres: ['Role-playing (RPG)', 'Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch', 'Xbox Series X|S'], timeToBeat: { main: 22, extras: 32, full: 45 },
  },
  {
    title: 'Outer Wilds', slug: 'outer-wilds', externalIds: { igdb: 11737 },
    summary: 'An open world mystery about a hand-crafted solar system trapped in an endless time loop. Winner of multiple Game of the Year awards.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1ne8.jpg',
    releaseDate: new Date('2019-05-28'), genres: ['Adventure', 'Puzzle', 'Indie', 'Simulator'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch', 'Xbox Series X|S'], timeToBeat: { main: 16, extras: 21, full: 28 },
  },
  {
    title: 'Balatro', slug: 'balatro', externalIds: { igdb: 251833 },
    summary: 'A poker-inspired roguelike deck builder all about creating outrageous synergies, scoring billions of chips, and winning big.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co7vfs.jpg',
    releaseDate: new Date('2024-02-20'), genres: ['Strategy', 'Card & Board Game', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 25, extras: 65, full: 120 },
  },
  {
    title: 'Dave the Diver', slug: 'dave-the-diver', externalIds: { igdb: 203722 },
    summary: 'A charming, single-player adventure RPG featuring deep-sea exploration and spearfishing by day, and sushi bar management by night.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co6mfg.jpg',
    releaseDate: new Date('2023-06-28'), genres: ['Adventure', 'Simulator', 'Role-playing (RPG)', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 5'], timeToBeat: { main: 24, extras: 35, full: 50 },
  },
  {
    title: 'Sea of Stars', slug: 'sea-of-stars', externalIds: { igdb: 131890 },
    summary: 'A turn-based RPG inspired by 90s classics. Follow two Children of the Solstice who combine sun and moon magic to repel an alchemist.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co6b9u.jpg',
    releaseDate: new Date('2023-08-29'), genres: ['Role-playing (RPG)', 'Adventure', 'Indie', 'Turn-based strategy (TBS)'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 25, extras: 32, full: 40 },
  },
  {
    title: 'Sekiro: Shadows Die Twice', slug: 'sekiro-shadows-die-twice', externalIds: { igdb: 76882 },
    summary: 'Carve your own clever path to vengeance in late 1500s Sengoku Japan as the one-armed wolf with razor-sharp sword combat.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1r76.jpg',
    releaseDate: new Date('2019-03-22'), genres: ['Adventure', 'Hack and slash/Beat \'em up', 'Role-playing (RPG)'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 4', 'Xbox One'], timeToBeat: { main: 30, extras: 42, full: 70 },
  },
  {
    title: 'Ghost of Tsushima', slug: 'ghost-of-tsushima', externalIds: { igdb: 75235 },
    summary: 'In 1274 Japan, samurai warrior Jin Sakai must forge a new path — the path of the Ghost — to wage an unconventional war for Tsushima.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co2crj.jpg',
    releaseDate: new Date('2020-07-17'), genres: ['Adventure', 'Role-playing (RPG)', 'Hack and slash/Beat \'em up'],
    platforms: ['PlayStation 5', 'PlayStation 4', 'PC (Microsoft Windows)'], timeToBeat: { main: 25, extras: 45, full: 62 },
  },
  {
    title: 'Persona 5 Royal', slug: 'persona-5-royal', externalIds: { igdb: 114283 },
    summary: 'Don the mask of Joker and join the Phantom Thieves of Hearts to break societal chains and steal distorted desires in Tokyo.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1nic.jpg',
    releaseDate: new Date('2019-10-31'), genres: ['Role-playing (RPG)', 'Adventure', 'Turn-based strategy (TBS)'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Nintendo Switch', 'Xbox Series X|S'], timeToBeat: { main: 101, extras: 125, full: 143 },
  },
  {
    title: 'Alan Wake 2', slug: 'alan-wake-2', externalIds: { igdb: 185246 },
    summary: 'Saga Anderson investigates ritualistic murders in Bright Falls while Alan Wake writes a dark horror story to escape the Dark Place.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co6k57.jpg',
    releaseDate: new Date('2023-10-27'), genres: ['Adventure', 'Shooter', 'Puzzle'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 18, extras: 24, full: 30 },
  },
  {
    title: 'Armored Core VI: Fires of Rubicon', slug: 'armored-core-vi-fires-of-rubicon', externalIds: { igdb: 228542 },
    summary: 'Fast-paced, omni-directional mech battles on planet Rubicon 3. Assemble and customize your AC with massive firepower.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co6nvd.jpg',
    releaseDate: new Date('2023-08-25'), genres: ['Shooter', 'Simulator', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 15, extras: 25, full: 45 },
  },
  {
    title: 'Resident Evil 4', slug: 'resident-evil-4--1', externalIds: { igdb: 132181 },
    summary: 'Survival is only the beginning. Leon S. Kennedy tracks the US president’s daughter to a secluded village in Europe.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co6d1l.jpg',
    releaseDate: new Date('2023-03-24'), genres: ['Shooter', 'Adventure', 'Puzzle'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'Xbox Series X|S'], timeToBeat: { main: 16, extras: 20, full: 32 },
  },
  {
    title: 'Metroid Dread', slug: 'metroid-dread', externalIds: { igdb: 15698 },
    summary: 'Samus Aran must navigate planet ZDR and evade relentless, lethal E.M.M.I. research robots in intense 2D action.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co3a2v.jpg',
    releaseDate: new Date('2021-10-08'), genres: ['Platform', 'Adventure', 'Shooter'],
    platforms: ['Nintendo Switch'], timeToBeat: { main: 9, extras: 12, full: 16 },
  },
  {
    title: 'Hi-Fi RUSH', slug: 'hi-fi-rush', externalIds: { igdb: 233585 },
    summary: 'Feel the beat as wannabe rockstar Chai battles a sinister tech megacorp with heart-pounding rhythm action combat.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co62y4.jpg',
    releaseDate: new Date('2023-01-25'), genres: ['Hack and slash/Beat \'em up', 'Platform', 'Music', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'Xbox Series X|S', 'PlayStation 5'], timeToBeat: { main: 11, extras: 15, full: 25 },
  },
  {
    title: 'Monster Hunter: World', slug: 'monster-hunter-world', externalIds: { igdb: 36926 },
    summary: 'Battle gigantic monsters in epic landscapes. Use your surroundings and materials to craft weapons and track ancient dragons.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1r5a.jpg',
    releaseDate: new Date('2018-01-26'), genres: ['Role-playing (RPG)', 'Adventure', 'Hack and slash/Beat \'em up'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 4', 'Xbox One'], timeToBeat: { main: 48, extras: 90, full: 350 },
  },
  {
    title: 'Chrono Trigger', slug: 'chrono-trigger', externalIds: { igdb: 1802 },
    summary: 'The timeless RPG masterpiece developed by Yuji Horii, Akira Toriyama, and the creators of Final Fantasy across multiple eras.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1pnc.jpg',
    releaseDate: new Date('1995-03-11'), genres: ['Role-playing (RPG)', 'Adventure', 'Turn-based strategy (TBS)'],
    platforms: ['Super Nintendo Entertainment System (SNES)', 'PC (Microsoft Windows)'], timeToBeat: { main: 23, extras: 27, full: 43 },
  },
  {
    title: 'Hollow Knight: Silksong', slug: 'hollow-knight-silksong', externalIds: { igdb: 115289 },
    summary: 'Play as Hornet and ascend to the peak of a haunted kingdom ruled by silk and song in this highly anticipated sequel.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1p4a.jpg',
    releaseDate: new Date('2025-12-31'), genres: ['Platform', 'Adventure', 'Indie'],
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch', 'Xbox Series X|S', 'PlayStation 5'], timeToBeat: { main: 30, extras: 50, full: 70 },
  },
  {
    title: 'Bloodborne', slug: 'bloodborne', externalIds: { igdb: 7334 },
    summary: 'Hunt your nightmares in the gothic, cursed city of Yharnam. Fast-paced combat against terrifying beasts with trick weapons.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1rba.jpg',
    releaseDate: new Date('2015-03-24'), genres: ['Role-playing (RPG)', 'Adventure', 'Hack and slash/Beat \'em up'],
    platforms: ['PlayStation 4'], timeToBeat: { main: 33, extras: 45, full: 76 },
  },
  {
    title: 'Genshin Impact', slug: 'genshin-impact', externalIds: { igdb: 119277 },
    summary: 'An open-world action RPG set in the fantasy world of Teyvat. Embark on a journey to find your lost sibling and unravel mysteries with a diverse cast of characters.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/coa9dy.jpg',
    backdrop: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar2ht4.jpg',
    heroImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar2ht4.jpg',
    bannerImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar2ht4.jpg',
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/coa9dy.jpg',
    cardImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/coa9dy.jpg',
    artworks: [
      'https://images.igdb.com/igdb/image/upload/t_1080p/ar2ht4.jpg',
      'https://images.igdb.com/igdb/image/upload/t_1080p/ar2ht6.jpg',
      'https://images.igdb.com/igdb/image/upload/t_1080p/ar4lmg.jpg',
    ],
    screenshots: [
      'https://images.igdb.com/igdb/image/upload/t_1080p/sco94f.jpg',
      'https://images.igdb.com/igdb/image/upload/t_1080p/sco94h.jpg',
    ],
    videos: ['jEp9yyhwZFE', 'TAlKhARUcoY', 'SO__VQZirJ4', '5DuZblVxG3I'],
    videoMeta: [
      { id: 'jEp9yyhwZFE', name: 'Gameplay Trailer' },
      { id: 'TAlKhARUcoY', name: 'Launch Trailer' },
      { id: 'SO__VQZirJ4', name: 'Release Date Trailer' },
      { id: '5DuZblVxG3I', name: 'Trailer' },
    ],
    developer: ['HoYoverse', 'miHoYo'],
    publisher: ['HoYoverse', 'Cognosphere'],
    releaseDate: new Date('2020-09-28'),
    genres: ['Role-playing (RPG)', 'Adventure'],
    platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'PlayStation 4', 'iOS', 'Android'],
    timeToBeat: { main: 60, extras: 150, full: 400 },
    totalRating: 81.1,
    totalRatingCount: 683,
    popularity: 95,
  },
  {
    title: 'Death Stranding', slug: 'death-stranding', externalIds: { igdb: 19564 },
    summary: 'From Hideo Kojima comes a genre-defying journey where Sam Bridges must reconnect a fractured society in an apocalyptic world.',
    cover: 'https://images.igdb.com/igdb/image/upload/t_1080p/co1r7f.jpg',
    releaseDate: new Date('2019-11-08'), genres: ['Adventure', 'Shooter', 'Simulator'],
    platforms: ['PlayStation 5', 'PC (Microsoft Windows)'], timeToBeat: { main: 40, extras: 60, full: 113 },
  },
];

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const utcDay = (n) => { const d = daysAgo(n); d.setUTCHours(0, 0, 0, 0); return d; };

async function ensureGame(data) {
  const existing = (await Game.findOne({ 'externalIds.igdb': data.externalIds.igdb })) ?? (await Game.findOne({ slug: data.slug }));
  if (!existing) return Game.create({ ...data, source: 'igdb' });
  let changed = false;
  // The slug and art of an existing game are left alone: `catalog:fix` aligns slugs and `catalog:art` takes the art
  // from IGDB. (Hand-typed image ids here were wrong for several games, so the seed never overwrites real art.)
  if (!existing.cover && data.cover) {
    existing.cover = data.cover;
    changed = true;
  }
  if (data.timeToBeat && (!existing.timeToBeat || !existing.timeToBeat.main)) {
    existing.timeToBeat = data.timeToBeat;
    changed = true;
  }
  if (changed) await existing.save();
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
      bio: 'Lifelong gamer, completionist, and indie game lover.',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    console.log(`Created demo user ${DEMO_EMAIL}`);
  } else {
    console.log(`Demo user already exists (${DEMO_EMAIL})`);
  }

  // Ensure explicitly seeded demo fixtures (demo@gamequest.dev, alex@gamequest.dev) are verified in local/seed environment
  await User.updateMany(
    { emailVerified: { $in: [null, false] }, email: { $in: [DEMO_EMAIL, ALEX_EMAIL] } },
    { $set: { emailVerified: true, emailVerifiedAt: new Date() } },
  );

  const games = {};
  for (const g of GAMES) games[g.slug] = await ensureGame(g);
  console.log(`${GAMES.length} games ready (all in 1080p high quality)`);

  // Enrich demo user with avatar and favourite games
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        bio: 'Lifelong gamer, completionist, and indie game enthusiast.',
        avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=256&h=256&q=80',
        favouriteGames: [games['elden-ring']?._id, games['hades--1']?._id, games['hollow-knight']?._id, games['baldurs-gate-3']?._id].filter(Boolean),
      },
    }
  );

  async function ensureEntry(slug, status, extra = {}) {
    const game = games[slug];
    if (!game) return null;
    const gameId = game._id;
    const existing = await LibraryEntry.findOne({ userId: user._id, gameId });
    if (existing) return existing;
    const entry = await LibraryEntry.create({ userId: user._id, gameId, status, ...extra });
    await StatusHistory.create({ userId: user._id, entryId: entry._id, from: null, to: status }).catch(() => {});
    return entry;
  }

  // Demo Playing
  const elden = await ensureEntry('elden-ring', 'playing', {
    manualProgress: 65, loggedMinutes: 270, lastPlayedAt: daysAgo(1),
    ownerships: [{ platform: 'Steam', playtimeMin: 1800 }],
  });
  const hades = await ensureEntry('hades--1', 'playing', {
    manualProgress: 30, loggedMinutes: 105, lastPlayedAt: daysAgo(5),
    ownerships: [{ platform: 'Steam', playtimeMin: 800 }],
  });
  const balatro = await ensureEntry('balatro', 'playing', {
    manualProgress: 40, loggedMinutes: 180, lastPlayedAt: daysAgo(2),
    ownerships: [{ platform: 'Steam', playtimeMin: 1200 }],
  });
  const cyberpunk = await ensureEntry('cyberpunk-2077', 'playing', {
    manualProgress: 25, loggedMinutes: 120, lastPlayedAt: daysAgo(4),
    ownerships: [{ platform: 'GOG', playtimeMin: 900 }],
  });

  // Demo Completed
  const hollow = await ensureEntry('hollow-knight', 'completed', {
    manualProgress: 100, completedAt: daysAgo(45),
    ownerships: [{ platform: 'Steam', playtimeMin: 2550 }],
  });
  const portal2 = await ensureEntry('portal-2', 'completed', {
    manualProgress: 100, completedAt: daysAgo(60),
    ownerships: [{ platform: 'Steam', playtimeMin: 600 }],
  });
  const dave = await ensureEntry('dave-the-diver', 'completed', {
    manualProgress: 100, completedAt: daysAgo(20),
    ownerships: [{ platform: 'Steam', playtimeMin: 1500 }],
  });
  const chrono = await ensureEntry('chrono-trigger', 'completed', {
    manualProgress: 100, completedAt: daysAgo(90),
    ownerships: [{ platform: 'Steam', playtimeMin: 1400 }],
  });
  const hifi = await ensureEntry('hi-fi-rush', 'completed', {
    manualProgress: 100, completedAt: daysAgo(30),
    ownerships: [{ platform: 'Xbox', playtimeMin: 700 }],
  });

  // Demo Backlog
  await ensureEntry('celeste', 'backlog', { ownerships: [{ platform: 'Nintendo Switch', playtimeMin: 0 }] });
  await ensureEntry('a-short-hike', 'backlog', { ownerships: [{ platform: 'PC', playtimeMin: 0 }] });
  await ensureEntry('undertale', 'backlog', { ownerships: [{ platform: 'PC', playtimeMin: 0 }] });
  await ensureEntry('baldurs-gate-3', 'backlog', { ownerships: [{ platform: 'Steam', playtimeMin: 120 }] });
  await ensureEntry('sea-of-stars', 'backlog', { ownerships: [{ platform: 'Nintendo Switch', playtimeMin: 0 }] });
  await ensureEntry('outer-wilds', 'backlog', { ownerships: [{ platform: 'Steam', playtimeMin: 0 }] });
  await ensureEntry('alan-wake-2', 'backlog', { ownerships: [{ platform: 'Epic Games', playtimeMin: 0 }] });
  await ensureEntry('armored-core-vi-fires-of-rubicon', 'backlog', { ownerships: [{ platform: 'PlayStation 5', playtimeMin: 0 }] });
  await ensureEntry('resident-evil-4--1', 'backlog', { ownerships: [{ platform: 'PlayStation 5', playtimeMin: 0 }] });
  await ensureEntry('metroid-dread', 'backlog', { ownerships: [{ platform: 'Nintendo Switch', playtimeMin: 0 }] });
  await ensureEntry('sekiro-shadows-die-twice', 'backlog', { ownerships: [{ platform: 'Steam', playtimeMin: 0 }] });

  // Demo Wishlist
  await ensureEntry('stardew-valley', 'wishlist');
  await ensureEntry('hollow-knight-silksong', 'wishlist');
  await ensureEntry('the-legend-of-zelda-tears-of-the-kingdom', 'wishlist');
  await ensureEntry('ghost-of-tsushima', 'wishlist');
  await ensureEntry('persona-5-royal', 'wishlist');
  await ensureEntry('death-stranding', 'wishlist');
  await ensureEntry('bloodborne', 'wishlist');
  await ensureEntry('monster-hunter-world', 'wishlist');
  await ensureEntry('red-dead-redemption-2', 'wishlist');
  await ensureEntry('god-of-war-ragnarok', 'wishlist');

  // Demo Dropped
  const witcher = await ensureEntry('the-witcher-3-wild-hunt', 'dropped', {
    manualProgress: 20, ownerships: [{ platform: 'GOG', playtimeMin: 720 }],
  });
  console.log('Library entries ready');

  // Play sessions
  const sessions = [
    [elden, 'elden-ring', [[1, 90, 'Defeated Morgott!'], [3, 120, 'Exploring Mountaintops'], [7, 60, 'Boss practice']]],
    [hades, 'hades--1', [[5, 60, 'First Theseus clear'], [6, 45, 'Escaped with the Twin Fists']]],
    [balatro, 'balatro', [[2, 75, 'Unlocked plasma deck!'], [4, 60, 'Struggling with orange stake']]],
    [cyberpunk, 'cyberpunk-2077', [[4, 80, 'Meeting Judy in Kabuki'], [8, 40, 'Exploring Japantown']]],
  ];
  for (const [entry, slug, logs] of sessions) {
    if (!entry) continue;
    for (const [ago, minutes, note] of logs) {
      const date = utcDay(ago);
      if (!(await PlayLog.findOne({ entryId: entry._id, date }))) {
        await PlayLog.create({ entryId: entry._id, userId: user._id, gameId: games[slug]._id, date, minutes, note });
      }
    }
  }
  console.log('Play logs ready');

  // Reviews
  const reviews = [
    [hollow, 5, 'An absolute masterpiece. The atmosphere, the boss fights, the lore: all perfect.'],
    [hades, 4, 'Incredibly polished roguelike with amazing writing. The voice acting alone is worth it.'],
    [portal2, 5, 'One of the best puzzle games ever made. GLaDOS and Wheatley are legendary.'],
    [balatro, 5, 'Utterly addictive poker roguelike. One more run turned into 3 AM.'],
    [dave, 4, 'Charming gameplay loop of deep sea spear-fishing and managing a sushi bar.'],
    [hifi, 5, 'Saturday morning cartoon energy mixed with tight, exhilarating rhythm combat.'],
    [chrono, 5, 'The timeless gold standard of 16-bit JRPGs. Toriyama art and Mitsuda soundtrack forever.'],
    [witcher, 3, "Stunning world and story, but I bounced off the combat. Maybe I'll come back someday."],
  ];
  for (const [entry, rating, body] of reviews) {
    if (!entry) continue;
    const gameId = entry.gameId;
    if (await Review.findOne({ userId: user._id, gameId })) continue;
    await Review.create({ userId: user._id, gameId, rating, body });
    const matchId = new mongoose.Types.ObjectId(gameId);
    const [agg] = await Review.aggregate([
      { $match: { gameId: matchId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Game.updateOne({ _id: gameId }, { $set: { ratingAvg: Math.round((agg?.avg ?? 0) * 10) / 10, ratingCount: agg?.count ?? 0 } });
  }
  console.log('Reviews ready');

  // Collections
  async function ensureCollection(data) {
    return (await Collection.findOne({ ownerId: user._id, name: data.name })) ?? Collection.create({ ownerId: user._id, ...data });
  }
  const favourites = await ensureCollection({
    name: 'All-time favourites', description: 'The games I keep coming back to time and time again.', visibility: 'public', type: 'manual',
  });
  for (const [i, entry] of [hollow, hades, elden, portal2, chrono, balatro].filter(Boolean).entries()) {
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

  const epics = await ensureCollection({
    name: 'Massive RPGs', description: 'Deep, immersive 50+ hour worlds.', visibility: 'public', type: 'manual',
  });
  for (const [i, entry] of [elden, cyberpunk, witcher].filter(Boolean).entries()) {
    if (!(await CollectionItem.findOne({ collectionId: epics._id, entryId: entry._id }))) {
      await CollectionItem.create({ collectionId: epics._id, entryId: entry._id, position: i + 1 });
    }
  }
  console.log('Collections ready');

  // ── a second player, friends with demo, whose activity fills the feed ─────────
  let alex = await User.findOne({ email: ALEX_EMAIL });
  if (!alex) {
    alex = await User.create({
      username: 'alex', usernameLower: 'alex', email: ALEX_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12), role: 'user',
      bio: 'Cozy game connoisseur and deckbuilding addict.',
      emailVerified: true,
      emailVerifiedAt: new Date(),
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

    const plan = [
      ['hollow-knight', ['playing', 'completed'], [5, 'Gorgeous, haunting and enormous. Hallownest stays with you.']],
      ['celeste', ['playing', 'completed'], [5, 'Short, tough and kind. The assist mode is a lovely touch.']],
      ['hades--1', ['playing'], null],
      ['sea-of-stars', ['playing', 'completed'], [5, 'A stunning retro love letter to Chrono Trigger with fantastic combat.']],
      ['balatro', ['playing'], [5, 'Cannot stop playing this. Best roguelike since Slay the Spire.']],
      ['undertale', ['backlog'], null],
    ];
    for (const [slug, steps, review] of plan) {
      const g = games[slug];
      if (!g) continue;
      const gameId = g._id;
      if (await LibraryEntry.findOne({ userId: alex._id, gameId })) continue;
      const [first, ...rest] = steps;
      const entry = await libraryService.add(alex._id, { gameId, status: first });
      for (const next of rest) await libraryService.changeStatus(alex._id, entry.id, next);
      if (review) await reviewService.upsert(alex._id, gameId, { rating: review[0], body: review[1] }, LibraryEntry);
    }
    if (!(await Collection.findOne({ ownerId: alex._id, name: 'Cosy weekend games' }))) {
      await collectionService.create(alex._id, {
        name: 'Cosy weekend games', description: 'Low-stress picks for a rainy Sunday.', visibility: 'public', type: 'manual', rules: [],
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  // Enrich alex with avatar and favourite games
  await User.updateOne(
    { _id: alex._id },
    {
      $set: {
        bio: 'Cozy game connoisseur, roguelike fanatic, and deckbuilding addict.',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
        favouriteGames: [games['celeste']?._id, games['balatro']?._id, games['outer-wilds']?._id, games['sea-of-stars']?._id].filter(Boolean),
      },
    }
  );
  console.log('Alex activity ready');

  // ── an upcoming session hosted by alex with demo invited ──
  const upcoming = await GameSession.findOne({ hostId: alex._id, status: 'scheduled', endsAt: { $gt: new Date() } });
  if (!upcoming) {
    const eventBus = createEventBus();
    const friendService = createFriendService({ Friendship, Block, User, eventBus });
    const activityService = createActivityService({ Activity, LibraryEntry, Game, User, Collection, GameSession, social: friendService });
    registerSubscribers({ eventBus, activityService });
    const sessionService = createSessionService({ GameSession, Rsvp, Game, User, social: friendService, eventBus });
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 2);
    startsAt.setUTCHours(15, 0, 0, 0);
    await sessionService.create(alex._id, {
      gameId: games['hades--1']._id,
      title: 'Hades night',
      startsAt: startsAt.toISOString(),
      durationMin: 120,
      platform: 'PC',
      discordInviteUrl: 'https://discord.gg/gamequest-demo',
      maxPlayers: 4,
      visibility: 'friends',
      inviteeIds: [String(user._id)],
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  console.log('Session ready');

  // ── a recommendation from alex to demo ──
  const recGame = games['celeste'];
  if (recGame && !(await Recommendation.findOne({ fromId: alex._id, toId: user._id, gameId: recGame._id }))) {
    const friendService = createFriendService({ Friendship, Block, User });
    const recService = createRecommendationService({
      Recommendation,
      Game,
      User,
      Review,
      LibraryEntry,
      social: friendService,
    });
    await recService.send(alex._id, {
      toId: String(user._id),
      gameId: String(recGame._id),
      message: 'You have to play this platformer! The story and soundtrack are incredible.',
    });
    console.log('Recommendation ready');
  }

  console.log('\nSyncing indexes...');
  await syncAllIndexes();

  console.log(`\nSeed complete! ${GAMES.length} high-res games ready.`);
  console.log(`Log in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

seed()
  .catch((err) => { console.error('Seed failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
