import { UpstreamError } from '../../utils/errors.js';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const TIMEOUT_MS = 10_000;
const VIDEOS_PER_CALL = 50; // videos.list takes up to 50 ids and costs 1 quota unit per call

// Quota units per call: search.list is expensive, videos.list is almost free.
export const QUOTA_COST = { search: 100, list: 1 };

// YouTube video ids are 11 characters; anything else is never rendered into an embed URL.
export const isVideoId = (value) => typeof value === 'string' && /^[\w-]{11}$/.test(value);

// "PT1H2M3S" -> seconds (live streams and malformed values give null).
export function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso ?? ''));
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [d, h, min, s] = m.slice(1).map((v) => Number(v ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

// YouTube Data API adapter. Only this module talks to it. The key is in the query string, so errors
// are built from status codes, never from the URL. `fetchImpl` is injectable for tests.
// `usage()` reports the quota units spent by this adapter instance, so callers can log them.
export function createYoutubeAdapter({ config, fetchImpl = fetch }) {
  const key = config.youtube?.apiKey ?? null;
  const isConfigured = () => Boolean(key);
  const used = { units: 0, searches: 0, listCalls: 0 };

  async function get(url, params, cost) {
    if (!isConfigured()) throw new UpstreamError('YouTube is not configured.');
    let res;
    try {
      res = await fetchImpl(`${url}?${new URLSearchParams({ ...params, key })}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new UpstreamError('Could not reach YouTube.');
    }
    // A request that reached YouTube costs quota even when it fails (except network errors above).
    used.units += cost;
    // 403/429 mean the key or the daily quota is the problem, which affects every game: callers pause on `quota`.
    if (res.status === 403 || res.status === 429) {
      throw Object.assign(new UpstreamError(`YouTube quota or key problem (HTTP ${res.status}).`), { quota: true });
    }
    if (!res.ok) throw new UpstreamError(`YouTube request failed (HTTP ${res.status}).`);
    try {
      return await res.json();
    } catch {
      throw new UpstreamError('YouTube sent an unreadable answer.');
    }
  }

  return {
    name: 'youtube',
    isConfigured,
    usage: () => ({ ...used }),

    // Up to 10 embeddable English-leaning videos for a query: [{ videoId, title, channel }].
    async search(query, { maxResults = 10 } = {}) {
      used.searches += 1;
      const body = await get(
        SEARCH_URL,
        {
          part: 'snippet',
          type: 'video',
          videoEmbeddable: 'true',
          videoCategoryId: '20', // Gaming
          relevanceLanguage: 'en',
          regionCode: 'US',
          maxResults: String(maxResults),
          q: query,
        },
        QUOTA_COST.search,
      );
      return (body?.items ?? [])
        .filter((i) => isVideoId(i?.id?.videoId))
        .map((i) => ({ videoId: i.id.videoId, title: i.snippet?.title ?? '', channel: i.snippet?.channelTitle ?? '' }));
    },

    // Details for many videos, 50 ids per call: Map(videoId -> details). Ids YouTube does not return
    // (deleted, private) are simply absent.
    async getVideos(ids) {
      const unique = [...new Set(ids.filter(isVideoId))];
      const out = new Map();
      for (let start = 0; start < unique.length; start += VIDEOS_PER_CALL) {
        used.listCalls += 1;
        const body = await get(
          VIDEOS_URL,
          { part: 'snippet,contentDetails,status,statistics', id: unique.slice(start, start + VIDEOS_PER_CALL).join(','), maxResults: String(VIDEOS_PER_CALL) },
          QUOTA_COST.list,
        );
        for (const v of body?.items ?? []) {
          if (!isVideoId(v?.id)) continue;
          const restriction = v.contentDetails?.regionRestriction;
          out.set(v.id, {
            videoId: v.id,
            title: v.snippet?.title ?? '',
            channel: v.snippet?.channelTitle ?? '',
            durationSec: parseDuration(v.contentDetails?.duration),
            embeddable: v.status?.embeddable === true,
            privacy: v.status?.privacyStatus ?? null,
            uploadStatus: v.status?.uploadStatus ?? null,
            regionBlocked: restriction?.blocked ?? null,
            regionAllowed: restriction?.allowed ?? null,
            defaultLanguage: v.snippet?.defaultLanguage ?? null,
            defaultAudioLanguage: v.snippet?.defaultAudioLanguage ?? null,
            views: Number(v.statistics?.viewCount ?? 0) || 0,
          });
        }
      }
      return out;
    },
  };
}
