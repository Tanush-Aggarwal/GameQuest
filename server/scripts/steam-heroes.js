/**
 * Steam banner art for the catalog: asks the Steam store which wide "library hero" image each Steam game has (newer
 * games keep it under a hashed folder, so the URL can't be guessed) and stores it on the game. Headers use it first.
 * Games never looked up are done by default; --all looks every Steam game up again. No Steam key is needed.
 *
 * Usage: npm run catalog:steam-heroes [-- --all]   (needs MONGODB_URI in server/.env)
 */
import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { createSteamAdapter } from '../src/adapters/platforms/steam.js';
import { createSteamHeroService } from '../src/services/steamHeroService.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

try {
  await mongoose.connect(config.mongoUri);
  const service = createSteamHeroService({ Game, steam: createSteamAdapter({ config }), log: console.log });
  const r = await service.run({ all: process.argv.includes('--all') });
  console.log(`\nDone: ${r.checked} checked, ${r.found} with their own hero, ${r.fromParent} from the parent app, ${r.none} without one.`);
} catch (err) {
  console.error('Steam hero lookup failed:', err.message);
  console.error('Progress is saved per batch; run the command again to continue.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
