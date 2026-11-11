/**
 * Banner art, screenshots and trailers for the whole catalog, in one run:
 *   1. games with no Steam app id: search the Steam store for the same game (exact title, a game not a DLC, release
 *      year within one) and link it, so the game gets Steam's art, screenshots and trailers;
 *   2. look up Steam's banner art (library hero) for every Steam game not looked up yet;
 *   3. write a report of the games that still have no proper banner art, no screenshots or no trailer to
 *      scratch/media-audit.csv, so an admin can fix those few by hand in the header editor.
 *
 * Usage: npm run catalog:media -w server [-- --all] [-- --limit=200]   (needs MONGODB_URI in server/.env)
 * Then:  npm run trailers:refresh -w server   picks trailers for games IGDB and Steam have none for.
 * Progress is saved per game; run it again to continue.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { createSteamAdapter } from '../src/adapters/platforms/steam.js';
import { createSteamHeroService } from '../src/services/steamHeroService.js';
import { createSteamMatchService } from '../src/services/steamMatchService.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const all = process.argv.includes('--all');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

try {
  await mongoose.connect(config.mongoUri);
  const steam = createSteamAdapter({ config });

  console.log('\n1. Linking games to their Steam app');
  const match = await createSteamMatchService({ Game, steam, log: console.log }).run({ all, limit });
  console.log(`   ${match.matched.length} linked, ${match.unmatched.length} with no exact Steam match, ${match.failed} failed`);

  console.log('\n2. Steam banner art');
  const heroes = await createSteamHeroService({ Game, steam, log: console.log }).run({ all });
  console.log(`   ${heroes.found + heroes.fromParent} found, ${heroes.none} without one`);

  console.log('\n3. Report');
  const games = await Game.find({ hidden: { $ne: true } })
    .select('title slug externalIds steamHero heroOverride artworks screenshots videos totalRatingCount')
    .sort({ totalRatingCount: -1 })
    .lean();
  const rows = [];
  for (const g of games) {
    const steamId = g.externalIds?.steam;
    const keyArt = Boolean(g.heroOverride?.url || g.steamHero || g.artworks?.length);
    const shots = Boolean(g.screenshots?.length || steamId);
    const trailer = Boolean(g.videos?.length || steamId);
    if (!keyArt || !shots || !trailer) rows.push([g.title, g.slug, steamId ?? '', keyArt ? '' : 'no key art', shots ? '' : 'no screenshots', trailer ? '' : 'no trailer']);
  }
  await mkdir('../scratch', { recursive: true });
  await writeFile(
    '../scratch/media-audit.csv',
    ['title,slug,steam,banner,screenshots,trailer', ...rows.map((r) => r.map(csv).join(','))].join('\n'),
  );
  const count = (i) => rows.filter((r) => r[i]).length;
  console.log(`   ${games.length} games: ${count(3)} with no key art (they use a screenshot), ${count(4)} with no screenshots, ${count(5)} with no trailer source`);
  console.log('   Most popular first in scratch/media-audit.csv. Fix the important ones in Admin > Games > Edit header.');
} catch (err) {
  console.error('Media run failed:', err.message);
  console.error('Progress is saved per game; run the command again to continue.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
