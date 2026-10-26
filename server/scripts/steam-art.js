/**
 * Steam art fallback for the catalog: every visible game that has a Steam id but no cover or no
 * backdrop gets Steam CDN art (library_600x900_2x.jpg / library_hero.jpg, header.jpg as the last
 * resort). Each game is probed once and the answer is cached in MediaCache, so re-running is cheap.
 *
 * Usage: npm run catalog:steam-art   (needs MONGODB_URI in server/.env; no Steam key is used for the CDN)
 */

import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { MediaCache } from '../src/models/MediaCache.js';
import { createSteamAdapter } from '../src/adapters/platforms/steam.js';
import { createArtService } from '../src/services/artService.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// $in with null also matches a missing field
const empty = (field) => ({ [field]: { $in: [null, ''] } });

try {
  await mongoose.connect(config.mongoUri);
  const art = createArtService({ Game, MediaCache, steam: createSteamAdapter({ config }), logger: { warn: (o, m) => console.warn(m, o.slug ?? '') } });
  const missingBefore = { hidden: { $ne: true }, $or: [empty('backdrop'), empty('cover')] };
  const hasSteamId = { 'externalIds.steam': { $nin: [null, ''] } };
  const noSteamId = await Game.countDocuments({ ...missingBefore, 'externalIds.steam': { $in: [null, ''] } });
  const candidates = await Game.find({ ...missingBefore, ...hasSteamId }).lean();
  console.log(`${candidates.length} game(s) with a Steam id are missing a cover or backdrop (${noSteamId} more have no Steam id).`);

  let backdrops = 0;
  let covers = 0;
  let nothing = 0;
  let failed = 0;
  for (const game of candidates) {
    const failuresBefore = art.failureCount();
    const filled = await art.fillSteamArt(game);
    if (art.failureCount() > failuresBefore) {
      failed += 1; // the CDN could not be reached (or is cooling down): not the same as "no art there"
      console.log(`  ${game.title}: lookup failed`);
      continue;
    }
    const gotBackdrop = !game.backdrop && filled.backdrop;
    const gotCover = !game.cover && filled.cover;
    backdrops += gotBackdrop ? 1 : 0;
    covers += gotCover ? 1 : 0;
    if (!gotBackdrop && !gotCover) nothing += 1;
    console.log(`  ${game.title}: ${[gotCover && 'cover', gotBackdrop && 'backdrop'].filter(Boolean).join(' + ') || 'no Steam art'}`);
  }
  const stillNoBackdrop = await Game.countDocuments({ hidden: { $ne: true }, ...empty('backdrop') });
  console.log(`\nSteam art finished: ${backdrops} backdrops and ${covers} covers filled, ${nothing} game(s) with nothing on the CDN.`);
  if (failed) {
    console.log(`${failed} lookup(s) failed (Steam CDN unreachable). Nothing was cached for them; run the script again later.`);
    process.exitCode = 1;
  }
  console.log(`Visible games still without a backdrop: ${stillNoBackdrop}`);
} catch (err) {
  console.error('Steam art failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
