import { NotFoundError } from '../utils/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Flat $set keys so a refresh never wipes externalIds from other sources or user-maintained fields.
function toUpsertUpdate(game, at) {
  const { slug, externalIds, timeToBeat, ...rest } = game;
  const $set = { ...rest, cachedAt: at };
  for (const [key, value] of Object.entries(externalIds ?? {})) $set[`externalIds.${key}`] = value;
  if (timeToBeat) for (const [key, value] of Object.entries(timeToBeat)) $set[`timeToBeat.${key}`] = value;
  // The slug is part of public URLs, so it is fixed when the game is first cached.
  return { $set, $setOnInsert: { slug } };
}

export const toGameDto = (g) => ({
  id: String(g._id),
  title: g.title,
  slug: g.slug,
  summary: g.summary ?? '',
  cover: g.cover ?? null,
  genres: g.genres ?? [],
  platforms: g.platforms ?? [],
  releaseDate: g.releaseDate ?? null,
  timeToBeat: { main: g.timeToBeat?.main ?? null, extras: g.timeToBeat?.extras ?? null, full: g.timeToBeat?.full ?? null },
  ratingAvg: g.ratingAvg ?? 0,
  ratingCount: g.ratingCount ?? 0,
});

// Cache-first catalog: MongoDB answers first; IGDB is only asked when local results run short.
export function createGameService({
  Game,
  igdb,
  logger,
  now = () => new Date(),
  ttlMs = 30 * DAY_MS, // blueprint: IGDB metadata TTL is 30 days
  searchCooldownMs = 10 * 60 * 1000,
}) {
  // Search terms recently sent to IGDB, so rare terms don't hit it on every keystroke/request.
  const recentRemote = new Map();
  // Same idea for stale-game refreshes, keyed by slug.
  const recentRefresh = new Map();

  async function upsertAll(games) {
    const at = now();
    const results = await Promise.allSettled(
      games.map((g) =>
        Game.findOneAndUpdate({ 'externalIds.igdb': g.externalIds.igdb }, toUpsertUpdate(g, at), { upsert: true, new: true }),
      ),
    );
    results.forEach((r) => {
      if (r.status === 'rejected') logger?.warn({ err: r.reason }, 'game upsert failed');
    });
  }

  async function fetchRemote(q, limit) {
    const key = q.toLowerCase();
    const last = recentRemote.get(key);
    if (last && now().getTime() - last < searchCooldownMs) return null;
    recentRemote.set(key, now().getTime());
    if (recentRemote.size > 500) recentRemote.delete(recentRemote.keys().next().value);

    const [result] = await Promise.allSettled([igdb.search(q, { limit })]);
    if (result.status === 'rejected') {
      recentRemote.delete(key); // allow a retry; a failure should not look like "no results"
      logger?.warn({ err: result.reason }, 'igdb search failed');
      return { failed: result.reason };
    }
    await upsertAll(result.value);
    return { failed: null };
  }

  function buildFilter({ q, genre, platform, maxHours, cursor }) {
    const filter = {};
    if (q) filter.$text = { $search: q };
    if (genre) filter.genres = genre;
    if (platform) filter.platforms = platform;
    if (maxHours) filter['timeToBeat.main'] = { $lte: maxHours };
    if (cursor) filter.slug = { $gt: cursor };
    return filter;
  }

  async function queryLocal(params) {
    const rows = await Game.find(buildFilter(params))
      .sort({ slug: 1 })
      .limit(params.limit + 1)
      .lean();
    const page = rows.slice(0, params.limit);
    return { items: page.map(toGameDto), nextCursor: rows.length > params.limit ? page[page.length - 1].slug : null };
  }

  return {
    // Never throws because of IGDB: a failing source shows up in `warnings` and local results still return.
    async search(params) {
      let result = await queryLocal(params);
      const warnings = [];
      if (params.q && !params.cursor && result.items.length < params.limit) {
        if (!igdb.isConfigured()) {
          warnings.push({ source: 'igdb', code: 'NOT_CONFIGURED', message: 'Game lookup is not configured; showing cached games only.' });
        } else {
          const remote = await fetchRemote(params.q, params.limit);
          if (remote?.failed) {
            warnings.push({ source: 'igdb', code: 'UPSTREAM_ERROR', message: 'Game lookup is unavailable right now; showing cached games only.' });
          } else if (remote) {
            result = await queryLocal(params);
          }
        }
      }
      return { ...result, warnings };
    },

    async getBySlug(slug) {
      let game = await Game.findOne({ slug }).lean();
      if (!game) throw new NotFoundError('Game not found');
      const igdbId = game.externalIds?.igdb;
      const stale = !game.cachedAt || now().getTime() - new Date(game.cachedAt).getTime() > ttlMs;
      const lastTry = recentRefresh.get(slug);
      const cooling = lastTry && now().getTime() - lastTry < searchCooldownMs;
      if (stale && !cooling && igdbId && igdb.isConfigured()) {
        // Remember the attempt even if it fails, so a flaky IGDB doesn't add latency to every view.
        recentRefresh.set(slug, now().getTime());
        if (recentRefresh.size > 500) recentRefresh.delete(recentRefresh.keys().next().value);
        const [fresh] = await Promise.allSettled([igdb.getById(igdbId)]);
        if (fresh.status === 'fulfilled' && fresh.value) {
          await upsertAll([fresh.value]);
          game = (await Game.findOne({ slug }).lean()) ?? game;
        } else if (fresh.status === 'rejected') {
          logger?.warn({ err: fresh.reason }, 'igdb refresh failed; serving stale game');
        }
      }
      return toGameDto(game);
    },
  };
}
