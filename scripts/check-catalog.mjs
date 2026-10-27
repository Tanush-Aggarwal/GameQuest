import { connectDb } from '../server/src/config/db.js';
import { Game } from '../server/src/models/Game.js';

await connectDb(process.env.MONGODB_URI, console);
const slugs = ['hollow-knight-silksong', 'elden-ring', 'hades-ii', 'clair-obscur-expedition-33', 'zenless-zone-zero'];
for (const s of slugs) {
  const g = await Game.findOne({ slug: s }).lean();
  console.log('---', s, '---');
  console.log('Title:', g?.title);
  console.log('Cover:', g?.cover);
  console.log('Backdrop:', g?.backdrop);
  console.log('Artworks:', g?.artworks);
  console.log('TotalRating:', g?.totalRating, 'RatingAvg:', g?.ratingAvg);
}
process.exit(0);
