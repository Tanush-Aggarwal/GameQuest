import { isVideoId } from '../adapters/content/youtube.js';
import { NotFoundError } from '../utils/errors.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SOURCE = 'youtube';

// Trailer for a game page. IGDB videos stored on the Game come first (no quota). Otherwise YouTube
// is searched, and EVERY attempt is remembered so a game costs at most one search per 7 days:
//  - a found video and "no result" are kept for 7 days;
//  - a failed call is kept for an hour, so a broken key cannot be hammered by page views;
//  - a quota/key error (403/429) stops every YouTube call for 24 hours, since it affects all games.
// Answers live in MediaCache and in a process-local memo; the memo keeps the guarantee even when the
// database is slow, stale or failing. Concurrent requests for one game share a single call.
export function createTrailerService({
  Game,
  MediaCache,
  youtube,
  logger,
  now = () => new Date(),
  ttlMs = 7 * DAY_MS,
  failureTtlMs = HOUR_MS,
  quotaBackoffMs = DAY_MS,
}) {
  const inFlight = new Map();
  const memo = new Map(); // gameId -> { videoId | null, expiresAt }
  let blockedUntil = 0;

  const rememberLocally = (key, videoId, ttl) => {
    memo.set(key, { videoId, expiresAt: now().getTime() + ttl });
    if (memo.size > 5000) memo.delete(memo.keys().next().value);
  };

  async function cacheAnswer(game, payload, ttl) {
    rememberLocally(String(game._id), payload.videoId, ttl);
    try {
      await MediaCache.findOneAndUpdate(
        { gameId: game._id, source: SOURCE },
        { $set: { payload, fetchedAt: now(), expiresAt: new Date(now().getTime() + ttl) } },
        { upsert: true },
      );
    } catch (err) {
      if (err?.code !== 11000) logger?.warn({ err }, 'could not cache the trailer answer'); // 11000: a concurrent request stored it
    }
  }

  // undefined = nothing fresh is known; otherwise the video id, or null for "no video / lookup failed".
  async function readFresh(game) {
    const key = String(game._id);
    const local = memo.get(key);
    if (local && local.expiresAt > now().getTime()) return local.videoId;
    try {
      const cached = await MediaCache.findOne({ gameId: game._id, source: SOURCE }).lean();
      if (cached && new Date(cached.expiresAt).getTime() > now().getTime()) {
        const videoId = isVideoId(cached.payload?.videoId) ? cached.payload.videoId : null;
        rememberLocally(key, videoId, new Date(cached.expiresAt).getTime() - now().getTime());
        return videoId;
      }
    } catch (err) {
      logger?.warn({ err }, 'could not read the trailer cache');
    }
    return undefined;
  }

  async function searchAndCache(game) {
    // Another request may have answered while this one waited for its turn.
    const known = await readFresh(game);
    if (known !== undefined) return known;
    if (now().getTime() < blockedUntil) return null;
    try {
      const hit = await youtube.searchTrailer(game.title);
      await cacheAnswer(game, { videoId: hit?.videoId ?? null }, ttlMs);
      return hit?.videoId ?? null;
    } catch (err) {
      if (err?.quota) {
        blockedUntil = now().getTime() + quotaBackoffMs;
        logger?.error({ err }, 'youtube quota or key problem; trailer searches paused for 24 hours');
      } else {
        logger?.warn({ err, slug: game.slug }, 'youtube trailer search failed');
      }
      await cacheAnswer(game, { videoId: null, failed: true }, failureTtlMs);
      return null;
    }
  }

  return {
    // { videoId, source: 'igdb' | 'youtube' } or null. Never fails because of YouTube.
    async getTrailer(slug) {
      const game = await Game.findOne({ slug }).lean();
      if (!game) throw new NotFoundError('Game not found');

      const own = (game.videos ?? []).find(isVideoId);
      if (own) return { videoId: own, source: 'igdb' };

      const known = await readFresh(game);
      if (known !== undefined) return known ? { videoId: known, source: 'youtube' } : null;
      if (!youtube.isConfigured()) return null; // nothing to cache: adding a key later should work at once
      if (now().getTime() < blockedUntil) return null;

      const key = String(game._id);
      if (!inFlight.has(key)) {
        inFlight.set(key, searchAndCache(game).finally(() => inFlight.delete(key)));
      }
      const videoId = await inFlight.get(key);
      return videoId ? { videoId, source: 'youtube' } : null;
    },
  };
}
