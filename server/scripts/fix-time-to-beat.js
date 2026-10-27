/**
 * Re-checks time to beat for every visible catalog game.
 *
 * Before this fix the IGDB adapter stored "normally" (main + extras) as the main story and "hastily" (main story) as
 * main + extras, so most games showed a main story longer than main + extras. Games with no ending (Fortnite, MOBAs,
 * battle royales, MMOs) also got hours.
 *
 * Default: re-fetches game_time_to_beats from IGDB in batches of 500 (needs TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET),
 * then applies the shared rules (order check, out-of-range values dropped, endless games cleared).
 * --local: no network; swaps the stored main/extras back where they are reversed and applies the same rules.
 *
 * Usage: npm run catalog:ttb            (or: npm run catalog:ttb -- --local)
 */

import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { createIgdbAdapter } from '../src/adapters/content/igdb.js';
import { normalizeTimeToBeat } from '../src/utils/timeToBeat.js';

const LOCAL = process.argv.includes('--local');
const BATCH = 500;

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const same = (a = {}, b = {}) => ['main', 'extras', 'full', 'endless', 'samples'].every((k) => (a[k] ?? null) === (b[k] ?? null));

try {
  await mongoose.connect(config.mongoUri);
  const igdb = createIgdbAdapter({ config });
  if (!LOCAL && !igdb.isConfigured()) {
    console.error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are missing. Add them to server/.env or run with --local.');
    process.exit(1);
  }

  const games = await Game.find({ hidden: { $ne: true } }).select('title genres themes gameModes timeToBeat externalIds.igdb').lean();
  console.log(`${games.length} visible games. Mode: ${LOCAL ? 'local repair (no IGDB calls)' : 'refresh from IGDB'}.`);

  const counts = { corrected: 0, unchanged: 0, endless: 0, noData: 0, partial: 0, failedBatches: 0 };
  const started = Date.now();

  for (let i = 0; i < games.length; i += BATCH) {
    const batch = games.slice(i, i + BATCH);
    let fresh = new Map();
    if (!LOCAL) {
      const ids = batch.map((g) => g.externalIds?.igdb).filter(Number.isInteger);
      try {
        fresh = await igdb.getTimeToBeat(ids);
      } catch (err) {
        counts.failedBatches += 1;
        console.warn(`  batch ${i / BATCH + 1} failed (${err.message}); keeping stored values for it`);
      }
    }

    const ops = [];
    for (const g of batch) {
      const source = !LOCAL && fresh.has(g.externalIds?.igdb) ? fresh.get(g.externalIds.igdb) : g.timeToBeat;
      // Stored rows may still be in the old (swapped) order; fresh IGDB rows never are.
      const legacySwap = LOCAL || !fresh.has(g.externalIds?.igdb);
      const { lowConfidence, ...clean } = normalizeTimeToBeat(source, g, { legacySwap });
      void lowConfidence;
      if (clean.endless) counts.endless += 1;
      else if (clean.main == null && clean.extras == null && clean.full == null) counts.noData += 1;
      else if (clean.main == null || clean.extras == null || clean.full == null) counts.partial += 1;

      if (same(g.timeToBeat, clean)) {
        counts.unchanged += 1;
        continue;
      }
      counts.corrected += 1;
      ops.push({ updateOne: { filter: { _id: g._id }, update: { $set: { timeToBeat: clean } } } });
    }
    if (ops.length) await Game.bulkWrite(ops, { ordered: false });
    console.log(`  ${Math.min(i + BATCH, games.length)} / ${games.length} checked`);
  }

  for (const title of ['Hollow Knight', 'The Witcher 3: Wild Hunt', 'Elden Ring', 'Hades', 'Fortnite']) {
    const g = await Game.findOne({ title, hidden: { $ne: true } }).select('title timeToBeat').lean();
    if (g) {
      const t = g.timeToBeat ?? {};
      console.log(`  ${g.title}: ${t.endless ? 'endless' : `main ${t.main ?? '-'} h, +extras ${t.extras ?? '-'} h, completionist ${t.full ?? '-'} h`}`);
    }
  }
  console.log(
    `\nDone in ${Math.round((Date.now() - started) / 1000)} s: ${counts.corrected} corrected, ${counts.unchanged} already right, ` +
      `${counts.endless} endless, ${counts.partial} with some values missing, ${counts.noData} with no data.`,
  );
  if (counts.failedBatches) {
    console.log(`${counts.failedBatches} IGDB batch(es) failed and kept their (locally repaired) values. Run again later.`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Time to beat fix failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
