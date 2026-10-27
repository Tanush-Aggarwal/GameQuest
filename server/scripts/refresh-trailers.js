/**
 * Pre-pick validated trailers for the most popular games, so the first visitor never waits for (or pays
 * quota for) the lookup.
 *
 *   npm run trailers:refresh -- --limit=300 [--budget=80] [--rescore]
 *
 * For each game: IGDB videos are validated with batched videos.list calls (1 quota unit per 50 ids).
 * Only games with no passing IGDB video use YouTube search (100 units per search call), and a run never
 * makes more than --budget search calls (default 80 = at most 8,000 of the 10,000 daily units). Games
 * that would need a search past the budget are skipped, not cached, so a later run picks them up.
 * Stops on a quota/key error. Also removes the old (version 1) trailer cache rows.
 *
 * --rescore: after the picking rules change (a CACHE_VERSION bump), re-rank every game's older cached pick from
 * its IGDB videos plus the videos it had already found, with videos.list only (1 unit per 50 ids) and NO searches,
 * so the whole top list is recomputed for a few dozen quota units. Games without an older pick are primed as usual.
 * Needs MONGODB_URI, YOUTUBE_API_KEY and (to backfill video names) TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET.
 */

import mongoose from 'mongoose';
import pino from 'pino';
import { loadConfig } from '../src/config/index.js';
import { Game } from '../src/models/Game.js';
import { MediaCache } from '../src/models/MediaCache.js';
import { createIgdbAdapter } from '../src/adapters/content/igdb.js';
import { createYoutubeAdapter, QUOTA_COST } from '../src/adapters/content/youtube.js';
import { createTrailerService } from '../src/services/trailerService.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit ? Number(hit.split('=')[1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const rescore = process.argv.includes('--rescore');
const limit = arg('limit', 300);
const budget = arg('budget', 80);

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const youtube = createYoutubeAdapter({ config });
if (!youtube.isConfigured()) {
  console.error('YOUTUBE_API_KEY must be set in server/.env.');
  process.exit(1);
}
const igdb = createIgdbAdapter({ config });
const logger = pino({ level: 'warn' });

try {
  await mongoose.connect(config.mongoUri);
  const service = createTrailerService({ Game, MediaCache, youtube, logger });

  const removed = await MediaCache.deleteMany({ source: 'youtube' }); // version 1 picks: recomputed by the new rules
  console.log(`removed ${removed.deletedCount} old (v1) trailer cache rows`);

  let games = await Game.find({ hidden: { $ne: true } }).sort({ popularity: -1, slug: 1 }).limit(limit).lean();
  console.log(`${games.length} most popular games`);

  // IGDB video names are only a hint, but keep them current: one cheap bulk call.
  if (igdb.isConfigured()) {
    try {
      const videos = await igdb.fetchVideos(games.filter((g) => g.externalIds?.igdb).map((g) => g.externalIds.igdb));
      let updated = 0;
      for (const g of games) {
        const meta = videos.get(g.externalIds?.igdb);
        if (!meta) continue;
        await Game.updateOne({ _id: g._id }, { $set: { videos: meta.map((m) => m.id), videoMeta: meta } });
        g.videos = meta.map((m) => m.id);
        g.videoMeta = meta;
        updated += 1;
      }
      console.log(`refreshed IGDB videos and names for ${updated} games`);
    } catch (err) {
      console.warn(`could not refresh IGDB videos (${err.message}); using what is stored`);
    }
  } else {
    console.warn('IGDB is not configured; using the videos already stored');
  }

  // One videos.list call per 50 candidate ids across all games.
  const olderPicks = new Map();
  if (rescore) {
    const rows = await MediaCache.find({ source: 'trailers', gameId: { $in: games.map((g) => g._id) } }).lean();
    for (const row of rows) olderPicks.set(String(row.gameId), (row.payload?.pool ?? []).map((p) => p.videoId));
  }
  const candidateIds = games.flatMap((g) => [...(g.videos ?? []), ...(olderPicks.get(String(g._id)) ?? [])]);
  const warmUnits = await service.warm(candidateIds);
  console.log(`validated ${new Set(candidateIds).size} IGDB candidate videos (${warmUnits} units)`);

  let searchesLeft = budget;
  let searchCalls = 0;
  const allowSearch = () => {
    if (searchesLeft <= 0) return false;
    searchesLeft -= 1;
    searchCalls += 1;
    return true;
  };

  const counts = { rescored: 0, cached: 0, igdb: 0, youtube: 0, none: 0, skipped: 0, failed: 0 };
  const changed = [];
  for (const game of games) {
    if (rescore) {
      const before = (await MediaCache.findOne({ gameId: game._id, source: 'trailers' }).lean())?.payload?.pool?.[0];
      const r = await service.rescoreGame(game);
      if (r.status === 'paused') {
        console.error('YouTube quota or key problem: stopping. Run again after the quota resets.');
        break;
      }
      if (r.status === 'rescored') {
        counts.rescored += 1;
        const after = (await MediaCache.findOne({ gameId: game._id, source: 'trailers' }).lean())?.payload?.pool?.[0];
        if (before?.videoId !== after?.videoId) changed.push({ title: game.title, from: before?.label, to: after?.label });
        continue;
      }
      if (r.status === 'failed') {
        counts.failed += 1;
        continue;
      }
    }
    const { status } = await service.primeGame(game, { allowSearch });
    if (status === 'paused') {
      console.error('YouTube quota or key problem: stopping. Run again after the quota resets.');
      break;
    }
    counts[status] += 1;
  }

  const total = youtube.usage();
  console.log('\nTrailers refreshed');
  console.log(`  games processed:          ${games.length}`);
  if (rescore) console.log(`  re-scored (older pick):   ${counts.rescored}, best pick changed for ${changed.length}`);
  console.log(`  already cached (current): ${counts.cached}`);
  console.log(`  trailer from IGDB:        ${counts.igdb}`);
  console.log(`  trailer from YouTube:     ${counts.youtube}`);
  console.log(`  no trailer passed:        ${counts.none}`);
  console.log(`  skipped (search budget):  ${counts.skipped}`);
  console.log(`  failed:                   ${counts.failed}`);
  for (const c of changed.slice(0, 15)) console.log(`    changed: ${c.title}: ${c.from ?? '-'} -> ${c.to ?? '-'}`);
  console.log(`  YouTube searches:         ${searchCalls} of ${budget} budgeted`);
  console.log(`  YouTube quota used:       ${total.units} units (${total.searches} searches x ${QUOTA_COST.search} + ${total.listCalls} list calls x ${QUOTA_COST.list})`);
} catch (err) {
  console.error('Trailer refresh failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
