import { NotFoundError, UpstreamError, ValidationError } from '../../utils/errors.js';

const API = 'https://api.steampowered.com';
const TIMEOUT_MS = 20_000;

// Steam web API adapter. Only this module talks to Steam. The API key travels in the query string,
// so errors are built from status codes and never from the request URL, and nothing here logs it.
// `fetchImpl` is injectable so tests never touch the network.
export function createSteamAdapter({ config, fetchImpl = fetch }) {
  const key = config.steam?.apiKey ?? null;
  const isConfigured = () => Boolean(key);

  function assertConfigured() {
    // Shown to end users, so it says nothing about server configuration; the setup hint lives in .env.example.
    if (!isConfigured()) throw new UpstreamError('Steam is not available right now. Try again later.');
  }

  // GET a Steam web API method. Returns { status, body } and throws UpstreamError only for failures
  // that mean "Steam is unusable right now"; callers decide what 4xx statuses mean.
  async function call(path, params) {
    assertConfigured();
    const url = `${API}/${path}/?${new URLSearchParams({ key, format: 'json', ...params })}`;
    let res;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new UpstreamError('Could not reach Steam. Try again in a moment.');
    }
    if (res.status === 429) throw new UpstreamError('Steam is rate limiting requests. Try again in a few minutes.');
    if (res.status >= 500) throw new UpstreamError(`Steam is unavailable right now (HTTP ${res.status}).`);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null; // some error statuses carry an HTML page
    }
    return { status: res.status, body };
  }

  const keyRejected = (status) => status === 401 || status === 403;

  return {
    name: 'steam',
    isConfigured,

    // Vanity name (steamcommunity.com/id/<name>) -> SteamID64.
    async resolveVanity(name) {
      const { status, body } = await call('ISteamUser/ResolveVanityURL/v0001', { vanityurl: name });
      if (keyRejected(status)) throw new UpstreamError('Steam rejected the API key configured for GameQuest.');
      const response = body?.response;
      if (response?.success !== 1 || !response.steamid) {
        throw new NotFoundError(`No Steam profile found for "${name}". Check the name or paste your SteamID64.`);
      }
      return String(response.steamid);
    },

    // Public profile details, or null when the SteamID64 does not exist.
    async getPlayerSummary(steamId) {
      const { status, body } = await call('ISteamUser/GetPlayerSummaries/v0002', { steamids: steamId });
      if (keyRejected(status)) throw new UpstreamError('Steam rejected the API key configured for GameQuest.');
      if (status >= 400) throw new ValidationError('Steam could not look up that SteamID64.');
      const player = body?.response?.players?.[0];
      if (!player) return null;
      return {
        steamId: String(player.steamid),
        personaName: player.personaname ?? '',
        avatar: player.avatarfull ?? player.avatarmedium ?? null,
        profileUrl: player.profileurl ?? null,
        // 3 = public, 2 = friends only, 1 = private
        visibility: player.communityvisibilitystate === 3 ? 'public' : player.communityvisibilitystate === 2 ? 'friends' : 'private',
      };
    },
  };
}
