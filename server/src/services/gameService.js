import { NotFoundError } from '../utils/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Flat $set keys so a refresh never wipes externalIds from other sources or user-maintained fields.
export function toUpsertUpdate(game, at) {
  const { slug, externalIds, timeToBeat, ...rest } = game;
  const $set = { ...rest, cachedAt: at };
  // IGDB having no cover/backdrop must not wipe art filled in from another source (Steam CDN).
  for (const field of ['cover', 'backdrop']) if (!$set[field]) delete $set[field];
  for (const [key, value] of Object.entries(externalIds ?? {})) $set[`externalIds.${key}`] = value;
  if (timeToBeat) for (const [key, value] of Object.entries(timeToBeat)) $set[`timeToBeat.${key}`] = value;
  // The slug is part of public URLs, so it is fixed when the game is first cached.
  return { $set, $setOnInsert: { slug } };
}

export const toGameDto = (g) => {
  const coverImage = g.coverImage ?? g.cover ?? null;
  const heroImage = g.heroImage ?? g.backdrop ?? g.artworks?.[0] ?? null;
  const bannerImage = g.bannerImage ?? g.backdrop ?? g.screenshots?.[0] ?? g.artworks?.[0] ?? null;
  const cardImage = g.cardImage ?? g.coverImage ?? g.cover ?? g.backdrop ?? null;

  return {
    id: String(g._id),
    title: g.title,
    slug: g.slug,
    summary: g.summary ?? '',
    cover: coverImage,
    backdrop: heroImage,
    heroImage,
    bannerImage,
    coverImage,
    cardImage,
    artworks: g.artworks ?? [],
    screenshots: g.screenshots ?? [],
    videos: g.videos ?? [],
    videoMeta: g.videoMeta ?? [],
    developer: g.developer ?? [],
    publisher: g.publisher ?? [],
    genres: g.genres ?? [],
    themes: g.themes ?? [],
    gameModes: g.gameModes ?? [],
    platforms: g.platforms ?? [],
    storyline: g.storyline ?? '',
    releaseDate: g.releaseDate ?? null,
    timeToBeat: { main: g.timeToBeat?.main ?? null, extras: g.timeToBeat?.extras ?? null, full: g.timeToBeat?.full ?? null },
    totalRating: g.totalRating ?? null,
    totalRatingCount: g.totalRatingCount ?? 0,
    popularity: g.popularity ?? 0,
    gameType: g.gameType ?? null,
    ratingAvg: g.ratingAvg ?? 0,
    ratingCount: g.ratingCount ?? 0,
  };
};

// A hidden game (DLC, bundle, edition) that someone still has in their library shows its parent's art.
// Returns the same games with cover/backdrop/artworks/screenshots swapped in where a parent exists.
export async function withParentArt(Game, games) {
  const parentIds = [...new Set(games.filter((g) => g?.hidden && g.parentGameId).map((g) => String(g.parentGameId)))];
  if (!parentIds.length) return games;
  const parents = new Map((await Game.find({ _id: { $in: parentIds } }).lean()).map((p) => [String(p._id), p]));
  return games.map((g) => {
    const parent = g?.hidden && g.parentGameId ? parents.get(String(g.parentGameId)) : null;
    if (!parent) return g;
    return {
      ...g,
      cover: parent.cover ?? g.cover,
      backdrop: parent.backdrop ?? g.backdrop,
      artworks: parent.artworks?.length ? parent.artworks : g.artworks,
      screenshots: parent.screenshots?.length ? parent.screenshots : g.screenshots,
    };
  });
}

// Catalog order is popularity (highest first) then slug; the cursor carries both so paging is stable.
const encodeCursor = (g) => `${g.popularity ?? 0}~${g.slug}`;
function decodeCursor(cursor) {
  const at = cursor.indexOf('~');
  const popularity = Number(cursor.slice(0, at));
  return at > 0 && Number.isFinite(popularity) ? { popularity, slug: cursor.slice(at + 1) } : null;
}

const COVERS_TTL_MS = 60 * 60 * 1000;
const COVERS_POOL = 40; // the most popular covers kept for the collage (the schema's largest limit)

// Cache-first catalog: MongoDB answers first; IGDB is only asked when local results run short.
export function createGameService({
  Game,
  igdb,
  logger,
  friendService,
  LibraryEntry,
  User,
  artService,
  now =() => new Date(),
  ttlMs = 30 * DAY_MS, // blueprint: IGDB metadata TTL is 30 days
  searchCooldownMs = 10 * 60 * 1000,
}) {
  // Search terms recently sent to IGDB, so rare terms don't hit it on every keystroke/request.
  const recentRemote = new Map();
  // Same idea for stale-game refreshes, keyed by slug.
  const recentRefresh = new Map();
  // The public cover collage answer, kept for an hour so the (unauthenticated) endpoint costs the database almost nothing.
  let coversCache = { at: 0, items: [] };
  let coversLoading = null; // the query in flight, shared by concurrent requests

  async function upsertAll(games) {
    const at = now();
    const results = await Promise.allSettled(
      games.map((g) =>
        Game.findOneAndUpdate({ 'externalIds.igdb': g.externalIds.igdb }, toUpsertUpdate(g, at), { upsert: true, returnDocument: 'after' }),
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

  function buildFilter({ q, genre, platform, maxHours, minHours, minRating, releasedAfter, releasedBefore, sort, cursor }) {
    // DLC, bundles and editions are hidden from every catalog read.
    const filter = { hidden: { $ne: true } };
    if (q) filter.$text = { $search: q };
    if (genre) filter.genres = genre;
    if (platform) filter.platforms = platform;
    if (maxHours || minHours) {
      filter['timeToBeat.main'] = { ...(minHours && { $gte: minHours }), ...(maxHours && { $lte: maxHours }) };
    }
    if (minRating || sort === 'rating') filter.totalRating = { $gte: minRating ?? 1 }; // a rating sort leaves out unrated games
    if (releasedAfter || releasedBefore) {
      filter.releaseDate = { ...(releasedAfter && { $gte: releasedAfter }), ...(releasedBefore && { $lte: releasedBefore }) };
    }
    const after = cursor ? decodeCursor(cursor) : null;
    if (after) {
      filter.$or = [{ popularity: { $lt: after.popularity } }, { popularity: after.popularity, slug: { $gt: after.slug } }];
    }
    return filter;
  }

  async function queryLocal(params) {
    const byRating = params.sort === 'rating';
    const rows = await Game.find(buildFilter(params))
      .sort(byRating ? { totalRating: -1, slug: 1 } : { popularity: -1, slug: 1 })
      .limit(params.limit + 1)
      .lean();
    const page = rows.slice(0, params.limit);
    // the rating order is for shelves: no cursor, so no paging (the schema refuses a cursor with it)
    return { items: page.map(toGameDto), nextCursor: !byRating && rows.length > params.limit ? encodeCursor(page[page.length - 1]) : null };
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

    // Covers of the most popular catalog games, for the sign-in collage. Public art only: no ids, titles or slugs.
    // Always the same top COVERS_POOL, kept in memory for an hour (per process); a burst of cold requests shares one
    // query, and an empty answer is never kept (a fresh deployment fills up after its first search).
    async publicCovers({ limit }) {
      const stale = now().getTime() - coversCache.at >= COVERS_TTL_MS;
      if (stale && !coversLoading) {
        coversLoading = Game.find({ hidden: { $ne: true }, cover: { $ne: null } })
          .sort({ popularity: -1, slug: 1 })
          .limit(COVERS_POOL)
          .lean()
          .then((rows) => {
            const items = rows.map((g) => g.cover).filter(Boolean);
            coversCache = { at: items.length ? now().getTime() : 0, items };
          })
          .finally(() => {
            coversLoading = null;
          });
      }
      if (stale || !coversCache.items.length) await coversLoading;
      return { items: coversCache.items.slice(0, limit).map((cover) => ({ cover })) };
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
      if (artService) game = await artService.fillSteamArt(game); // never throws; a missing cover/backdrop gets Steam art
      const [display] = await withParentArt(Game, [game]);
      return toGameDto(display);
    },
    async getFriendsPlaying(userId, slug) {
      const game = await Game.findOne({ slug }).lean();
      if (!game) throw new NotFoundError('Game not found');
      if (!friendService || !LibraryEntry) return { items: [] };

      const friends = await friendService.listFriends(userId);
      if (!friends || !friends.length) return { items: [] };

      // Privacy filter: a friend whose profile is private never shows up in another user's game view.
      let visible = friends;
      if (User) {
        const owners = await User.find({ _id: { $in: friends.map((f) => f.id) } }).select('privacy').lean();
        const hidden = new Set(owners.filter((u) => u.privacy === 'private').map((u) => String(u._id)));
        visible = friends.filter((f) => !hidden.has(String(f.id)));
      }
      if (!visible.length) return { items: [] };

      const friendIds = visible.map((f) => f.id);
      const entries = await LibraryEntry.find({
        userId: { $in: friendIds },
        gameId: game._id,
        hiddenFromFriends: { $ne: true },
      }).lean();

      const friendMap = new Map(visible.map((f) => [String(f.id), f]));
      const items = entries.map((e) => {
        const friend = friendMap.get(String(e.userId));
        return {
          userId: String(e.userId),
          username: friend?.username ?? 'Friend',
          avatar: friend?.avatar ?? null,
          status: e.status,
          manualProgress: e.manualProgress ?? 0,
          completedAt: e.completedAt ?? null,
        };
      });

      return { items };
    },
  };
}
