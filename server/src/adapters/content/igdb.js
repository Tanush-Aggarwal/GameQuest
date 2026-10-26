import { CATALOG_GAME_TYPES } from '@gamequest/shared';
import { UpstreamError } from '../../utils/errors.js';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_URL = 'https://api.igdb.com/v4';
const IMAGE_URL = 'https://images.igdb.com/igdb/image/upload';
const GAME_FIELDS = [
  'name',
  'slug',
  'summary',
  'storyline',
  'first_release_date',
  'total_rating',
  'total_rating_count',
  'game_type',
  'version_parent',
  'parent_game',
  'cover.image_id',
  'artworks.image_id',
  'screenshots.image_id',
  'videos.video_id',
  'genres.name',
  'themes.name',
  'game_modes.name',
  'platforms.name',
  'involved_companies.developer',
  'involved_companies.publisher',
  'involved_companies.company.name',
  'external_games.external_game_source', // `category` is deprecated and no longer returned
  'external_games.uid',
].join(',');
const HOUR = 3600;
const PAGE_SIZE = 500; // IGDB's maximum page size
const MAX_RETRIES = 5;
const RETRYABLE = new Set([429, 502, 503, 504]);

// Escapes a user string for use inside an Apicalypse double-quoted literal.
const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const toHours = (seconds) => (typeof seconds === 'number' && seconds > 0 ? Math.round((seconds / HOUR) * 10) / 10 : null);

// IGDB external_game_source 1 = Steam (the older `category` field used the same id).
const STEAM_SOURCE = 1;
const isSteam = (e) => (e.external_game_source ?? e.category) === STEAM_SOURCE;

// Platform ids used by the catalog import.
export const PLATFORM = { pc: 6, ps4: 48, ps5: 167, xboxOne: 49, xboxSeries: 169, switch: 130 };

// Catalog rule: a main-type game, not an edition of another game, with a cover. Everything else
// (DLC, expansion, bundle, mod, episode, season, update, pack, editions) is never a catalog game.
// The type/edition half of the rule: DLC, bundles, editions etc. fail it. Used on its own when
// repairing existing rows, where a main game with no cover must not be mistaken for a DLC.
export function isCatalogType(raw) {
  return CATALOG_GAME_TYPES.includes(raw.game_type) && (raw.version_parent === null || raw.version_parent === undefined);
}

export function isCatalogGame(raw) {
  return isCatalogType(raw) && Boolean(raw.cover?.image_id) && Boolean(raw.slug && raw.name);
}

// The game a DLC/edition belongs to (IGDB id), if any.
export const parentIgdbIdOf = (raw) => raw.version_parent ?? raw.parent_game ?? null;

export const igdbImageUrl = (imageId, size) => `${IMAGE_URL}/${size}/${imageId}.jpg`;

export function normaliseGame(raw) {
  const steam = raw.external_games?.find(isSteam)?.uid;
  const artworks = (raw.artworks ?? []).filter((a) => a.image_id).map((a) => igdbImageUrl(a.image_id, 't_1080p'));
  const screenshots = (raw.screenshots ?? []).filter((s) => s.image_id).map((s) => igdbImageUrl(s.image_id, 't_1080p'));
  const companies = raw.involved_companies ?? [];
  const names = (flag) => [...new Set(companies.filter((c) => c[flag] && c.company?.name).map((c) => c.company.name))];
  return {
    title: raw.name,
    slug: raw.slug,
    summary: raw.summary ?? '',
    storyline: raw.storyline ?? '',
    cover: raw.cover?.image_id ? igdbImageUrl(raw.cover.image_id, 't_cover_big_2x') : null,
    artworks,
    screenshots,
    videos: (raw.videos ?? []).map((v) => v.video_id).filter(Boolean),
    backdrop: artworks[0] ?? screenshots[0] ?? null,
    developer: names('developer'),
    publisher: names('publisher'),
    genres: (raw.genres ?? []).map((g) => g.name),
    themes: (raw.themes ?? []).map((t) => t.name),
    gameModes: (raw.game_modes ?? []).map((m) => m.name),
    platforms: (raw.platforms ?? []).map((p) => p.name),
    releaseDate: raw.first_release_date ? new Date(raw.first_release_date * 1000) : null,
    totalRating: typeof raw.total_rating === 'number' ? Math.round(raw.total_rating * 10) / 10 : null,
    totalRatingCount: raw.total_rating_count ?? 0,
    gameType: raw.game_type ?? null,
    externalIds: { igdb: raw.id, ...(steam ? { steam: String(steam) } : {}) },
  };
}

const typeFilter = `game_type = (${[...CATALOG_GAME_TYPES].sort((a, b) => a - b).join(',')}) & version_parent = null & cover != null`;

// IGDB adapter (Twitch client-credentials). Only this module talks to IGDB.
// `fetchImpl`, `now` and `sleep` are injectable so tests never touch the network or wait.
// IGDB allows 4 requests/second, so calls are spaced `minIntervalMs` apart; 429s back off and retry.
export function createIgdbAdapter({
  config,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minIntervalMs = 250,
}) {
  const { clientId, clientSecret } = config.twitch;
  let token = null; // { value, expiresAt }
  let nextSlot = 0;

  const isConfigured = () => Boolean(clientId && clientSecret);

  function assertConfigured() {
    if (!isConfigured()) {
      throw new UpstreamError(
        'IGDB is not configured: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in server/.env (create an app at dev.twitch.tv).',
      );
    }
  }

  async function throttle() {
    if (!minIntervalMs) return;
    const t = now();
    const wait = Math.max(0, nextSlot - t);
    nextSlot = Math.max(t, nextSlot) + minIntervalMs;
    if (wait) await sleep(wait);
  }

  async function getToken() {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const url = `${TOKEN_URL}?${new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    })}`;
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST' });
    } catch {
      throw new UpstreamError('Could not reach Twitch to authenticate with IGDB.');
    }
    if (!res.ok) throw new UpstreamError(`Twitch rejected the IGDB credentials (HTTP ${res.status}).`);
    const body = await res.json();
    token = { value: body.access_token, expiresAt: now() + body.expires_in * 1000 };
    return token.value;
  }

  async function query(endpoint, body, { refreshed = false, attempt = 0 } = {}) {
    assertConfigured();
    const accessToken = await getToken();
    await throttle();
    let res;
    try {
      res = await fetchImpl(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain' },
        body,
      });
    } catch {
      throw new UpstreamError('Could not reach IGDB.');
    }
    if (res.status === 401 && !refreshed) {
      token = null; // expired or revoked early: fetch a fresh one once
      return query(endpoint, body, { refreshed: true, attempt });
    }
    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 1000 * 2 ** attempt));
      return query(endpoint, body, { refreshed, attempt: attempt + 1 });
    }
    if (!res.ok) throw new UpstreamError(`IGDB request failed (HTTP ${res.status}).`);
    return res.json();
  }

  // Time to beat is a separate IGDB endpoint; failure leaves timeToBeat empty rather than failing the search.
  async function getTimeToBeat(igdbIds) {
    if (!igdbIds.length) return new Map();
    const rows = await query(
      'game_time_to_beats',
      `fields game_id,hastily,normally,completely; where game_id = (${igdbIds.join(',')}); limit ${Math.min(igdbIds.length, PAGE_SIZE)};`,
    );
    return new Map(
      rows.map((r) => [r.game_id, { main: toHours(r.normally ?? r.hastily), extras: toHours(r.hastily), full: toHours(r.completely) }]),
    );
  }

  async function withTimeToBeat(games) {
    const [times] = await Promise.allSettled([getTimeToBeat(games.map((g) => g.externalIds.igdb))]);
    const byId = times.status === 'fulfilled' ? times.value : new Map();
    return games.map((g) => (byId.has(g.externalIds.igdb) ? { ...g, timeToBeat: byId.get(g.externalIds.igdb) } : g));
  }

  const asIds = (ids) => ids.map(Number).filter(Number.isInteger);

  return {
    name: 'igdb',
    isConfigured,

    // Live search never returns DLC/bundles/editions: the filter runs in the query and again on the rows.
    async search(text, { limit = 20 } = {}) {
      const rows = await query('games', `search ${quote(text)}; fields ${GAME_FIELDS}; where ${typeFilter}; limit ${limit};`);
      return withTimeToBeat(rows.filter(isCatalogGame).map(normaliseGame));
    },

    async getById(igdbId) {
      const id = Number(igdbId);
      if (!Number.isInteger(id)) throw new UpstreamError('Invalid IGDB id.');
      const rows = await query('games', `fields ${GAME_FIELDS}; where id = ${id}; limit 1;`);
      const games = await withTimeToBeat(rows.filter((r) => r.slug && r.name).map(normaliseGame));
      return games[0] ?? null;
    },

    // ── bulk (catalog import / repair) ──────────────────────────────────────────────────────────
    // One page of raw games for an Apicalypse `where`; callers apply isCatalogGame to what they keep.
    async fetchPage({ where, sort = 'id asc', limit = PAGE_SIZE, offset = 0 }) {
      return query(
        'games',
        `fields ${GAME_FIELDS}; where ${where}; sort ${sort}; limit ${Math.min(limit, PAGE_SIZE)}; offset ${offset};`,
      );
    },

    // Raw games by IGDB id (up to 500), optionally narrowed by extra `where` terms. Ids IGDB does not know are absent.
    async fetchByIds(ids, { extraWhere = '' } = {}) {
      const list = asIds(ids);
      if (!list.length) return [];
      const where = `id = (${list.join(',')})${extraWhere ? ` & ${extraWhere}` : ''}`;
      return query('games', `fields ${GAME_FIELDS}; where ${where}; limit ${Math.min(list.length, PAGE_SIZE)};`);
    },

    // The catalog filter as an Apicalypse fragment, for building bulk `where` clauses.
    catalogWhere: typeFilter,

    // popularity_types name → id, resolved live so the importer never depends on hard-coded ids.
    async getPopularityTypes() {
      const rows = await query('popularity_types', 'fields id,name; limit 50;');
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },

    // Top rows of one popularity metric: [{ gameId, value }], highest first.
    async getPopularityTop(typeId, { limit = PAGE_SIZE, offset = 0 } = {}) {
      const rows = await query(
        'popularity_primitives',
        `fields game_id,value; where popularity_type = ${Number(typeId)}; sort value desc; limit ${Math.min(limit, PAGE_SIZE)}; offset ${offset};`,
      );
      return rows.map((r) => ({ gameId: r.game_id, value: r.value }));
    },

    // Metric values for specific games: Map(gameId → { [typeId]: value }).
    async getPopularityFor(gameIds, typeIds) {
      const ids = asIds(gameIds);
      const types = asIds(typeIds);
      const out = new Map();
      if (!ids.length || !types.length) return out;
      // Large id lists are split so the request body stays small (IGDB answers 413 otherwise).
      for (let start = 0; start < ids.length; start += PAGE_SIZE) {
        const batch = ids.slice(start, start + PAGE_SIZE);
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const rows = await query(
            'popularity_primitives',
            `fields game_id,popularity_type,value; where game_id = (${batch.join(',')}) & popularity_type = (${types.join(',')}); limit ${PAGE_SIZE}; offset ${offset};`,
          );
          for (const r of rows) {
            const byType = out.get(r.game_id) ?? {};
            byType[r.popularity_type] = r.value;
            out.set(r.game_id, byType);
          }
          if (rows.length < PAGE_SIZE) break;
        }
      }
      return out;
    },

    getTimeToBeat,
    withTimeToBeat,
  };
}
