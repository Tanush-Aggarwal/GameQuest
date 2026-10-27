// Time-to-beat rules shared by the IGDB adapter, every catalog write and every read.
//
// IGDB's game_time_to_beats fields, all in seconds:
//   hastily    = main story
//   normally   = main story + extras
//   completely = completionist
// Values are crowd-reported, so they can be missing, tiny samples, or out of order. Games without an ending
// (multiplayer-only, live service) get no hours at all: "time to beat Fortnite" means nothing.

const MAX_HOURS = 1000;
const LOW_SAMPLES = 3;

const ENDLESS_TITLES = new Set(
  [
    'fortnite',
    'apex legends',
    'valorant',
    'league of legends',
    'dota 2',
    'counter-strike 2',
    'counter-strike: global offensive',
    'pubg: battlegrounds',
    "playerunknown's battlegrounds",
    'overwatch 2',
    'overwatch',
    'rocket league',
    'warframe',
    'destiny 2',
    'marvel rivals',
    'call of duty: warzone',
    'rainbow six siege',
    "tom clancy's rainbow six siege",
    'team fortress 2',
    'dead by daylight',
    'the finals',
    'world of warcraft',
    'final fantasy xiv online',
    'runescape',
    'old school runescape',
    'eve online',
    'smite',
    'paladins',
    'brawlhalla',
    'fall guys',
    'among us',
    'rust',
    'dayz',
    'escape from tarkov',
    'phasmophobia',
    'lethal company',
    'deadlock',
    'hunt: showdown',
    'hunt: showdown 1896',
    'naraka: bladepoint',
    'xdefiant',
    'splitgate',
    'garry\'s mod',
    'roblox',
  ].map((t) => t.toLowerCase()),
);

const ENDLESS_GENRES = /\b(moba|battle royale|massively multiplayer|mmo)\b/i;
const ENDLESS_MODES = /\b(massively multiplayer|mmo|battle royale)\b/i;

const toHours = (seconds) => (Number.isFinite(seconds) && seconds > 0 ? Math.round((seconds / 3600) * 10) / 10 : null);

// IGDB row -> our shape. No cross-fallbacks: a missing field stays missing.
export function fromIgdbRow(row) {
  return {
    main: toHours(row.hastily),
    extras: toHours(row.normally),
    full: toHours(row.completely),
    samples: Number.isFinite(row.count) ? row.count : null,
  };
}

// True when a game has no ending to beat. Works on DB documents, DTOs and normalised IGDB games.
export function isEndlessGame(game = {}) {
  const title = String(game.title ?? game.name ?? '').trim().toLowerCase();
  if (ENDLESS_TITLES.has(title)) return true;
  const modes = (game.gameModes ?? []).map(String);
  const tags = [...(game.genres ?? []), ...(game.themes ?? [])].map(String);
  if (tags.some((t) => ENDLESS_GENRES.test(t))) return true;
  if (modes.some((m) => ENDLESS_MODES.test(m))) return true;
  // Competitive multiplayer only: modes are known, none is single player or co-op (co-op games like It Takes Two have a
  // campaign to finish), and one is multiplayer. Co-op games without an ending are covered by the title list.
  if (
    modes.length &&
    !modes.some((m) => /single player|co-operative/i.test(m)) &&
    modes.some((m) => /multiplayer/i.test(m))
  ) {
    return true;
  }
  return false;
}

const valid = (h) => (Number.isFinite(h) && h > 0 && h <= MAX_HOURS ? h : null);

// Cleans a { main, extras, full } triple. `legacySwap` repairs data written before the mapping fix, when main and extras
// were stored the wrong way round (main held "normally", extras held "hastily"): main > extras is then swapped back.
export function normalizeTimeToBeat(ttb, game = {}, { legacySwap = false } = {}) {
  const samples = Number.isFinite(ttb?.samples) ? ttb.samples : null;
  if (isEndlessGame(game)) return { main: null, extras: null, full: null, samples, endless: true, lowConfidence: false };

  let main = valid(ttb?.main);
  let extras = valid(ttb?.extras);
  let full = valid(ttb?.full);
  if (legacySwap && main != null && extras != null && main > extras) [main, extras] = [extras, main];

  // Keep only values that agree with each other: main <= extras <= full.
  if (main != null && extras != null && main > extras) extras = null;
  if (extras != null && full != null && extras > full) full = null;
  if (main != null && full != null && main > full) full = null;

  return {
    main,
    extras,
    full,
    samples,
    endless: false,
    lowConfidence: samples != null && samples < LOW_SAMPLES,
  };
}

// The hours a feature should plan with ("Under 10 hours", play-next, backlog estimate): main, else main + extras.
export function planningHours(game) {
  const t = game?.timeToBeat;
  if (!t || t.endless) return null;
  return valid(t.main) ?? valid(t.extras);
}
