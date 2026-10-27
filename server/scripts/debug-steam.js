/**
 * Shows exactly what Steam answers for one user's game, so a wrong playtime or missing achievements can be diagnosed.
 * Prints HTTP statuses and counts only; the API key is never printed.
 *
 * Usage: npm run steam:debug -w server -- <username> [appid]     (default appid 1623730 = Palworld)
 */
import dns from 'node:dns';
import mongoose from 'mongoose';

// Some ISP DNS servers time out on Atlas SRV lookups (querySrv ETIMEOUT); use public resolvers for this script.
dns.setServers(['8.8.8.8', '1.1.1.1']);
import { loadConfig } from '../src/config/index.js';
import { User } from '../src/models/User.js';

const [username = 'demo', appid = '1623730'] = process.argv.slice(2);
const config = loadConfig();
const key = config.steam.apiKey;
if (!key) throw new Error('STEAM_API_KEY is missing in server/.env');

async function get(path, params) {
  const url = `https://api.steampowered.com/${path}/?${new URLSearchParams({ key, format: 'json', ...params })}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

await mongoose.connect(config.mongoUri);
const user = await User.findOne({ username }).lean();
const steamId = user?.steam?.steamId;
console.log(`GameQuest user "${username}" -> linked SteamID64: ${steamId ?? '(not linked)'} (persona "${user?.steam?.personaName ?? ''}")`);
if (!steamId) process.exit(1);

const owned = await get('IPlayerService/GetOwnedGames/v0001', { steamid: steamId, include_appinfo: '1', include_played_free_games: '1' });
const game = owned.body?.response?.games?.find((g) => String(g.appid) === appid);
console.log(`GetOwnedGames: HTTP ${owned.status}, ${owned.body?.response?.game_count ?? 'no'} games; app ${appid}: ${game ? `${(game.playtime_forever / 60).toFixed(1)}h` : 'NOT in this account'}`);

const ach = await get('ISteamUserStats/GetPlayerAchievements/v0001', { steamid: steamId, appid, l: 'english' });
const list = ach.body?.playerstats?.achievements ?? [];
console.log(`GetPlayerAchievements: HTTP ${ach.status}, ${list.filter((a) => a.achieved === 1).length}/${list.length} unlocked, error: ${ach.body?.playerstats?.error ?? 'none'}`);

const stats = await get('ISteamUserStats/GetUserStatsForGame/v0002', { steamid: steamId, appid });
console.log(`GetUserStatsForGame: HTTP ${stats.status}, ${(stats.body?.playerstats?.achievements ?? []).length} achieved`);

const summary = await get('ISteamUser/GetPlayerSummaries/v0002', { steamids: steamId });
const p = summary.body?.response?.players?.[0];
console.log(`Profile: visibility ${p?.communityvisibilitystate === 3 ? 'public' : 'NOT public'}, persona "${p?.personaname}"`);
await mongoose.disconnect();
