import { connectDb } from '../server/src/config/db.js';
import { Game } from '../server/src/models/Game.js';
import { MediaCache } from '../server/src/models/MediaCache.js';

await connectDb(process.env.MONGODB_URI, console);

const genshinData = {
  title: 'Genshin Impact',
  slug: 'genshin-impact',
  externalIds: { igdb: 119277 },
  summary: 'Genshin Impact is an open-world action RPG, where you embark on a journey across Teyvat to find your lost sibling and seek answers from The Seven, the gods of each element. Explore this wondrous world, join forces with a diverse range of characters, and unravel the countless mysteries that Teyvat holds.',
  storyline: 'Aeons ago, the elder elemental gods gave civilization to the human race, but the world soon splintered as corruption and greed grew without check. The gods watched from their abode in Celestia and selected the worthy to sit by their side and maintain the balance that hold the world together in one piece.',
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
    'https://images.igdb.com/igdb/image/upload/t_1080p/ar2hta.jpg',
    'https://images.igdb.com/igdb/image/upload/t_1080p/ar4lln.jpg',
  ],
  screenshots: [
    'https://images.igdb.com/igdb/image/upload/t_1080p/sco94f.jpg',
    'https://images.igdb.com/igdb/image/upload/t_1080p/sco94h.jpg',
    'https://images.igdb.com/igdb/image/upload/t_1080p/sc105bb.jpg',
    'https://images.igdb.com/igdb/image/upload/t_1080p/sc105bd.jpg',
  ],
  videos: [
    'jEp9yyhwZFE',
    'TAlKhARUcoY',
    'SO__VQZirJ4',
    '5DuZblVxG3I',
    'lMdsrZ1otlA',
  ],
  videoMeta: [
    { id: 'jEp9yyhwZFE', name: 'Gameplay Trailer' },
    { id: 'TAlKhARUcoY', name: 'Launch Trailer' },
    { id: 'SO__VQZirJ4', name: 'Release Date Trailer' },
    { id: '5DuZblVxG3I', name: 'Trailer' },
    { id: 'lMdsrZ1otlA', name: 'Trailer' },
  ],
  developer: ['HoYoverse', 'miHoYo', 'Cognosphere'],
  publisher: ['HoYoverse', 'Cognosphere', 'miHoYo'],
  genres: ['Role-playing (RPG)', 'Adventure'],
  themes: ['Action', 'Fantasy', 'Open world'],
  gameModes: ['Single player', 'Multiplayer', 'Co-operative'],
  platforms: ['PC (Microsoft Windows)', 'PlayStation 5', 'PlayStation 4', 'iOS', 'Android'],
  releaseDate: new Date('2020-09-28'),
  totalRating: 81.1,
  totalRatingCount: 683,
  popularity: 95,
  gameType: 0,
  timeToBeat: { main: 60, extras: 150, full: 400 },
  source: 'igdb',
};

// Check if already in MongoDB
let game = await Game.findOne({ $or: [{ slug: 'genshin-impact' }, { 'externalIds.igdb': 119277 }] });
if (!game) {
  game = await Game.create(genshinData);
  console.log('Created Genshin Impact in MongoDB:', game._id);
} else {
  Object.assign(game, genshinData);
  await game.save();
  console.log('Updated Genshin Impact in MongoDB:', game._id);
}

// Seed validated trailers into MediaCache
const trailerPayload = {
  v: 3,
  pool: [
    {
      videoId: 'jEp9yyhwZFE',
      label: 'Gameplay trailer',
      score: 110,
      source: 'igdb',
      title: 'Genshin Impact - Official Gameplay Trailer',
      channel: 'Genshin Impact',
      views: 3500000,
    },
    {
      videoId: 'TAlKhARUcoY',
      label: 'Launch trailer',
      score: 95,
      source: 'igdb',
      title: 'Genshin Impact - Official Launch Trailer',
      channel: 'Genshin Impact',
      views: 5200000,
    },
    {
      videoId: '5DuZblVxG3I',
      label: 'Trailer',
      score: 80,
      source: 'igdb',
      title: 'Genshin Impact Announcement Trailer',
      channel: 'PlayStation',
      views: 2100000,
    },
  ],
  searched: false,
  evaluatedAt: new Date().toISOString(),
};

await MediaCache.findOneAndUpdate(
  { gameId: game._id, source: 'trailers' },
  {
    $set: {
      payload: trailerPayload,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  { upsert: true },
);
console.log('Seeded official trailers for Genshin Impact in MediaCache');

process.exit(0);
