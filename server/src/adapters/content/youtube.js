import { UpstreamError } from '../../utils/errors.js';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const TIMEOUT_MS = 8_000;

// YouTube video ids are 11 characters; anything else is never rendered into an embed URL.
export const isVideoId = (value) => typeof value === 'string' && /^[\w-]{11}$/.test(value);

// YouTube Data API adapter. Only this module talks to it. A search costs 100 quota units of the
// 10,000 a day, so callers cache every answer (see trailerService). The key is in the query string:
// errors are built from status codes, never from the URL. `fetchImpl` is injectable for tests.
export function createYoutubeAdapter({ config, fetchImpl = fetch }) {
  const key = config.youtube?.apiKey ?? null;
  const isConfigured = () => Boolean(key);

  return {
    name: 'youtube',
    isConfigured,

    // Top embeddable result for "<title> official trailer": { videoId } or null when there is none.
    async searchTrailer(title) {
      if (!isConfigured()) throw new UpstreamError('YouTube is not configured.');
      const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        videoEmbeddable: 'true',
        maxResults: '1',
        q: `${title} official trailer`,
        key,
      });
      let res;
      try {
        res = await fetchImpl(`${SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        throw new UpstreamError('Could not reach YouTube.');
      }
      // 403/429 mean the key or the daily quota is the problem, which affects every game: callers pause on `quota`.
      if (res.status === 403 || res.status === 429) {
        throw Object.assign(new UpstreamError(`YouTube quota or key problem (HTTP ${res.status}).`), { quota: true });
      }
      if (!res.ok) throw new UpstreamError(`YouTube request failed (HTTP ${res.status}).`);
      let body;
      try {
        body = await res.json();
      } catch {
        throw new UpstreamError('YouTube sent an unreadable answer.');
      }
      const videoId = body?.items?.[0]?.id?.videoId;
      return isVideoId(videoId) ? { videoId } : null;
    },
  };
}
