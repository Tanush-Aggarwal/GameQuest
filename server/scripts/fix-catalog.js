/**
 * Catalog repair — re-checks every Game already in the database against IGDB:
 *   - DLC / bundles / editions become hidden:true with parentGameId set
 *   - missing covers and backdrops (and other empty metadata) are filled
 *   - seeded slugs that differ from IGDB's are aligned (unless another game owns the slug)
 * Library entries pointing at a hidden game keep working and show the parent game's art.
 *
 * Usage: npm run catalog:fix   (needs MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET in server/.env)
 */

import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { MediaCache } from '../src/models/MediaCache.js';
import { createIgdbAdapter } from '../src/adapters/content/igdb.js';
import { createCatalogImportService } from '../src/services/catalogImportService.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const igdb = createIgdbAdapter({ config });
if (!igdb.isConfigured()) {
  console.error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in server/.env.');
  process.exit(1);
}

try {
  await mongoose.connect(config.mongoUri);
  const fixer = createCatalogImportService({ Game, MediaCache, igdb, log: console.log });
  const r = await fixer.runFix();
  console.log('\nCatalog fix finished');
  console.log(`  checked:            ${r.checked}`);
  console.log(`  hidden (DLC etc.):  ${r.hidden}`);
  console.log(`  parents linked:     ${r.parentsLinked}`);
  console.log(`  un-hidden:          ${r.unhidden}`);
  console.log(`  covers filled:      ${r.coversFilled}`);
  console.log(`  backdrops filled:   ${r.backdropsFilled}`);
  console.log(`  slugs aligned:      ${r.slugsFixed}`);
  console.log(`  titles repaired:    ${r.titlesFixed}`);
  console.log(`  unmatched on IGDB:  ${r.unmatched.length}${r.unmatched.length ? `  (${r.unmatched.join(', ')})` : ''}`);
  if (r.slugConflicts.length) console.log(`  slug conflicts (left as is): ${r.slugConflicts.join('; ')}`);
} catch (err) {
  console.error('Catalog fix failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
