/**
 * One-off repair for seeded games whose IGDB id in seed.js pointed at an unrelated game.
 * A catalog import / fix run then overwrote or enriched those documents with the wrong game's data.
 *
 * For every game listed in seed.js this resolves the correct IGDB id by title, restores the seeded
 * title, slug and cover, replaces the contaminated metadata with the correct game's, and removes a
 * duplicate imported document for the same IGDB game when nothing references it.
 *
 * Usage:  node --env-file=.env scripts/repair-seed-ids.js           (dry run, prints the plan)
 *         node --env-file=.env scripts/repair-seed-ids.js --apply   (writes)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { LibraryEntry } from '../src/models/LibraryEntry.js';
import { Review } from '../src/models/Review.js';
import { CollectionItem } from '../src/models/CollectionItem.js';
import { GameSession } from '../src/models/GameSession.js';
import { Recommendation } from '../src/models/Recommendation.js';
import { PlayLog } from '../src/models/PlayLog.js';
import { Activity } from '../src/models/Activity.js';
import { User } from '../src/models/User.js';
import { createIgdbAdapter } from '../src/adapters/content/igdb.js';

const apply = process.argv.includes('--apply');
const here = path.dirname(fileURLToPath(import.meta.url));

// The seed list: title, slug, igdb id and cover of every seeded game.
function readSeedGames() {
  const text = readFileSync(path.join(here, 'seed.js'), 'utf8');
  const starts = [...text.matchAll(/\n\s{2}\{\s*\n\s*title:/g)].map((m) => m.index);
  return starts
    .map((start, i) => {
      const block = text.slice(start, starts[i + 1] ?? text.indexOf('];', start));
      const title = /title:\s*(?:'([^']*)'|"([^"]*)")/.exec(block);
      const slug = /slug:\s*'([^']*)'/.exec(block);
      const igdb = /igdb:\s*(\d+)/.exec(block);
      const cover = /cover:\s*'([^']*)'/.exec(block);
      return title && slug && igdb ? { title: title[1] ?? title[2], slug: slug[1], igdb: Number(igdb[1]), cover: cover?.[1] ?? null } : null;
    })
    .filter(Boolean);
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };
const tokens = (s) => new Set(norm(s).split(' ').map((t) => ROMAN[t] ?? t).filter(Boolean));
function similarity(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  const shared = [...x].filter((t) => y.has(t)).length;
  return shared / new Set([...x, ...y]).size;
}

const config = loadConfig();
const igdb = createIgdbAdapter({ config });
await mongoose.connect(config.mongoUri);

const refModels = [LibraryEntry, Review, CollectionItem, GameSession, Recommendation, PlayLog, Activity];
async function referenceCount(gameId) {
  let n = 0;
  for (const Model of refModels) n += await Model.countDocuments({ gameId });
  n += await User.countDocuments({ favouriteGames: gameId });
  return n;
}

const seedGames = readSeedGames();
console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: ${seedGames.length} seeded games\n`);
const summary = { ok: 0, repaired: 0, noMatch: 0, kept: [] };

for (const seed of seedGames) {
  // Where is this seeded game now? By its (possibly wrong) IGDB id first, then by its seed slug.
  const doc = (await Game.findOne({ 'externalIds.igdb': seed.igdb })) ?? (await Game.findOne({ slug: seed.slug }));
  if (!doc) {
    console.log(`- ${seed.title}: no document, nothing to repair (run npm run seed)`);
    continue;
  }

  const candidates = (await igdb.search(seed.title, { limit: 15 })).filter((c) => similarity(c.title, seed.title) >= 0.6);
  candidates.sort((a, b) => similarity(b.title, seed.title) - similarity(a.title, seed.title) || b.totalRatingCount - a.totalRatingCount);
  const best = candidates[0];
  if (!best) {
    console.log(`- ${seed.title}: NO confident IGDB match; leaving as is`);
    summary.noMatch += 1;
    continue;
  }
  const correctId = best.externalIds.igdb;
  const clean = doc.externalIds?.igdb === correctId && !doc.hidden && similarity(doc.title, seed.title) >= 0.6;
  if (clean) {
    summary.ok += 1;
    console.log(`- ${seed.title}: already correct (igdb ${correctId})`);
    continue;
  }

  console.log(`- ${seed.title}: doc "${doc.title}" [${doc.slug}] igdb ${doc.externalIds?.igdb} -> correct ${correctId} "${best.title}" [${best.slug}]`);
  const duplicate = await Game.findOne({ 'externalIds.igdb': correctId, _id: { $ne: doc._id } });
  let dropDuplicate = false;
  let popularity = doc.popularity ?? 0;
  if (duplicate) {
    const refs = await referenceCount(duplicate._id);
    popularity = Math.max(popularity, duplicate.popularity ?? 0);
    dropDuplicate = refs === 0;
    console.log(`    duplicate document "${duplicate.title}" [${duplicate.slug}] has ${refs} references -> ${dropDuplicate ? 'delete it' : 'KEEP, cannot reuse this IGDB id'}`);
    if (!dropDuplicate) {
      summary.kept.push(seed.title);
      continue;
    }
  }
  const slugOwner = await Game.findOne({ slug: best.slug, _id: { $nin: [doc._id, duplicate?._id].filter(Boolean) } });
  const slug = slugOwner ? seed.slug : best.slug;

  if (apply) {
    if (dropDuplicate) await Game.deleteOne({ _id: duplicate._id });
    const { slug: _s, title: _t, externalIds, ...fields } = best; // eslint-disable-line no-unused-vars
    await Game.collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          ...fields,
          title: seed.title,
          slug,
          cover: seed.cover ?? best.cover,
          'externalIds.igdb': correctId,
          ...(externalIds.steam ? { 'externalIds.steam': externalIds.steam } : {}),
          hidden: false,
          parentGameId: null,
          popularity,
          cachedAt: new Date(),
        },
      },
    );
  }
  summary.repaired += 1;
}

console.log(`\n${apply ? 'Applied' : 'Would apply'}: ${summary.repaired} repaired, ${summary.ok} already correct, ${summary.noMatch} without a confident match`);
if (summary.kept.length) console.log(`Skipped (duplicate still referenced): ${summary.kept.join(', ')}`);
await mongoose.disconnect();
