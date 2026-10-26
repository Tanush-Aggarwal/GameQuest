/**
 * Catalog import — fills the Game collection with ~3,000 launcher-quality games from IGDB:
 *   1. top PC (Windows) games by IGDB / Steam popularity   (~1,500)
 *   2. top PS5 / PS4 / Xbox Series / Xbox One / Switch games by rating count   (~1,000)
 *   3. releases from the last 12 months and the next 3 months   (~500)
 *
 * Resumable and idempotent: progress lives in one MediaCache document and games are upserted by
 * IGDB id, so a crashed or interrupted run continues where it stopped. Use --fresh to start over.
 *
 * Usage: npm run catalog:import [-- --fresh]   (needs MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET in server/.env)
 */

import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { MediaCache } from '../src/models/MediaCache.js';
import { createIgdbAdapter } from '../src/adapters/content/igdb.js';
import { createCatalogImportService } from '../src/services/catalogImportService.js';

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (message) => console.log(`[${stamp()}] ${message}`);

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
  const importer = createCatalogImportService({ Game, MediaCache, igdb, log });
  const result = await importer.runImport({ fresh: process.argv.includes('--fresh') });

  console.log('\nCatalog import finished');
  for (const [name, state] of Object.entries(result.steps)) {
    const stored = state.pc ?? state.recent ?? Object.values(state.done ?? {}).reduce((a, b) => a + b, 0);
    console.log(`  ${name.padEnd(8)} ${String(stored).padStart(5)} games   ${state.seconds ?? 0}s`);
  }
  console.log(`  catalog size (visible): ${result.catalogSize}`);
  console.log(`  without a backdrop:     ${result.withoutBackdrop}`);
  console.log(`  total time:             ${result.seconds}s`);
} catch (err) {
  console.error('Catalog import failed:', err.message);
  console.error('Progress is saved; run `npm run catalog:import` again to resume.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
