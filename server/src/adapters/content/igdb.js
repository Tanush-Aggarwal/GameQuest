import { UpstreamError } from '../../utils/errors.js';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_URL = 'https://api.igdb.com/v4';
const GAME_FIELDS =
  'name,slug,summary,first_release_date,cover.image_id,genres.name,platforms.name,external_games.category,external_games.uid';
const HOUR = 3600;

// Escapes a user string for use inside an Apicalypse double-quoted literal.
const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const toHours = (seconds) => (typeof seconds === 'number' && seconds > 0 ? Math.round((seconds / HOUR) * 10) / 10 : null);

// IGDB external_games.category 1 = Steam.
const STEAM_CATEGORY = 1;

export function normaliseGame(raw) {
  const steam = raw.external_games?.find((e) => e.category === STEAM_CATEGORY)?.uid;
  return {
    title: raw.name,
    slug: raw.slug,
    summary: raw.summary ?? '',
    cover: raw.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${raw.cover.image_id}.jpg`
      : null,
    genres: (raw.genres ?? []).map((g) => g.name),
    platforms: (raw.platforms ?? []).map((p) => p.name),
    releaseDate: raw.first_release_date ? new Date(raw.first_release_date * 1000) : null,
    externalIds: { igdb: raw.id, ...(steam ? { steam: String(steam) } : {}) },
  };
}

// IGDB adapter (Twitch client-credentials). Only this module talks to IGDB.
// `fetchImpl` and `now` are injectable so tests never touch the network.
export function createIgdbAdapter({ config, fetchImpl = fetch, now = () => Date.now() }) {
  const { clientId, clientSecret } = config.twitch;
  let token = null; // { value, expiresAt }

  const isConfigured = () => Boolean(clientId && clientSecret);

  function assertConfigured() {
    if (!isConfigured()) {
      throw new UpstreamError(
        'IGDB is not configured: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in server/.env (create an app at dev.twitch.tv).',
      );
    }
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

  async function query(endpoint, body, retry = true) {
    assertConfigured();
    const accessToken = await getToken();
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
    if (res.status === 401 && retry) {
      token = null; // expired or revoked early: fetch a fresh one once
      return query(endpoint, body, false);
    }
    if (!res.ok) throw new UpstreamError(`IGDB request failed (HTTP ${res.status}).`);
    return res.json();
  }

  // Time to beat is a separate IGDB endpoint; failure leaves timeToBeat empty rather than failing the search.
  async function getTimeToBeat(igdbIds) {
    if (!igdbIds.length) return new Map();
    const rows = await query(
      'game_time_to_beats',
      `fields game_id,hastily,normally,completely; where game_id = (${igdbIds.join(',')}); limit ${igdbIds.length};`,
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

  return {
    name: 'igdb',
    isConfigured,

    async search(text, { limit = 20 } = {}) {
      const rows = await query('games', `search ${quote(text)}; fields ${GAME_FIELDS}; where version_parent = null; limit ${limit};`);
      return withTimeToBeat(rows.filter((r) => r.slug && r.name).map(normaliseGame));
    },

    async getById(igdbId) {
      const id = Number(igdbId);
      if (!Number.isInteger(id)) throw new UpstreamError('Invalid IGDB id.');
      const rows = await query('games', `fields ${GAME_FIELDS}; where id = ${id}; limit 1;`);
      const games = await withTimeToBeat(rows.filter((r) => r.slug && r.name).map(normaliseGame));
      return games[0] ?? null;
    },
  };
}
