import { isCatalogGame, isCatalogType, normaliseGame, parentIgdbIdOf, PLATFORM } from '../adapters/content/igdb.js';
import { toUpsertUpdate } from './gameService.js';

const SOURCE = 'catalog-import';
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PROGRESS_TTL_MS = 5 * YEAR_MS;

// Step sizes from the catalog brief: ~1,500 PC + ~1,000 console + ~500 current/upcoming.
export const DEFAULT_TARGETS = { pc: 1500, consolePerPlatform: 200, recent: 500 };
const CONSOLES = [
  { key: 'ps5', id: PLATFORM.ps5 },
  { key: 'ps4', id: PLATFORM.ps4 },
  { key: 'xboxSeries', id: PLATFORM.xboxSeries },
  { key: 'xboxOne', id: PLATFORM.xboxOne },
  { key: 'switch', id: PLATFORM.switch },
];

// Metric weights for the blended `popularity` score (0-100). Each metric is log-scaled against the
// largest value seen so a few mega-hits don't flatten everything else.
const WEIGHTS = { visits: 0.35, wantToPlay: 0.25, steamPeak: 0.25, ratingCount: 0.15 };
const norm = (value, max) => (value > 0 && max > 0 ? Math.log1p(value) / Math.log1p(max) : 0);

export function blendPopularity(metrics, maxima) {
  const score =
    WEIGHTS.visits * norm(metrics.visits, maxima.visits) +
    WEIGHTS.wantToPlay * norm(metrics.wantToPlay, maxima.wantToPlay) +
    WEIGHTS.steamPeak * norm(metrics.steamPeak, maxima.steamPeak) +
    WEIGHTS.ratingCount * norm(metrics.ratingCount, maxima.ratingCount);
  return Math.round(score * 1000) / 10;
}

// Word-overlap similarity (0-1) of two titles, ignoring case, accents, punctuation and roman numerals.
const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };
const titleTokens = (title) =>
  new Set(
    String(title)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((t) => ROMAN[t] ?? t),
  );
export function titleSimilarity(a, b) {
  const x = titleTokens(a);
  const y = titleTokens(b);
  const shared = [...x].filter((t) => y.has(t)).length;
  return shared / new Set([...x, ...y]).size || 0;
}
// Below this, a stored game and the IGDB game its id points at are treated as different games.
const SAME_GAME = 0.5;

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// Bulk catalog tooling: import (resumable, idempotent) and repair of games already in the database.
// Only the injected IGDB adapter talks to the network.
export function createCatalogImportService({
  Game,
  MediaCache,
  igdb,
  log = () => {},
  now = () => new Date(),
  targets = DEFAULT_TARGETS,
  pageSize = 500, // IGDB's maximum; tests use a small one to exercise paging
}) {
  const PAGE = pageSize;

  // ── persistence ──────────────────────────────────────────────────────────────────────────────
  // One MediaCache document keeps the import progress; its far-future expiry keeps the TTL index away.
  async function loadProgress() {
    const doc = await MediaCache.findOne({ source: SOURCE }).lean();
    return doc?.payload ?? null;
  }

  async function saveProgress(payload) {
    await MediaCache.findOneAndUpdate(
      { source: SOURCE },
      { $set: { payload, fetchedAt: now(), expiresAt: new Date(now().getTime() + PROGRESS_TTL_MS) } },
      { upsert: true },
    );
  }

  // Upserts by IGDB id. The slug is only set on insert; a clash on the unique slug or Steam id is
  // retried so one odd game never aborts a 3,000-game run.
  async function upsertGame(game, extra = {}) {
    const at = now();
    const attempt = (g) =>
      Game.findOneAndUpdate({ 'externalIds.igdb': g.externalIds.igdb }, toUpsertUpdate({ ...g, ...extra }, at), {
        upsert: true,
        returnDocument: 'after',
      });
    try {
      return await attempt(game);
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const key = JSON.stringify(err.keyPattern ?? err.message ?? '');
      if (key.includes('steam')) {
        const { steam, ...ids } = game.externalIds; // eslint-disable-line no-unused-vars
        return attempt({ ...game, externalIds: ids });
      }
      return attempt({ ...game, slug: `${game.slug}-${game.externalIds.igdb}` });
    }
  }

  // ── popularity ───────────────────────────────────────────────────────────────────────────────
  // Resolve metric ids by name so the importer never depends on hard-coded popularity_type ids.
  async function resolveMetricTypes() {
    const types = await igdb.getPopularityTypes();
    const find = (re) => types.find((t) => re.test(t.name ?? ''))?.id ?? null;
    const resolved = { visits: find(/visits/i), wantToPlay: find(/want to play/i), steamPeak: find(/peak/i) };
    log(`popularity metrics: ${JSON.stringify(resolved)}`);
    return resolved;
  }

  async function findMaxima(metricTypes) {
    const maxima = { visits: 0, wantToPlay: 0, steamPeak: 0, ratingCount: 0 };
    for (const key of ['visits', 'wantToPlay', 'steamPeak']) {
      if (!metricTypes[key]) continue;
      const [top] = await igdb.getPopularityTop(metricTypes[key], { limit: 1 });
      maxima[key] = top?.value ?? 0;
    }
    // total_rating_count of the most-rated game; a stable stand-in for "very popular".
    const [mostRated] = await igdb.fetchPage({ where: 'total_rating_count != null', sort: 'total_rating_count desc', limit: 1 });
    maxima.ratingCount = mostRated?.total_rating_count ?? 0;
    return maxima;
  }

  // Normalise accepted raw games, attach popularity + time to beat, upsert. Returns how many were stored.
  async function storeGames(rawGames, ctx) {
    const accepted = rawGames.filter(isCatalogGame);
    if (!accepted.length) return { stored: 0, ids: [] };
    const ids = accepted.map((r) => r.id);
    const metrics = ctx.metricTypes ? await igdb.getPopularityFor(ids, Object.values(ctx.metricTypes).filter(Boolean)) : new Map();
    const withTimes = await igdb.withTimeToBeat(accepted.map(normaliseGame));
    let stored = 0;
    for (const game of withTimes) {
      const raw = accepted.find((r) => r.id === game.externalIds.igdb);
      const byType = metrics.get(game.externalIds.igdb) ?? {};
      const popularity = blendPopularity(
        {
          visits: byType[ctx.metricTypes?.visits] ?? 0,
          wantToPlay: byType[ctx.metricTypes?.wantToPlay] ?? 0,
          steamPeak: byType[ctx.metricTypes?.steamPeak] ?? 0,
          ratingCount: raw?.total_rating_count ?? 0,
        },
        ctx.maxima,
      );
      try {
        await upsertGame(game, { popularity, hidden: false, parentGameId: null });
        stored += 1;
      } catch (err) {
        log(`  skipped ${game.title} (${game.externalIds.igdb}): ${err.message}`);
      }
    }
    return { stored, ids };
  }

  async function knownIgdbIds(ids) {
    const rows = await Game.find({ 'externalIds.igdb': { $in: ids } }).lean();
    return new Set(rows.map((g) => g.externalIds.igdb));
  }

  // ── steps ────────────────────────────────────────────────────────────────────────────────────
  // 1. Top PC games: candidates come from the Steam / IGDB popularity lists, then the catalog filter
  //    keeps only Windows games. `state.batch` is the resume point.
  async function stepPc(state, ctx) {
    const lists = [];
    for (const key of ['steamPeak', 'visits', 'wantToPlay']) {
      if (!ctx.metricTypes[key]) continue;
      const rows = [];
      for (let offset = 0; offset < 3000; offset += PAGE) {
        const page = await igdb.getPopularityTop(ctx.metricTypes[key], { limit: PAGE, offset });
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      lists.push(rows);
    }
    // Interleave the lists by rank so every metric contributes its best games first.
    const ordered = [];
    const seen = new Set();
    for (let rank = 0; rank < Math.max(0, ...lists.map((l) => l.length)); rank += 1) {
      for (const list of lists) {
        const id = list[rank]?.gameId;
        if (id && !seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
    log(`pc: ${ordered.length} candidate games from popularity lists`);

    const batches = chunk(ordered, PAGE);
    for (let i = state.batch ?? 0; i < batches.length && (state.pc ?? 0) < targets.pc; i += 1) {
      const raw = await igdb.fetchByIds(batches[i], { extraWhere: `${igdb.catalogWhere} & platforms = (${PLATFORM.pc})` });
      const room = targets.pc - (state.pc ?? 0);
      const { stored } = await storeGames(raw.slice(0, room), ctx);
      state.pc = (state.pc ?? 0) + stored;
      state.batch = i + 1;
      await ctx.checkpoint();
      log(`pc: batch ${i + 1}/${batches.length} → ${state.pc}/${targets.pc} games`);
    }
  }

  // 2. Top games per console by total_rating_count, skipping games earlier steps already stored.
  async function stepConsole(state, ctx) {
    state.done ??= {};
    for (const platform of CONSOLES) {
      let stored = state.done[platform.key] ?? 0;
      for (let offset = state.offsets?.[platform.key] ?? 0; stored < targets.consolePerPlatform && offset < PAGE * 6; offset += PAGE) {
        const raw = await igdb.fetchPage({
          where: `${igdb.catalogWhere} & platforms = (${platform.id}) & total_rating_count != null`,
          sort: 'total_rating_count desc',
          offset,
        });
        const known = await knownIgdbIds(raw.map((r) => r.id));
        const fresh = raw.filter((r) => !known.has(r.id)).slice(0, targets.consolePerPlatform - stored);
        stored += (await storeGames(fresh, ctx)).stored;
        state.done[platform.key] = stored;
        (state.offsets ??= {})[platform.key] = offset + PAGE;
        await ctx.checkpoint();
        log(`console ${platform.key}: ${stored}/${targets.consolePerPlatform} new games (scanned ${offset + raw.length})`);
        if (raw.length < PAGE) break;
      }
    }
  }

  // 3. Released in the last 12 months or due in the next 3, best by popularity.
  async function stepRecent(state, ctx) {
    const at = now().getTime();
    const from = Math.floor((at - YEAR_MS) / 1000);
    const to = Math.floor((at + 0.25 * YEAR_MS) / 1000);
    const candidates = [];
    for (let offset = 0; offset < PAGE * 10; offset += PAGE) {
      const page = await igdb.fetchPage({
        where: `${igdb.catalogWhere} & first_release_date >= ${from} & first_release_date <= ${to}`,
        sort: 'hypes desc',
        offset,
      });
      candidates.push(...page.filter(isCatalogGame));
      if (page.length < PAGE) break;
    }
    log(`recent: ${candidates.length} releases in the window`);
    const metrics = await igdb.getPopularityFor(
      candidates.map((c) => c.id),
      Object.values(ctx.metricTypes).filter(Boolean),
    );
    const score = (c) => {
      const m = metrics.get(c.id) ?? {};
      return blendPopularity(
        {
          visits: m[ctx.metricTypes.visits] ?? 0,
          wantToPlay: m[ctx.metricTypes.wantToPlay] ?? 0,
          steamPeak: m[ctx.metricTypes.steamPeak] ?? 0,
          ratingCount: c.total_rating_count ?? 0,
        },
        ctx.maxima,
      );
    };
    const top = candidates
      .map((c) => ({ c, s: score(c) + (c.hypes ?? 0) / 1000 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, targets.recent)
      .map((x) => x.c);
    for (const batch of chunk(top, 100)) {
      state.recent = (state.recent ?? 0) + (await storeGames(batch, ctx)).stored;
      await ctx.checkpoint();
    }
    log(`recent: ${state.recent ?? 0} games stored`);
  }

  const STEPS = [
    { name: 'pc', run: stepPc },
    { name: 'console', run: stepConsole },
    { name: 'recent', run: stepRecent },
  ];

  return {
    upsertGame,
    blendPopularity,

    // Runs every step that is not finished yet. Safe to re-run: upserts are idempotent and the
    // saved progress skips completed work. Pass `fresh: true` to ignore saved progress.
    async runImport({ fresh = false } = {}) {
      const startedAt = Date.now();
      const progress = (!fresh && (await loadProgress())) || { steps: {}, maxima: null };
      if (progress.finished && !fresh) {
        log('previous import already finished; re-running every step (use catalog:fix for repairs)');
        progress.steps = {};
        progress.finished = false;
      }
      const metricTypes = await resolveMetricTypes();
      progress.maxima ??= await findMaxima(metricTypes);
      const ctx = { metricTypes, maxima: progress.maxima, checkpoint: () => saveProgress(progress) };

      const totals = {};
      for (const step of STEPS) {
        const state = (progress.steps[step.name] ??= {});
        if (state.complete) {
          log(`${step.name}: already complete, skipping`);
        } else {
          log(`── ${step.name} ──`);
          const t0 = Date.now();
          await step.run(state, ctx);
          state.complete = true;
          state.seconds = Math.round((Date.now() - t0) / 1000);
          await saveProgress(progress);
        }
        totals[step.name] = state;
      }
      progress.finished = true;
      await saveProgress(progress);

      const total = await Game.countDocuments({ hidden: { $ne: true } });
      const noBackdrop = await Game.countDocuments({ hidden: { $ne: true }, $or: [{ backdrop: null }, { backdrop: { $exists: false } }] });
      return { steps: totals, catalogSize: total, withoutBackdrop: noBackdrop, seconds: Math.round((Date.now() - startedAt) / 1000) };
    },

    // ── repair of existing rows ────────────────────────────────────────────────────────────────
    // Re-checks every game with an IGDB id: DLC/bundles/editions become hidden (with parentGameId),
    // missing art is filled, popularity gets a number, and seeded slugs are aligned with IGDB.
    async runFix() {
      const report = { checked: 0, hidden: 0, unhidden: 0, coversFilled: 0, backdropsFilled: 0, slugsFixed: 0, titlesFixed: 0, parentsLinked: 0, unmatched: [], slugConflicts: [], suspects: [] };
      const all = await Game.find({}).lean();
      for (const batch of chunk(all, PAGE)) {
        const withId = batch.filter((g) => g.externalIds?.igdb);
        const raws = new Map((await igdb.fetchByIds(withId.map((g) => g.externalIds.igdb))).map((r) => [r.id, r]));
        for (const game of batch) {
          report.checked += 1;
          const raw = game.externalIds?.igdb ? raws.get(game.externalIds.igdb) : null;
          if (!raw) {
            report.unmatched.push(game.slug);
            if (game.popularity == null) await Game.updateOne({ _id: game._id }, { $set: { popularity: 0 } });
            continue;
          }
          const result = await this.fixOne(game, raw);
          if (result.suspect) {
            report.suspects.push(`${game.slug}: ${result.suspect}`);
            continue;
          }
          report.hidden += result.hidden ? 1 : 0;
          report.unhidden += result.unhidden ? 1 : 0;
          report.coversFilled += result.coverFilled ? 1 : 0;
          report.backdropsFilled += result.backdropFilled ? 1 : 0;
          report.slugsFixed += result.slugFixed ? 1 : 0;
          report.titlesFixed += result.titleFixed ? 1 : 0;
          report.parentsLinked += result.parentLinked ? 1 : 0;
          if (result.slugConflict) report.slugConflicts.push(`${game.slug} → ${result.slugConflict}`);
        }
      }
      return report;
    },

    async fixOne(game, raw) {
      const result = {};
      const $set = {};
      const incoming = normaliseGame(raw);

      // The stored IGDB id may point at an unrelated game (a bad seed id, say). Enriching, renaming or
      // hiding on that basis would corrupt the document, so leave it alone and report it.
      if (titleSimilarity(game.title, raw.name) < SAME_GAME) return { suspect: `${game.title} -> ${raw.name}` };
      const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

      if (!isCatalogType(raw)) {
        // A DLC, bundle, edition and the like: hide it and point at its parent.
        $set.hidden = true;
        $set.gameType = raw.game_type ?? null;
        const parentIgdb = parentIgdbIdOf(raw);
        if (parentIgdb) {
          let parent = await Game.findOne({ 'externalIds.igdb': parentIgdb }).lean();
          if (!parent) {
            const [parentRaw] = await igdb.fetchByIds([parentIgdb]);
            if (parentRaw && isCatalogGame(parentRaw)) parent = await upsertGame(normaliseGame(parentRaw), { hidden: false, popularity: 0 });
          }
          if (parent && String(parent._id) !== String(game._id)) {
            $set.parentGameId = parent._id;
            result.parentLinked = !game.parentGameId;
          }
        }
        result.hidden = !game.hidden;
        // A hidden DLC may still lack art; the parent's is shown instead, so only fill gaps from IGDB.
      } else {
        if (game.hidden) result.unhidden = true;
        $set.hidden = false;
        $set.gameType = raw.game_type;
        $set.parentGameId = null;
      }

      // Fill only what is missing: user-visible values from the seed or a refresh stay as they are.
      for (const key of ['cover', 'backdrop', 'summary', 'storyline', 'artworks', 'screenshots', 'videos', 'developer', 'publisher', 'themes', 'gameModes', 'genres', 'platforms', 'releaseDate']) {
        if (empty(game[key]) && !empty(incoming[key])) {
          $set[key] = incoming[key];
          if (key === 'cover') result.coverFilled = true;
          if (key === 'backdrop') result.backdropFilled = true;
        }
      }
      if (empty(game.backdrop) && empty(incoming.backdrop) && !empty(game.screenshots)) {
        $set.backdrop = game.screenshots[0];
        result.backdropFilled = true;
      }
      $set.totalRating = incoming.totalRating;
      $set.totalRatingCount = incoming.totalRatingCount;
      if (game.popularity == null) $set.popularity = 0;

      // Seeded slugs that differ from IGDB's: align them unless another game already owns the slug.
      if (incoming.slug && game.slug !== incoming.slug) {
        const owner = await Game.findOne({ slug: incoming.slug }).lean();
        if (owner && String(owner._id) !== String(game._id)) result.slugConflict = incoming.slug;
        else {
          $set.slug = incoming.slug;
          result.slugFixed = true;
        }
      }
      // A mis-decoded title (e.g. "RagnarÃ¶k"): take IGDB's spelling.
      if (/[ÃÂ][\u0080-¿]/.test(game.title ?? '') && incoming.title) {
        $set.title = incoming.title;
        result.titleFixed = true;
      }

      await Game.updateOne({ _id: game._id }, { $set });
      return result;
    },
  };
}
