// Decides which videos are good trailers for a game. Pure functions, no I/O: the trailer service feeds
// in `videos.list` details and gets back accepted candidates ranked best first, or a reason for each
// rejection. Everything here is deliberately strict: a missing trailer is better than a wrong one.

export const MIN_SECONDS = 30;
export const MAX_SECONDS = 8 * 60;
// A viewer in either of these regions must be able to watch it.
const REGIONS = ['IN', 'US'];

// ── text helpers ─────────────────────────────────────────────────────────────────────────────────
export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Roman numerals count as numbers ("Hades II" is a sequel). "V" and "X" are also ordinary letters
// ("Xbox Series X"), so they only count when the game's own title ends with them; "I" never does.
const ROMAN = { ii: 2, iii: 3, iv: 4, vi: 6, vii: 7, viii: 8, ix: 9, xi: 11, xii: 12 };
const WORD_ROMAN = { v: 5, x: 10 };
const SEP = '|';

// Tokens of a title. A subtitle separator (":", " - ", "|", brackets...) becomes a SEP token so the
// matcher can tell "Game: Subtitle" from "Game Subtitle".
function tokenise(text, lastRoman) {
  const marked = String(text ?? '').replace(/\s[-–—]\s|[:|•()[\]]|\s\/\s/g, ' zzsepzz ');
  return normalise(marked)
    .split(' ')
    .filter((t) => t && t !== 'the')
    .map((t) => (t === 'zzsepzz' ? SEP : (ROMAN[t] ?? (t === lastRoman ? WORD_ROMAN[t] : undefined))?.toString() ?? t));
}

// Splits tokens into words and the positions after which a separator came.
function words(tokens) {
  const list = [];
  const sepAfter = new Set();
  for (const t of tokens) {
    if (t === SEP) {
      if (list.length) sepAfter.add(list.length - 1);
    } else {
      list.push(t);
    }
  }
  return { list, sepAfter };
}

// Words that make a subtitle a mere edition label ("Java Edition", "Game of the Year Edition").
const EDITION_WORDS = new Set([
  'edition', 'version', 'java', 'bedrock', 'remastered', 'definitive', 'directors', 'cut', 'game', 'of', 'year', 'goty',
  'complete', 'deluxe', 'ultimate', 'enhanced', 'standard', 'legendary', 'anniversary', 'special', 'gold', 'premium', 'classic',
]);

// The game title as word sequences a video title may name: the full title, and the part before a
// subtitle separator only when it carries a number ("The Witcher 3: Wild Hunt" -> "witcher 3"). A
// number-less head ("God of War" for "God of War: Ragnarök") would accept the previous game's videos.
function titleVariants(title) {
  const lastWord = normalise(title).split(' ').at(-1);
  const lastRoman = WORD_ROMAN[lastWord] ? lastWord : null;
  const full = words(tokenise(title, lastRoman)).list;
  const variants = [full];
  const split = /^(.*?)(?:\s*[:–—]\s+|\s+-\s+)(.+)$/.exec(String(title));
  if (split) {
    const head = words(tokenise(split[1], lastRoman)).list;
    const subtitle = words(tokenise(split[2], lastRoman)).list;
    // "Minecraft: Java Edition" is named "Minecraft" everywhere: an edition-only subtitle may be dropped.
    const editionOnly = subtitle.includes('edition') && subtitle.every((t) => EDITION_WORDS.has(t));
    if (head.some((t) => /^\d+$/.test(t)) || editionOnly) variants.push(head);
  }
  return { variants: variants.filter((v) => v.length), full, lastRoman };
}

function occurrences(haystack, needle) {
  const found = [];
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((token, j) => haystack[i + j] === token)) found.push(i);
  }
  return found;
}

// What may follow the game's name without it being a different game: the end of the title, a subtitle
// separator, or a trailer/platform/quality word. Anything else ("Elden Ring Nightreign", "Journey to the
// Savage Planet", "Final Fantasy VII Remake") means the title is only a prefix of another game's name.
const FOLLOW_OK = new Set([
  'trailer', 'teaser', 'official', 'gameplay', 'launch', 'release', 'reveal', 'announcement', 'announce', 'cinematic',
  'story', 'overview', 'showcase', 'demo', 'new', 'live', 'action', 'cgi', 'e3', 'gamescom', 'tgs', 'tga', 'vgas', 'summer',
  'ps5', 'ps4', 'ps3', 'xbox', 'pc', 'steam', 'switch', 'nintendo', 'playstation', '4k', '8k', 'hd', 'uhd', '60fps', '1080p', '2160p',
  'early', 'access', 'extended', 'final', 'first', 'date', 'co', 'op', 'multiplayer', 'coop',
  'out', 'now', 'available', 'game', 'f2p', 'version', 'edition',
]);

const KIND_WORDS = new Set(['trailer', 'teaser', 'gameplay', 'reveal', 'announcement', 'launch', 'release', 'cinematic']);

// After "Game Name – " the first segment must be made of trailer-tag words only ("Official Launch
// Trailer", "Gameplay Reveal"). Any other word is a name: "Alyx", "Silksong", "Edgerunners", "Wild Rift",
// "Global Offensive Trailer" or "Modern Warfare 4" belong to another game.
function subtitleLooksLikeTrailerTag(v, from, sepAfter) {
  const segment = [];
  for (let i = from; i < v.length; i += 1) {
    segment.push(v[i]);
    if (sepAfter.has(i)) break;
  }
  if (!segment.some((t) => KIND_WORDS.has(t))) return false;
  return segment.every((t) => FOLLOW_OK.has(t) || KIND_WORDS.has(t) || /^\d+$/.test(t) || /^v\d+$/.test(t));
}

// ── rejection rules ──────────────────────────────────────────────────────────────────────────────
// Greek, Cyrillic, Armenian, Hebrew, Arabic and the Indic/Thai/Myanmar blocks, kana, CJK, Hangul.
const NON_LATIN =
  /[Ͱ-ϿЀ-ԯ԰-֏֐-ۿ܀-ࣿऀ-෿฀-໿က-႟぀-ヿ㐀-䶿一-鿿가-힯ｦ-ￜ]/;

// Checked on the title without the game's own name, so a game called "Spanish Fly" is not "in Spanish".
const LANGUAGE_WORDS = [
  /\b(espanol|spanish|latino|latam|castellano|doblado|subtitulado|dublado|dublagem|legendado|portugues|portuguese|deutsch|german|francais|french|vostfr|italiano|italian|russian|polski|polish|turkce|turkish|nederlands|dutch|svenska|swedish|indonesia|bahasa|arabic|hindi|tamil|telugu|vietsub|vietnamese|japanese|korean|chinese|thai|dub|dubbed)\b/,
  /\bpt ?br\b/,
  /\ben espanol\b|\bsub ?esp\b|\bcom legendas\b|\bem portugues\b/,
];
const BRACKET_TAG = /[[(]\s*(ru|es|pt|de|fr|jp|kr|cn|tr|latam)\s*[\])]/i;
// "no linguistic content" / unknown / multiple: not evidence of a non-English upload.
const NEUTRAL_LANGUAGES = new Set(['und', 'zxx', 'mul', 'mis']);

// Checked on the title without the game's own name, so "The Last of Us Part II" or "Top Spin 4" survive.
const HARD_REJECT = [
  [/\bdev(eloper)? diar(y|ies)\b/, 'developer diary'],
  [/\bbehind (the )?scenes\b/, 'behind the scenes'], // "the" is dropped when titles are tokenised
  [/\bmaking of\b/, 'making of'],
  [/\binterview\b/, 'interview'],
  [/\breview\b/, 'review'],
  [/\breact(ion|s|ing)?\b/, 'reaction'],
  [/\b(soundtrack|ost|music)\b/, 'soundtrack'],
  [/\bwalkthrough\b/, 'walkthrough'],
  [/\blets? play\b/, "let's play"],
  [/\bpart \d+\b/, 'part N'],
  [/\bspeed ?runs?\b/, 'speedrun'],
  [/\bmods?\b/, 'mod'],
  [/\bfan ?made\b|\bfan (film|game|trailer|remake)\b/, 'fan-made'],
  [/\bconcept\b/, 'concept'],
  [/\blive ?stream(ed)?\b/, 'livestream'],
  [/\bexplained\b/, 'explained'],
  [/\btier list\b/, 'tier list'],
  [/\b(comparison|breakdown|podcast|unboxing)\b/, 'commentary'],
  [/\btop \d+\b/, 'list video'],
  [/\b(full game|all cutscenes|game movie)\b/, 'full playthrough'],
  [/\b(dlc|expansion|season pass|add on)\b/, 'dlc'],
];

// ── what kind of video it is ─────────────────────────────────────────────────────────────────────
// Highest weight first; the first pattern that matches names the video.
const KINDS = [
  [/\bgameplay (trailer|reveal|teaser)\b/, 'Gameplay trailer', 50],
  [/\blaunch (trailer|teaser)\b/, 'Launch trailer', 40],
  [/\brelease (date )?(trailer|teaser)\b/, 'Release trailer', 38],
  [/\b(reveal|announcement|announce) (trailer|teaser)\b/, 'Reveal trailer', 35],
  [/\bcinematic (trailer|teaser)\b/, 'Cinematic trailer', 32],
  [/\btrailer\b/, 'Trailer', 30],
  [/\bgameplay\b/, 'Gameplay', 28],
  [/\bteaser\b/, 'Teaser', 24],
];

// Channels that publish official trailers; a game's own developer/publisher channel counts as well.
const OFFICIAL_CHANNELS = [
  'playstation', 'xbox', 'nintendo', 'ign', 'gamespot', 'bandai namco', 'ubisoft', 'electronic arts', 'ea', 'ea games',
  'cd projekt red', 'bethesda', 'rockstar games', 'capcom', 'sega', 'square enix', 'devolver digital', 'annapurna',
  'steam', 'activision', 'warner bros games', 'sony', 'microsoft', 'konami', 'take two', 'larian studios', 'fromsoftware',
  'supergiant games', 'valve', 'riot games', 'blizzard', 'epic games', 'paradox interactive', 'team17', 'thq nordic',
  'focus entertainment', 'deep silver', 'gearbox', '2k', 'atlus', 'koei tecmo', 'riot', 'mojang', 'devolver',
];
// Words a regional or corporate channel adds to the brand name ("Nintendo of America", "PlayStation Europe").
const CHANNEL_FILLER = new Set(['of', 'america', 'europe', 'uk', 'us', 'usa', 'eu', 'na', 'asia', 'official', 'channel', 'games', 'game', 'entertainment', 'tv', 'studios', 'studio', 'interactive']);

const COMPANY_SUFFIX = /\b(inc|ltd|llc|co|corp|corporation|gmbh|sa|plc|limited)\b/g;
const companyName = (name) => normalise(name).replace(COMPANY_SUFFIX, ' ').replace(/\s+/g, ' ').trim();

// "playstation europe" is the PlayStation brand; "playstation universe" is a fan site.
const extendsBrand = (long, brand) => long.startsWith(`${brand} `) && long.slice(brand.length + 1).split(' ').every((w) => CHANNEL_FILLER.has(w));
const sameBrand = (a, b) => a === b || extendsBrand(a, b) || extendsBrand(b, a);

function isOfficialChannel(channel, game) {
  const ch = companyName(channel);
  if (!ch) return false;
  const companies = [...(game.developer ?? []), ...(game.publisher ?? [])].map(companyName).filter((c) => c.length >= 3);
  return [...companies, ...OFFICIAL_CHANNELS.map(companyName)].some((name) => sameBrand(ch, name));
}

// ── assessing one video ──────────────────────────────────────────────────────────────────────────
// `video` is the adapter's getVideos() details; `game` needs title, developer[], publisher[].
// Returns { ok: true, label, score, ... } or { ok: false, reason }.
export function assess(video, game, { source = 'youtube', igdbName = '' } = {}) {
  const reject = (reason) => ({ ok: false, reason });
  if (!video) return reject('unavailable');
  if (video.privacy !== 'public') return reject('not public');
  if (video.uploadStatus && video.uploadStatus !== 'processed') return reject('not processed');
  if (!video.embeddable) return reject('not embeddable');

  const blocked = (video.regionBlocked ?? []).map((r) => r.toUpperCase());
  const allowed = video.regionAllowed ? video.regionAllowed.map((r) => r.toUpperCase()) : null;
  if (REGIONS.some((r) => blocked.includes(r))) return reject('blocked in IN or US');
  if (allowed && !REGIONS.every((r) => allowed.includes(r))) return reject('not available in IN and US');

  if (!(video.durationSec >= MIN_SECONDS)) return reject('too short');
  if (video.durationSec > MAX_SECONDS) return reject('too long');

  for (const lang of [video.defaultAudioLanguage, video.defaultLanguage]) {
    const code = String(lang ?? '').toLowerCase();
    if (code && !NEUTRAL_LANGUAGES.has(code) && !/^en([-_]|$)/.test(code)) return reject(`language ${lang}`);
  }

  const title = video.title ?? '';
  if (NON_LATIN.test(title)) return reject('non-Latin script');
  if (BRACKET_TAG.test(title)) return reject('language tag');

  // The title must name the game, and what follows the name must not make it a different game.
  const { variants, full, lastRoman } = titleVariants(game.title);
  const { list: v, sepAfter } = words(tokenise(title, lastRoman));
  const matches = variants.flatMap((variant, i) =>
    occurrences(v, variant).map((start) => ({ start, end: start + variant.length - 1, isHead: i > 0 })),
  );
  if (!matches.length) return reject('title does not name the game');
  const own = new Set(full.filter((t) => /^\d+$/.test(t)));
  let fit = null;
  let foreign = null;
  // Search results can be about a neighbouring game ("Bridge Constructor Portal", "Half-Life: Alyx"), so
  // they get a stricter reading than videos IGDB itself lists for this game.
  const strict = source === 'youtube';
  for (const m of matches) {
    const next = v[m.end + 1];
    const endsCleanly = next === undefined || FOLLOW_OK.has(next) || /^\d{4}$/.test(next) || /^v\d+$/.test(next);
    if (strict && !v.slice(0, m.start).every((t) => FOLLOW_OK.has(t) || /^\d+$/.test(t))) continue; // words before the name
    if (next !== undefined && /^\d{1,2}$/.test(next) && !own.has(next)) {
      foreign ??= next; // "Hades 2", "Witcher 4": a sequel
    } else if (endsCleanly) {
      fit = m;
      break;
    } else if (!m.isHead && sepAfter.has(m.end) && (!strict || subtitleLooksLikeTrailerTag(v, m.end + 1, sepAfter))) {
      // After the FULL name a separator is enough ("Elden Ring - Official Gameplay Trailer"). After only the
      // head of a subtitled name it is not: "The Witcher 3: Blood and Wine" is an expansion, not the game.
      fit = m;
      break;
    }
  }

  // The rejection words and languages are looked for in the title without the game's own name, so
  // "The Last of Us Part II" or "Top Spin 4" survive. They are checked before the "what follows the
  // name" verdict so the reason names the real problem ("developer diary", not "continues past the name").
  const around = fit ?? matches[0];
  const rest = [...v.slice(0, around.start), ...v.slice(around.end + 1)].join(' ');
  if (LANGUAGE_WORDS.some((re) => re.test(rest))) return reject('language tag');
  for (const [re, name] of HARD_REJECT) if (re.test(rest)) return reject(name);
  if (!fit) return reject(foreign ? `different number ${foreign}` : 'title continues past the game name');

  const kind = KINDS.find(([re]) => re.test(rest));
  if (!kind) return reject('not a trailer');

  const official = /\bofficial\b/.test(rest);
  const channelMatch = isOfficialChannel(video.channel, game);
  // A bare "gameplay" or "teaser" upload is only trusted from an official source.
  if (source === 'youtube' && kind[2] < 30 && !official && !channelMatch) return reject('no official signal');

  const hint = normalise(igdbName);
  // IGDB's own label is a mild signal that the video was curated as a trailer.
  const curated = source === 'igdb' && /\b(trailer|gameplay|launch|reveal|teaser)\b/.test(hint) ? 5 : 0;
  const score = kind[2] + (official ? 15 : 0) + (channelMatch ? 25 : 0) + Math.log10(video.views + 1) * 5 + curated;
  return {
    ok: true,
    videoId: video.videoId,
    label: kind[1],
    score: Math.round(score * 10) / 10,
    source,
    title,
    channel: video.channel,
    views: video.views,
    official,
    channelMatch,
  };
}

// Accepts and ranks candidates: [{ video, source, igdbName }] -> { accepted: [...best first], rejected: [{videoId, reason}] }.
export function rank(candidates, game) {
  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (const { video, source, igdbName } of candidates) {
    const id = video?.videoId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const result = assess(video, game, { source, igdbName });
    if (result.ok) accepted.push(result);
    else rejected.push({ videoId: id, title: video?.title ?? '', reason: result.reason });
  }
  accepted.sort((a, b) => b.score - a.score || b.views - a.views);
  return { accepted, rejected };
}
