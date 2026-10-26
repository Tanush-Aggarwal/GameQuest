import { NotFoundError, UpstreamError, ValidationError } from '../../utils/errors.js';

const API = 'https://api.steampowered.com';
const TIMEOUT_MS = 20_000;
const PROBE_TIMEOUT_MS = 5_000; // art is cosmetic: give up fast so a slow CDN never stalls a page or a sync
const CDN ='https://cdn.cloudflare.steamstatic.com/steam/apps';

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

  const PRIVATE_MESSAGE =
    'Your Steam game details are private. In Steam, open Edit Profile > Privacy Settings and set "Game details" to Public, then sync again.';

  async function getAchievements(steamId, appid) {
    const { status, body } = await call('ISteamUserStats/GetPlayerAchievements/v0001', { steamid: steamId, appid: String(appid) });
    // "Requested app has no stats" comes back as 400: the game simply has no achievements.
    if (status === 400) return { unlocked: null, total: null };
    if (status >= 400) throw new UpstreamError(`Steam would not return achievements (HTTP ${status}).`);
    const list = body?.playerstats?.achievements;
    if (!Array.isArray(list) || !list.length) return { unlocked: null, total: null };
    return { unlocked: list.filter((a) => a.achieved === 1).length, total: list.length };
  }

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

    // Owned games including free ones. A private profile answers with an empty `response`, which is
    // reported as a clear, fixable error rather than "you own no games".
    async getOwnedGames(steamId) {
      const { status, body } = await call('IPlayerService/GetOwnedGames/v0001', {
        steamid: steamId,
        include_appinfo: '1',
        include_played_free_games: '1',
      });
      if (keyRejected(status)) throw new UpstreamError('Steam rejected the API key configured for GameQuest.');
      if (status >= 400) throw new UpstreamError(`Steam would not return your games (HTTP ${status}).`);
      const response = body?.response;
      if (!response || (response.game_count === undefined && !Array.isArray(response.games))) throw new UpstreamError(PRIVATE_MESSAGE);
      return (response.games ?? []).map((g) => ({
        appid: String(g.appid),
        name: g.name ?? '',
        playtimeMin: g.playtime_forever ?? 0,
        playtime2wMin: g.playtime_2weeks ?? 0,
        lastPlayedAt: g.rtime_last_played > 0 ? new Date(g.rtime_last_played * 1000) : null,
      }));
    },

    getAchievements,

    // Steam CDN art for an appid, no API key involved. Cover: library_600x900_2x.jpg; backdrop:
    // library_hero.jpg; header.jpg is the last resort for whichever is missing. Returns
    // { cover, backdrop } with null for what the CDN does not have. A network failure throws, so a
    // caller never caches "no art" because of a bad moment.
    async probeArt(appid) {
      const id = String(appid);
      if (!/^\d+$/.test(id)) return { cover: null, backdrop: null };
      const exists = async (file) => {
        const url = `${CDN}/${id}/${file}`;
        let res;
        try {
          res = await fetchImpl(url, { method: 'HEAD', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        } catch {
          throw new UpstreamError('Could not reach the Steam CDN.');
        }
        if (res.status >= 500 || res.status === 429) throw new UpstreamError(`The Steam CDN is unavailable (HTTP ${res.status}).`);
        return res.ok ? url : null;
      };
      const [cover, backdrop] = await Promise.all([exists('library_600x900_2x.jpg'), exists('library_hero.jpg')]);
      if (cover && backdrop) return { cover, backdrop };
      const header = await exists('header.jpg');
      return { cover: cover ?? header, backdrop: backdrop ?? header };
    },

    // Achievements for many games, `size` at a time. A game that fails is left out of `results`
    // (and counted in `failed`) so one bad response never fails the sync.
    async getAchievementsBatch(steamId, appids, { size = 10, onProgress } = {}) {
      const results = new Map();
      let failed = 0;
      for (let start = 0; start < appids.length; start += size) {
        const batch = appids.slice(start, start + size);
        const settled = await Promise.allSettled(batch.map((appid) => getAchievements(steamId, appid)));
        settled.forEach((r, i) => {
          if (r.status === 'fulfilled') results.set(batch[i], r.value);
          else failed += 1;
        });
        onProgress?.(Math.min(start + size, appids.length), appids.length);
      }
      return { results, failed };
    },
  };
}
