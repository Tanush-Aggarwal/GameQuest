/**
 * Re-checks every visible game's artwork against IGDB and replaces anything that does not match.
 *
 * Why: the demo seed once hand-typed IGDB image ids, and several pointed at other games (Cyberpunk 2077 showed the
 * Tetris box, Death Stranding showed The Last of Us). It also wrote override fields (coverImage, cardImage, heroImage,
 * bannerImage) that win over the real art. This script takes cover, artworks, screenshots and backdrop straight from
 * IGDB for each game's own IGDB id and clears the overrides, so every card and hero shows the right game.
 *
 * Safety: a game whose stored title does not match the title IGDB returns for its id is left alone and listed, so a
 * wrong id can never copy another game's art onto it. Games IGDB has no art for keep what they have (e.g. Steam art).
 *
 * Usage: npm run catalog:art -w server   (needs MONGODB_URI and TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET in server/.env)
 */

import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { createIgdbAdapter, normaliseGame } from '../src/adapters/content/igdb.js';

const BATCH = 500;
const OVERRIDES = ['coverImage', 'cardImage', 'heroImage', 'bannerImage'];
const norm = (t) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// "Hades" vs "Hades", "The Witcher 3: Wild Hunt" vs "The Witcher 3 Wild Hunt": equal after normalising, or one
// contains the other (IGDB sometimes adds or drops a subtitle).
const sameTitle = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)));
};

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

try {
  await mongoose.connect(config.mongoUri);
  const igdb = createIgdbAdapter({ config });
  if (!igdb.isConfigured()) {
    console.error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are missing in server/.env.');
    process.exit(1);
  }

  const games = await Game.find({ hidden: { $ne: true }, 'externalIds.igdb': { $type: 'number' } })
    .select(`title cover backdrop artworks screenshots externalIds.igdb ${OVERRIDES.join(' ')}`)
    .lean();
  console.log(`${games.length} visible games with an IGDB id. Checking their art against IGDB...`);

  const counts = { coversFixed: 0, backdropsFixed: 0, overridesCleared: 0, unchanged: 0, titleMismatch: 0, notOnIgdb: 0 };
  const fixedTitles = [];
  const mismatches = [];

  for (let i = 0; i < games.length; i += BATCH) {
    const batch = games.slice(i, i + BATCH);
    const raws = await igdb.fetchByIds(batch.map((g) => g.externalIds.igdb));
    const byId = new Map(raws.map((r) => [r.id, normaliseGame(r)]));
    const ops = [];

    for (const g of batch) {
      const fresh = byId.get(g.externalIds.igdb);
      if (!fresh) {
        counts.notOnIgdb += 1;
        continue;
      }
      if (!sameTitle(g.title, fresh.title)) {
        counts.titleMismatch += 1;
        mismatches.push(`${g.title}  (IGDB id ${g.externalIds.igdb} is "${fresh.title}")`);
        continue;
      }
      const $set = {};
      const $unset = {};
      if (fresh.cover && fresh.cover !== g.cover) {
        $set.cover = fresh.cover;
        counts.coversFixed += 1;
        fixedTitles.push(g.title);
      }
      if (fresh.backdrop && fresh.backdrop !== g.backdrop) {
        $set.backdrop = fresh.backdrop;
        counts.backdropsFixed += 1;
      }
      if (fresh.artworks.length) $set.artworks = fresh.artworks;
      if (fresh.screenshots.length) $set.screenshots = fresh.screenshots;
      const overrides = OVERRIDES.filter((f) => g[f]);
      for (const f of overrides) $unset[f] = '';
      if (overrides.length) counts.overridesCleared += 1;

      // Artworks/screenshots are refreshed only alongside a real fix, so a re-run reports "already correct".
      const changed = Boolean($set.cover || $set.backdrop || overrides.length);
      if (!changed) {
        counts.unchanged += 1;
        continue;
      }
      ops.push({ updateOne: { filter: { _id: g._id }, update: { ...(Object.keys($set).length && { $set }), ...(overrides.length && { $unset }) } } });
    }
    if (ops.length) await Game.bulkWrite(ops, { ordered: false });
    console.log(`  ${Math.min(i + BATCH, games.length)} / ${games.length} checked`);
  }

  if (fixedTitles.length) console.log(`\nCovers replaced (${fixedTitles.length}):\n  ${fixedTitles.slice(0, 60).join('\n  ')}`);
  if (mismatches.length) console.log(`\nLeft alone, the stored IGDB id belongs to another game (${mismatches.length}):\n  ${mismatches.join('\n  ')}`);
  console.log(
    `\nDone: ${counts.coversFixed} covers and ${counts.backdropsFixed} backdrops replaced, overrides cleared on ` +
      `${counts.overridesCleared} games, ${counts.unchanged} already correct, ${counts.notOnIgdb} not found on IGDB, ` +
      `${counts.titleMismatch} skipped for a title mismatch.`,
  );
} catch (err) {
  console.error('Art check failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
