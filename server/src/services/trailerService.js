import { isVideoId, QUOTA_COST } from '../adapters/content/youtube.js';
import { NotFoundError } from '../utils/errors.js';
import { rank } from './trailerPicker.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Bump when the picking rules change: cached picks with another version are ignored and recomputed.
export const CACHE_VERSION = 3;
const SOURCE = 'trailers';
const DISMISSED_SOURCE = 'trailer-dismissed';
const STATE_SOURCE = 'youtube-state';
const POOL_SIZE = 8; // validated survivors kept per game; the page shows the best MAX_SHOWN
const MAX_SHOWN = 3;
const MEMO_MAX_MS = 10 * MINUTE_MS; // the memo never outlives this, so other instances' and scripts' writes are seen
const DISMISSED_TTL_DAYS = 90; // reports and drops are kept this long (MediaCache TTL), then the pick starts fresh

const searchQueries = (title) => [`${title} official gameplay trailer`, `${title} official trailer`];

// Trailers for a game page. Pipeline: candidates (IGDB videos first; YouTube search only when no IGDB
// video passes) -> one videos.list check per 50 ids -> trailerPicker rejects and ranks -> the best 8
// are cached, the best 3 shown. Quota rules:
//  - a game costs at most one search round (up to two search calls) per 7 days; "nothing found" is
//    cached for 7 days too, a failed lookup for 6 hours;
//  - a 403/429 pauses every YouTube call for 24 hours, and the pause survives restarts;
//  - every search call counts against a daily ceiling shared by page views and the refresh script
//    (default 90 calls = 9,000 of the 10,000 units a day), so open registration cannot burn the quota:
//    past it, games without a validated IGDB video show nothing until the next UTC day;
//  - answers live in MediaCache and in a short process memo, so a slow or failing database cannot cause
//    repeat searches; concurrent requests for one game share one evaluation;
//  - with no API key nothing is shown: candidates cannot be validated, and unvalidated ones are never served.
// "Wrong trailer?": a report hides that video for the reporter at once; the video is dropped for everyone
// once `reportThreshold` different users reported it. Only videos in the game's pool can be reported.
export function createTrailerService({
  Game,
  MediaCache,
  youtube,
  logger,
  now = () => new Date(),
  ttlMs = 7 * DAY_MS,
  failureTtlMs = 6 * HOUR_MS,
  quotaBackoffMs = DAY_MS,
  detailsTtlMs = HOUR_MS,
  dailySearchCeiling = 90,
  reportThreshold = 2,
  maxDropped = 10,
}) {
  const inFlight = new Map();
  const memo = new Map(); // gameId -> { entry, expiresAt }
  const dismissedMemo = new Map(); // gameId -> { dropped: Set, reports: Map(videoId -> Set(userId)), expiresAt }
  const detailsCache = new Map(); // videoId -> { details | null, at }
  const state = { checkedAt: 0, day: '', searches: 0 }; // `day`/`searches` are only the fallback when the database fails
  const skippedUntil = new Map(); // gameId -> time: a game refused by the budget is not re-evaluated on every view
  let blockedUntil = 0;

  const clock = () => now().getTime();
  const today = () => now().toISOString().slice(0, 10);
  const isPaused = () => clock() < blockedUntil;
  const stateFilter = { source: STATE_SOURCE };

  // ── shared quota state: one document holds today's search count and the quota pause ───────────────
  // Every API instance and the refresh script reserve searches in the database, so the ceiling holds
  // across processes and restarts.

  // Picks up a pause set by another instance or the script (at most once a minute).
  async function refreshState() {
    if (state.checkedAt && clock() - state.checkedAt < MINUTE_MS) return;
    state.checkedAt = clock();
    try {
      const until = Date.parse((await MediaCache.findOne(stateFilter).lean())?.payload?.pausedUntil ?? '');
      if (until > blockedUntil) blockedUntil = until;
    } catch (err) {
      logger?.warn({ err }, 'could not read the YouTube quota state');
    }
  }

  async function persistPause() {
    try {
      await MediaCache.findOneAndUpdate(
        stateFilter,
        { $set: { 'payload.pausedUntil': new Date(blockedUntil).toISOString(), fetchedAt: now(), expiresAt: new Date(clock() + 5 * 365 * DAY_MS) } },
        { upsert: true },
      );
    } catch (err) {
      if (err?.code !== 11000) logger?.warn({ err }, 'could not store the YouTube quota pause');
    }
  }

  // Atomically takes one of today's searches (an $inc that only matches while the count is under the
  // ceiling), so two processes cannot both take the last one.
  async function reserveSearch() {
    const day = today();
    const reserve = () =>
      MediaCache.findOneAndUpdate(
        { source: STATE_SOURCE, 'payload.day': day, 'payload.searches': { $lt: dailySearchCeiling } },
        { $inc: { 'payload.searches': 1 } },
        { returnDocument: 'after' },
      );
    try {
      if (await reserve()) return true;
      const row = await MediaCache.findOne(stateFilter).lean();
      if (row?.payload?.day === day) return false; // today's searches are used up
      // First search of a new day (or ever): start the counter, keeping any pause. If another process
      // started it first the duplicate key is fine; reserving again then works.
      try {
        await MediaCache.findOneAndUpdate(
          { source: STATE_SOURCE, 'payload.day': { $ne: day } },
          {
            $set: {
              payload: { day, searches: 0, pausedUntil: row?.payload?.pausedUntil ?? null },
              fetchedAt: now(),
              expiresAt: new Date(clock() + 5 * 365 * DAY_MS),
            },
          },
          { upsert: true },
        );
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
      return Boolean(await reserve());
    } catch (err) {
      // Database trouble: count in this process, so the ceiling still holds per process.
      logger?.warn({ err }, 'could not reserve a YouTube search in the database');
      if (state.day !== day) Object.assign(state, { day, searches: 0 });
      if (state.searches >= dailySearchCeiling) return false;
      state.searches += 1;
      return true;
    }
  }

  // Asked before every search call: the caller's own budget (refresh script) first, so a refusal there
  // takes nothing from the daily count, then the daily ceiling.
  async function permitSearch(callerPermit) {
    if (callerPermit && !callerPermit()) return false;
    return reserveSearch();
  }

  // ── storage ────────────────────────────────────────────────────────────────────────────────────
  function remember(key, entry, ttl) {
    memo.set(key, { entry, expiresAt: clock() + Math.min(ttl, MEMO_MAX_MS) });
    if (memo.size > 5000) memo.delete(memo.keys().next().value);
  }

  async function store(game, entry, ttl) {
    remember(String(game._id), entry, ttl);
    try {
      await MediaCache.findOneAndUpdate(
        { gameId: game._id, source: SOURCE },
        { $set: { payload: entry, fetchedAt: now(), expiresAt: new Date(clock() + ttl) } },
        { upsert: true },
      );
    } catch (err) {
      if (err?.code !== 11000) logger?.warn({ err }, 'could not cache the trailer pick'); // 11000: a concurrent request stored it
    }
  }

  // undefined = nothing fresh is known; otherwise the cached entry ({ v, pool, ... }).
  async function readFresh(game) {
    const key = String(game._id);
    const local = memo.get(key);
    if (local && local.expiresAt > clock()) return local.entry;
    try {
      const row = await MediaCache.findOne({ gameId: game._id, source: SOURCE }).lean();
      if (row && new Date(row.expiresAt).getTime() > clock() && row.payload?.v === CACHE_VERSION) {
        remember(key, row.payload, new Date(row.expiresAt).getTime() - clock());
        return row.payload;
      }
    } catch (err) {
      logger?.warn({ err }, 'could not read the trailer cache');
    }
    return undefined;
  }

  const toDismissed = (payload) => ({
    dropped: new Set((payload?.dropped ?? []).filter(isVideoId)),
    reports: new Map(Object.entries(payload?.reports ?? {}).filter(([id]) => isVideoId(id)).map(([id, users]) => [id, new Set(users)])),
  });

  // Dropped videos and who reported what. An unreadable row is not remembered as "nothing dropped".
  async function readDismissed(game) {
    const key = String(game._id);
    const local = dismissedMemo.get(key);
    if (local && local.expiresAt > clock()) return local;
    let payload = null;
    let readable = true;
    try {
      payload = (await MediaCache.findOne({ gameId: game._id, source: DISMISSED_SOURCE }).lean())?.payload ?? null;
    } catch (err) {
      readable = false;
      logger?.warn({ err }, 'could not read dropped trailers');
    }
    const fresh = { ...toDismissed(payload), expiresAt: clock() + (readable ? MEMO_MAX_MS : 0) };
    if (readable) dismissedMemo.set(key, fresh);
    return fresh;
  }

  // What this viewer sees: not dropped for everyone, not reported by them.
  const visible = (entry, dismissed, userId) =>
    (entry?.pool ?? [])
      .filter((p) => !dismissed.dropped.has(p.videoId) && !(userId && dismissed.reports.get(p.videoId)?.has(String(userId))))
      .slice(0, MAX_SHOWN)
      .map(({ videoId, label, source }) => ({ videoId, label, source }));

  // ── YouTube details, shared across games for an hour ──────────────────────────────────────────
  async function getDetails(ids, meter) {
    const wanted = [...new Set(ids)].filter(isVideoId);
    const missing = wanted.filter((id) => {
      const hit = detailsCache.get(id);
      return !hit || clock() - hit.at > detailsTtlMs;
    });
    if (missing.length) {
      const found = await youtube.getVideos(missing);
      meter.listCalls += Math.ceil(missing.length / 50);
      for (const id of missing) detailsCache.set(id, { details: found.get(id) ?? null, at: clock() });
      if (detailsCache.size > 20000) detailsCache.delete(detailsCache.keys().next().value);
    }
    return new Map(wanted.map((id) => [id, detailsCache.get(id)?.details ?? null]));
  }

  // ── the pipeline ───────────────────────────────────────────────────────────────────────────────
  // Returns { entry, meter } or { skipped: 'budget' }. `allowSearch()` is the caller's own search budget
  // (the refresh script); the daily ceiling always applies on top of it.
  async function evaluate(game, { allowSearch, extraIds = [], noSearch = false } = {}) {
    const meter = { searches: 0, listCalls: 0 };
    const dismissed = await readDismissed(game);
    const names = new Map((game.videoMeta ?? []).map((m) => [m.id, m.name]));
    // The game's own IGDB videos, plus (when re-scoring) the videos of its previous pick. extraIds are judged as
    // search results, since that is where they came from.
    const own = new Set((game.videos ?? []).filter(isVideoId));
    const igdbIds = [...new Set([...own, ...extraIds.filter(isVideoId)])].filter((id) => !dismissed.dropped.has(id));

    const igdbDetails = await getDetails(igdbIds, meter);
    let { accepted } = rank(
      igdbIds.map((id) => ({ video: igdbDetails.get(id), source: own.has(id) ? 'igdb' : 'youtube', igdbName: names.get(id) })),
      game,
    );

    let searched = false;
    let cutShort = false; // the search budget ran out between the two queries
    if (!accepted.length && !noSearch) {
      const checked = new Set(igdbIds);
      let first = true;
      for (const query of searchQueries(game.title)) {
        if (!(await permitSearch(allowSearch))) {
          if (first) return { skipped: 'budget' };
          cutShort = true;
          break;
        }
        first = false;
        searched = true;
        meter.searches += 1;
        const hits = await youtube.search(query);
        const ids = hits.map((h) => h.videoId).filter((id) => !checked.has(id) && !dismissed.dropped.has(id));
        ids.forEach((id) => checked.add(id));
        const details = await getDetails(ids, meter);
        accepted = rank(ids.map((id) => ({ video: details.get(id), source: 'youtube' })), game).accepted;
        if (accepted.length) break;
      }
    }

    const pool = accepted.slice(0, POOL_SIZE).map(({ videoId, label, score, source, title, channel, views }) => ({ videoId, label, score, source, title, channel, views }));
    // "Nothing found" after only the first query is a partial answer: remembered, but not for a week.
    const partial = cutShort && !pool.length;
    return { entry: { v: CACHE_VERSION, pool, searched, ...(partial && { partial: true }), evaluatedAt: now().toISOString() }, meter };
  }

  const unitsOf = (meter) => meter.searches * QUOTA_COST.search + meter.listCalls * QUOTA_COST.list;

  // Evaluate once, cache the answer, never throw. Returns the cached entry, { skipped }, or null on failure/pause.
  async function evaluateAndCache(game, options) {
    const known = await readFresh(game); // another request may have answered while this one waited
    if (known !== undefined) return known;
    await refreshState();
    if (isPaused()) return null;
    try {
      const result = await evaluate(game, options);
      if (result.skipped) {
        // Remembered for a few minutes so every view of the game does not repeat the work and ask again.
        skippedUntil.set(String(game._id), clock() + MEMO_MAX_MS);
        if (skippedUntil.size > 5000) skippedUntil.delete(skippedUntil.keys().next().value);
        return result;
      }
      logger?.info(
        { slug: game.slug, units: unitsOf(result.meter), ...result.meter, picked: result.entry.pool.length, from: result.entry.pool[0]?.source ?? 'none', partial: Boolean(result.entry.partial) },
        'trailer evaluation',
      );
      await store(game, result.entry, result.entry.partial ? failureTtlMs : ttlMs);
      return result.entry;
    } catch (err) {
      if (err?.quota) {
        blockedUntil = clock() + quotaBackoffMs;
        await persistPause();
        logger?.error({ err }, 'youtube quota or key problem; trailer lookups paused for 24 hours');
      } else {
        logger?.warn({ err, slug: game.slug }, 'trailer evaluation failed');
      }
      await store(game, { v: CACHE_VERSION, pool: [], failed: true }, failureTtlMs);
      return null;
    }
  }

  async function findGame(slug) {
    const game = await Game.findOne({ slug }).lean();
    if (!game) throw new NotFoundError('Game not found');
    return game;
  }

  return {
    isPaused,

    // Up to 3 [{ videoId, label, source: 'igdb' | 'youtube' }], best first; [] when there is none. Never fails because of YouTube.
    async getTrailers(slug, userId) {
      const game = await findGame(slug);
      if ((skippedUntil.get(String(game._id)) ?? 0) > clock()) return []; // refused by the budget a moment ago
      const dismissed = await readDismissed(game);
      let entry = await readFresh(game);
      if (entry === undefined) {
        await refreshState();
        if (!youtube.isConfigured() || isPaused()) return [];
        const key = String(game._id);
        if (!inFlight.has(key)) inFlight.set(key, evaluateAndCache(game).finally(() => inFlight.delete(key)));
        entry = await inFlight.get(key);
      }
      return visible(entry, dismissed, userId);
    },

    // "Wrong trailer?": hides the video for the reporter at once, and for everyone once `reportThreshold`
    // different users reported it. Returns { trailers, changed, dropped }: the reporter's next list, whether
    // the report counted, and whether the video is now gone for everyone.
    async reportTrailer(userId, slug, videoId) {
      const game = await findGame(slug);
      const user = String(userId);
      const dismissed = await readDismissed(game);
      const entry = await readFresh(game);
      const reporters = dismissed.reports.get(videoId) ?? new Set();
      const unchanged = () => ({ trailers: visible(entry, dismissed, user), changed: false, dropped: dismissed.dropped.has(videoId) });
      if (!entry?.pool?.some((p) => p.videoId === videoId) || dismissed.dropped.has(videoId) || reporters.has(user)) return unchanged();

      reporters.add(user);
      dismissed.reports.set(videoId, reporters);
      let count = reporters.size;
      try {
        const row = await MediaCache.findOneAndUpdate(
          { gameId: game._id, source: DISMISSED_SOURCE },
          {
            $addToSet: { [`payload.reports.${videoId}`]: user }, // atomic: concurrent reports from other instances are not lost
            $set: { fetchedAt: now(), expiresAt: new Date(clock() + DISMISSED_TTL_DAYS * DAY_MS) }, // a drop expires: nothing is permanent
          },
          { upsert: true, returnDocument: 'after' },
        );
        count = row?.payload?.reports?.[videoId]?.length ?? count;
      } catch (err) {
        logger?.warn({ err }, 'could not store the trailer report'); // still counted in this process
      }

      let dropped = false;
      if (count >= reportThreshold && dismissed.dropped.size < maxDropped) {
        dismissed.dropped.add(videoId);
        dropped = true;
        try {
          await MediaCache.findOneAndUpdate({ gameId: game._id, source: DISMISSED_SOURCE }, { $addToSet: { 'payload.dropped': videoId } }, { upsert: true });
        } catch (err) {
          logger?.warn({ err }, 'could not store the dropped trailer');
        }
      }
      logger?.info({ userId: user, slug, videoId, reporters: count, dropped }, 'trailer reported as wrong');
      return { trailers: visible(entry, dismissed, user), changed: true, dropped };
    },

    // Re-rank a game's cached candidates under new scoring rules WITHOUT searching: the candidates are its IGDB
    // videos plus the videos of its previous pick, re-checked with videos.list (1 unit per 50 ids, shared across
    // games). Used after the rules change (a CACHE_VERSION bump) so existing picks are recomputed almost for free.
    // status: rescored | skipped (nothing older to rescore) | paused | failed
    async rescoreGame(game) {
      await refreshState();
      if (isPaused()) return { status: 'paused' };
      let old;
      try {
        old = (await MediaCache.findOne({ gameId: game._id, source: SOURCE }).lean())?.payload;
      } catch (err) {
        logger?.warn({ err }, 'could not read the trailer cache');
      }
      if (!old || old.v === CACHE_VERSION || old.failed || !Array.isArray(old.pool)) return { status: 'skipped' };
      try {
        const result = await evaluate(game, { extraIds: old.pool.map((p) => p.videoId), noSearch: true });
        // Nothing survived (videos gone or private): keep no row, so a normal visit or primeGame searches later.
        if (!result.entry.pool.length) return { status: 'skipped' };
        await store(game, result.entry, ttlMs);
        return { status: 'rescored', picked: result.entry.pool.length, first: result.entry.pool[0]?.label ?? null };
      } catch (err) {
        if (err?.quota) {
          blockedUntil = clock() + quotaBackoffMs;
          await persistPause();
          logger?.error({ err }, 'youtube quota or key problem; trailer lookups paused for 24 hours');
          return { status: 'paused' };
        }
        logger?.warn({ err, slug: game.slug }, 'trailer rescore failed');
        return { status: 'failed' };
      }
    },
    // For the refresh script: check many videos with few videos.list calls, then prime games one by one.
    async warm(ids) {
      const meter = { searches: 0, listCalls: 0 };
      await getDetails(ids, meter);
      return unitsOf(meter);
    },

    // status: cached | igdb | youtube | none | skipped | failed | paused
    async primeGame(game, options = {}) {
      if ((await readFresh(game)) !== undefined) return { status: 'cached' };
      await refreshState();
      if (isPaused()) return { status: 'paused' };
      const result = await evaluateAndCache(game, options);
      if (!result) return { status: isPaused() ? 'paused' : 'failed' };
      if (result.skipped) return { status: 'skipped' };
      return { status: result.pool[0]?.source ?? 'none', picked: result.pool.length };
    },
  };
}
