import { assess, normalise, rank } from '../services/trailerPicker.js';

// A video as the adapter's getVideos() returns it; every field a good trailer needs is set by default.
const id = (s) => s.padEnd(11, 'x').slice(0, 11);
const vid = (key, title, extra = {}) => ({
  videoId: id(key),
  title,
  channel: 'Some Channel',
  durationSec: 120,
  embeddable: true,
  privacy: 'public',
  uploadStatus: 'processed',
  regionBlocked: null,
  regionAllowed: null,
  defaultLanguage: null,
  defaultAudioLanguage: null,
  views: 100_000,
  ...extra,
});

const witcher = { title: 'The Witcher 3: Wild Hunt', developer: ['CD PROJEKT RED'], publisher: ['CD PROJEKT RED'] };
const hades = { title: 'Hades', developer: ['Supergiant Games'], publisher: ['Supergiant Games'] };
const gta5 = { title: 'Grand Theft Auto V', developer: ['Rockstar North'], publisher: ['Rockstar Games'] };
const bg3 = { title: "Baldur's Gate 3", developer: ['Larian Studios'], publisher: ['Larian Studios'] };

const reasonFor = (video, game) => {
  const r = assess(video, game);
  return r.ok ? 'accepted' : r.reason;
};

describe('the Witcher 3 case: a developer diary is not a trailer', () => {
  const candidates = [
    // what IGDB's first video was
    { video: vid('diary', 'The Witcher 3: Wild Hunt – Developer Diary: Creating the Sound', { channel: 'CD PROJEKT RED', views: 900_000 }), source: 'igdb', igdbName: 'Developer Diary' },
    { video: vid('launch', 'The Witcher 3: Wild Hunt – Launch Trailer', { channel: 'CD PROJEKT RED', views: 5_000_000 }), source: 'igdb', igdbName: 'Launch trailer' },
    { video: vid('gamepl', 'The Witcher 3: Wild Hunt – Official Gameplay Trailer', { channel: 'CD PROJEKT RED', views: 7_000_000 }), source: 'igdb', igdbName: 'Gameplay video' },
  ];

  it('rejects the diary and ranks the gameplay trailer first', () => {
    const { accepted, rejected } = rank(candidates, witcher);
    expect(rejected).toEqual([expect.objectContaining({ videoId: id('diary'), reason: 'developer diary' })]);
    expect(accepted.map((a) => [a.videoId, a.label])).toEqual([
      [id('gamepl'), 'Gameplay trailer'],
      [id('launch'), 'Launch trailer'],
    ]);
  });
});

describe('hard validation', () => {
  it.each([
    ['not public', { privacy: 'unlisted' }],
    ['not public', { privacy: 'private' }],
    ['not processed', { uploadStatus: 'uploaded' }],
    ['not embeddable', { embeddable: false }],
    ['blocked in IN or US', { regionBlocked: ['US'] }],
    ['blocked in IN or US', { regionBlocked: ['DE', 'IN'] }],
    ['not available in IN and US', { regionAllowed: ['US'] }],
    ['not available in IN and US', { regionAllowed: ['GB', 'DE'] }],
    ['too short', { durationSec: 29 }],
    ['too short', { durationSec: null }], // a live stream has no duration
    ['too long', { durationSec: 8 * 60 + 1 }],
    ['language es', { defaultAudioLanguage: 'es' }],
    ['language pt-BR', { defaultLanguage: 'pt-BR' }],
    ['language ja', { defaultAudioLanguage: 'ja' }],
  ])('rejects: %s', (reason, extra) => {
    expect(reasonFor(vid('v', 'Hades - Launch Trailer', extra), hades)).toBe(reason);
  });

  it('accepts the edges: exactly 30 s and 8 min, English-tagged, available in both regions', () => {
    expect(reasonFor(vid('a', 'Hades - Launch Trailer', { durationSec: 30 }), hades)).toBe('accepted');
    expect(reasonFor(vid('b', 'Hades - Launch Trailer', { durationSec: 480 }), hades)).toBe('accepted');
    expect(reasonFor(vid('c', 'Hades - Launch Trailer', { defaultAudioLanguage: 'en-GB', defaultLanguage: 'en' }), hades)).toBe('accepted');
    expect(reasonFor(vid('d', 'Hades - Launch Trailer', { regionBlocked: ['DE', 'FR'] }), hades)).toBe('accepted');
    expect(reasonFor(vid('e', 'Hades - Launch Trailer', { regionAllowed: ['IN', 'US', 'GB'] }), hades)).toBe('accepted');
  });

  it('rejects a video YouTube did not return', () => {
    expect(assess(null, hades)).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('language: Spanish, dubbed and non-Latin uploads are rejected', () => {
  it.each([
    'The Witcher 3: Wild Hunt - Tráiler oficial en español',
    'The Witcher 3: Wild Hunt Trailer Español Latino',
    'The Witcher 3: Wild Hunt - Trailer Dublado PT-BR',
    'The Witcher 3: Wild Hunt Launch Trailer (legendado)',
    'The Witcher 3: Wild Hunt Launch Trailer deutsch',
    'The Witcher 3: Wild Hunt - Bande-annonce officielle (français)',
    'The Witcher 3: Wild Hunt Launch Trailer [RU]',
    'The Witcher 3: Wild Hunt Launch Trailer (ES)',
    'The Witcher 3: Wild Hunt Trailer русский',
    'Ведьмак 3: Дикая Охота - трейлер',
    'The Witcher 3: Wild Hunt トレーラー 日本語',
    'The Witcher 3: Wild Hunt 中文 Trailer',
    'The Witcher 3: Wild Hunt 한국어 Trailer',
    'The Witcher 3: Wild Hunt trailer عربي',
  ])('rejects "%s"', (title) => {
    expect(reasonFor(vid('v', title), witcher)).not.toBe('accepted');
  });

  it('names the language reason for a tagged title', () => {
    expect(reasonFor(vid('v', 'The Witcher 3: Wild Hunt Launch Trailer en español'), witcher)).toBe('language tag');
    expect(reasonFor(vid('v', 'The Witcher 3: Wild Hunt Trailer русский'), witcher)).toBe('non-Latin script');
  });

  it('keeps accented Latin titles (they are not a language tag)', () => {
    expect(reasonFor(vid('v', 'Pokémon Legends Launch Trailer'), { title: 'Pokémon Legends' })).toBe('accepted');
  });
});

describe("another game's video, or a sequel, is rejected", () => {
  it('rejects a trailer that does not name the game', () => {
    expect(reasonFor(vid('v', 'Cyberpunk 2077 – Official Trailer'), witcher)).toBe('title does not name the game');
    expect(reasonFor(vid('v', 'Elden Ring Gameplay Trailer'), hades)).toBe('title does not name the game');
  });

  it.each([
    ['The Witcher 4 Reveal Trailer', witcher],
    ['Hades II - Official Reveal Trailer', hades],
    ['Hades 2 Launch Trailer', hades],
    ['Hades III Teaser Trailer', hades],
  ])('rejects the different number in "%s"', (title, game) => {
    expect(reasonFor(vid('v', title), game)).toMatch(/different number|title does not name/);
  });

  it('knows GTA V from GTA VI, and accepts "5" for "V"', () => {
    expect(reasonFor(vid('v', 'Grand Theft Auto VI Trailer 1'), gta5)).not.toBe('accepted');
    expect(reasonFor(vid('v', 'Grand Theft Auto V: Official Trailer'), gta5)).toBe('accepted');
    expect(reasonFor(vid('v', 'Grand Theft Auto 5 Launch Trailer'), gta5)).toBe('accepted');
  });

  it('does not mistake years, resolutions, frame rates or "Xbox Series X" for sequel numbers', () => {
    expect(reasonFor(vid('v', 'Hades - Gameplay Trailer 2020 4K 60fps'), hades)).toBe('accepted');
    expect(reasonFor(vid('v', 'Hades - Launch Trailer | Xbox Series X|S'), hades)).toBe('accepted');
    expect(reasonFor(vid('v', 'Hades - Launch Trailer | PS5 PS4'), hades)).toBe('accepted');
  });

  it('accepts the game named without "The" or without its subtitle, and with apostrophes and accents', () => {
    expect(reasonFor(vid('v', 'Witcher 3 launch trailer'), witcher)).toBe('accepted');
    expect(reasonFor(vid('v', 'The Witcher 3 – Launch Trailer'), witcher)).toBe('accepted');
    expect(reasonFor(vid('v', "Baldur's Gate 3 - Official Launch Trailer"), bg3)).toBe('accepted');
    expect(reasonFor(vid('v', 'Baldurs Gate 3 Official Launch Trailer'), bg3)).toBe('accepted');
    expect(reasonFor(vid('v', 'Baldur’s Gate 3 – Gameplay Trailer'), bg3)).toBe('accepted');
  });

  it('a one-word subtitle-less head is not enough to match a longer game title', () => {
    // "Wild Hunt" alone does not name "The Witcher 3: Wild Hunt"
    expect(reasonFor(vid('v', 'Wild Hunt - Launch Trailer'), witcher)).toBe('title does not name the game');
  });
});

describe('noise is rejected even when the game is named', () => {
  it.each([
    ['The Witcher 3 Developer Diary: Creating the Sound', 'developer diary'],
    ['The Witcher 3 Dev Diary #2', 'developer diary'],
    ['The Witcher 3: Wild Hunt – Behind the Scenes Trailer', 'behind the scenes'],
    ['The Making of The Witcher 3 Trailer', 'making of'],
    ['The Witcher 3 Interview with the director', 'interview'],
    ['The Witcher 3 Review', 'review'],
    ['The Witcher 3 Wild Hunt Trailer Reaction', 'reaction'],
    ['REACTING to The Witcher 3 Trailer', 'reaction'],
    ['The Witcher 3 – Official Soundtrack', 'soundtrack'],
    ['The Witcher 3 OST - Kaer Morhen', 'soundtrack'],
    ['The Witcher 3 Wild Hunt Music Trailer', 'soundtrack'],
    ['The Witcher 3 Walkthrough Gameplay', 'walkthrough'],
    ["Let's Play The Witcher 3 gameplay", "let's play"],
    ['The Witcher 3 Gameplay Part 12', 'part N'],
    ['The Witcher 3 Speedrun Gameplay', 'speedrun'],
    ['The Witcher 3 Mods Trailer', 'mod'],
    ['The Witcher 3 Fan-Made Trailer', 'fan-made'],
    ['The Witcher 3 fan made gameplay trailer', 'fan-made'],
    ['The Witcher 3 Concept Trailer', 'concept'],
    ['The Witcher 3 Livestream', 'livestream'],
    ['The Witcher 3 Ending Explained', 'explained'],
    ['The Witcher 3 Tier List', 'tier list'],
    ['Top 10 Witcher 3 trailer moments', 'list video'],
    ['The Witcher 3 Full Game Movie', 'full playthrough'],
  ])('rejects "%s" (%s)', (title, reason) => {
    expect(reasonFor(vid('v', title), witcher)).toBe(reason);
  });

  it('rejects a video about the game that is not a trailer at all', () => {
    expect(reasonFor(vid('v', 'The Witcher 3: Wild Hunt'), witcher)).toBe('not a trailer');
    expect(reasonFor(vid('v', 'The Witcher 3: Wild Hunt - My thoughts'), witcher)).toBe('title continues past the game name');
    expect(reasonFor(vid('v', 'The Witcher 3: Wild Hunt is great'), witcher)).toBe('title continues past the game name');
  });
});

describe('the title must name this game, not a neighbour', () => {
  const ragnarok = { title: 'God of War: Ragnarök', developer: ['Santa Monica Studio'], publisher: ['Sony Interactive Entertainment'] };
  const miles = { title: "Marvel's Spider-Man: Miles Morales", developer: ['Insomniac Games'], publisher: ['Sony Interactive Entertainment'] };
  const blackOps = { title: 'Call of Duty: Black Ops 6', developer: ['Treyarch'], publisher: ['Activision'] };
  const elden = { title: 'Elden Ring', developer: ['FromSoftware'], publisher: ['Bandai Namco Entertainment'] };
  const ff7 = { title: 'Final Fantasy VII', developer: ['Square Enix'], publisher: ['Square Enix'] };
  const journey = { title: 'Journey', developer: ['thatgamecompany'], publisher: ['Sony Interactive Entertainment'] };

  it("does not accept the previous or parent game's videos for a subtitled sequel", () => {
    expect(reasonFor(vid('v', 'God of War – Gameplay Trailer'), ragnarok)).toBe('title does not name the game');
    expect(reasonFor(vid('v', 'God of War: Ragnarök – Gameplay Trailer'), ragnarok)).toBe('accepted');
    expect(reasonFor(vid('v', "Marvel's Spider-Man - Launch Trailer"), miles)).toBe('title does not name the game');
    expect(reasonFor(vid('v', 'Call of Duty: Warzone – Official Trailer'), blackOps)).toBe('title does not name the game');
    expect(reasonFor(vid('v', 'Call of Duty: Black Ops 6 – Official Reveal Trailer'), blackOps)).toBe('accepted');
  });

  it('rejects a title that only starts with the game name', () => {
    expect(reasonFor(vid('v', 'ELDEN RING NIGHTREIGN – Reveal Trailer'), elden)).toBe('title continues past the game name');
    expect(reasonFor(vid('v', 'Final Fantasy VII Remake – Launch Trailer'), ff7)).toBe('title continues past the game name');
    expect(reasonFor(vid('v', 'Journey to the Savage Planet – Launch Trailer'), journey)).toBe('title continues past the game name');
    expect(reasonFor(vid('v', 'ELDEN RING – Official Gameplay Trailer'), elden)).toBe('accepted');
    expect(reasonFor(vid('v', 'Journey - Launch Trailer'), journey)).toBe('accepted');
    expect(reasonFor(vid('v', 'ELDEN RING Gameplay Reveal Trailer 4K 60fps'), elden)).toBe('accepted');
  });

  it('lets an edition-only subtitle be dropped ("Minecraft: Java Edition" is just "Minecraft")', () => {
    const minecraft = { title: 'Minecraft: Java Edition', developer: ['Mojang Studios'], publisher: ['Mojang Studios'] };
    expect(reasonFor(vid('v', 'Minecraft Official Trailer'), minecraft)).toBe('accepted');
    expect(reasonFor(vid('v', 'Minecraft – Launch Trailer'), minecraft)).toBe('accepted');
    expect(reasonFor(vid('v', 'Minecraft: Java Edition – Launch Trailer'), minecraft)).toBe('accepted');
    // but a subtitle that is not an edition label still needs the full name
    const fallout = { title: 'Fallout: A Post Nuclear Role Playing Game', developer: [], publisher: [] };
    expect(reasonFor(vid('v', 'Fallout 4 Official Trailer'), fallout)).toBe('title does not name the game');
    expect(reasonFor(vid('v', 'Fallout Official Trailer'), fallout)).toBe('title does not name the game');
    // and the head of an edition title does not match a neighbouring game
    expect(reasonFor(vid('v', 'Minecraft Dungeons – Launch Trailer'), minecraft)).toBe('title continues past the game name');
  });

  it('rejects an expansion named after the head of a numbered title ("Witcher 3: Blood and Wine")', () => {
    expect(reasonFor(vid('v', 'The Witcher 3: Blood and Wine – Launch Trailer'), witcher)).toBe('title continues past the game name');
    expect(reasonFor(vid('v', 'The Witcher 3: Wild Hunt – Blood and Wine Launch Trailer'), witcher)).toBe('title continues past the game name');
    expect(reasonFor(vid('v', 'The Witcher 3 – Launch Trailer'), witcher)).toBe('accepted');
  });

  it('rejects an expansion that says so', () => {
    expect(reasonFor(vid('v', 'Elden Ring – Expansion Trailer'), elden)).toBe('dlc');
    expect(reasonFor(vid('v', 'Hades DLC Launch Trailer'), hades)).toBe('dlc');
  });
});

// Titles found by the first live run over the 300 most popular games: wrong picks that slipped through
// until the title match also looked at the words before the name and at what a subtitle really is.
describe('search results about a neighbouring game (live-run regressions)', () => {
  const g = (title, extra = {}) => ({ title, developer: [], publisher: [], ...extra });
  const rejected = [
    ['Portal', 'Bridge Constructor Portal – Gameplay Trailer | PS4'],
    ['Half-Life', 'Half-Life: Alyx – Official Gameplay Trailer #2 (Xen Infestation)'],
    ['League of Legends', 'Official Gameplay Trailer | League of Legends: Wild Rift'],
    ['Call of Duty', 'Call of Duty: Modern Warfare 4 - DMZ Early Access Gameplay Trailer | PS5 Games'],
    ['Counter-Strike', 'Counter-Strike: Global Offensive Trailer'],
    ['Deus Ex', 'Deus Ex: Human Revolution Gameplay Trailer'],
    ['Mafia', 'Mafia: The Old Country - Official Gameplay Trailer'],
    ['Arena Breakout: Infinite', 'Season 7: Utopia Available Now | Launch Trailer | Arena Breakout: Infinite'],
    ['Elden Ring', 'ELDEN RING – Rise, Tarnished | Official Launch Trailer'], // a tagline: fine from IGDB, not from a search
    ['Elden Ring', 'Elden Ring: Shadow of the Erdtree – Story Trailer'],
    ['Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty | Official Launch Trailer'],
  ];
  it.each(rejected)('rejects %s <- "%s" from a search', (title, video) => {
    expect(reasonFor(vid('v', video), g(title))).not.toBe('accepted');
  });

  const accepted = [
    ['Batman: Arkham City', 'Batman: Arkham City - Launch Trailer'],
    ["Baldur's Gate 3", "Baldur's Gate 3 – Out Now Trailer"],
    ['Hades', 'Hades Game Trailer'],
    ['Hades', 'Hades – Gameplay Reveal'],
    ['Max Payne 2: The Fall of Max Payne', 'Max Payne 2 Official Trailer (PC)'],
    ['Fallout 3', 'E3 2008 - Fallout 3 Trailer'],
    ['The Elder Scrolls V: Skyrim', 'The Elder Scrolls V: Skyrim - Official Trailer'],
    ['Hades', 'Hades - v1.0 Launch Trailer'],
    ['The Witness', 'The Witness - Release Date Trailer | PS4'],
    ['Return of the Obra Dinn', 'Return of the Obra Dinn - Nintendo Switch Reveal Trailer [HD 1080P]'],
    ['R.E.P.O.', 'R.E.P.O. - Official Release Trailer'],
    ['Max Payne 3', 'Max Payne 3 - Official Launch Trailer'],
    ['War Thunder', 'War Thunder Gamescom 2013 Gameplay Trailer | #PS4'],
    ['PUBG: Battlegrounds', 'PUBG: Battlegrounds - F2P Gameplay Trailer  | PS5, PS4'],
  ];
  it.each(accepted)('keeps %s <- "%s"', (title, video) => {
    expect(reasonFor(vid('v', video), g(title))).toBe('accepted');
  });

  it.each([
    ['Hollow Knight', 'Hollow Knight: Silksong – Announcement Trailer'],
    ['Hollow Knight', 'Hollow Knight: Silksong Announcement Trailer'],
    ['Half-Life', 'Half-Life: Alyx Reveal Trailer'],
    ['Cyberpunk 2077', 'Cyberpunk 2077: Edgerunners Official Trailer'],
    ['Cyberpunk 2077', 'Cyberpunk 2077 – Phantom Liberty Official Launch Trailer'],
    ["Assassin's Creed Brotherhood", "Assassin's Creed Brotherhood - Exotic Gameplay Trailer [Europe]"], // accepted loss: a long tagline is indistinguishable from a subtitle
  ])('a one-word subtitle is a different game from a search: %s <- "%s"', (title, video) => {
    expect(reasonFor(vid('v', video), g(title))).not.toBe('accepted');
  });

  it('known limitation: a DLC trailer that IGDB itself lists on the base game is accepted (only explicit DLC words are rejected)', () => {
    const ok = (video, title) => assess(vid('v', video), g(title), { source: 'igdb' }).ok;
    expect(ok('The Witcher 3: Wild Hunt – Hearts of Stone Launch Trailer', 'The Witcher 3: Wild Hunt')).toBe(true);
    expect(ok('The Witcher 3: Wild Hunt – Hearts of Stone DLC Launch Trailer', 'The Witcher 3: Wild Hunt')).toBe(false);
  });

  it('videos IGDB lists for the game are not held to the neighbour rules (taglines, subtitles)', () => {
    const ok = (video, title) => assess(vid('v', video), g(title), { source: 'igdb' }).ok;
    expect(ok('ELDEN RING – Rise, Tarnished | Official Launch Trailer', 'Elden Ring')).toBe(true);
    expect(ok('Hades - v1.0 Gameplay Showcase', 'Hades')).toBe(true);
    // ...but they must still name the game, and noise is still noise
    expect(ok('Cyberpunk 2077 – Official Trailer', 'Elden Ring')).toBe(false);
    expect(ok('Elden Ring – Developer Diary', 'Elden Ring')).toBe(false);
  });
});

describe('words in the game\'s own name are not noise, and trailer numbers are not sequels', () => {
  const tlou2 = { title: 'The Last of Us Part II', developer: ['Naughty Dog'], publisher: ['Sony Interactive Entertainment'] };
  const topSpin = { title: 'Top Spin 4', developer: ['2K Czech'], publisher: ['2K'] };

  it('keeps "Part II" and "Top Spin 4" when they are the title', () => {
    expect(reasonFor(vid('v', 'The Last of Us Part II – Launch Trailer'), tlou2)).toBe('accepted');
    expect(reasonFor(vid('v', 'Top Spin 4 – Launch Trailer'), topSpin)).toBe('accepted');
    // but "Part II" is the sequel for a game that is just "The Last of Us"
    expect(reasonFor(vid('v', 'The Last of Us Part II – Launch Trailer'), { title: 'The Last of Us' })).not.toBe('accepted');
  });

  it('accepts "Trailer 1", "Trailer #2" and frame rates that come after the trailer word', () => {
    expect(reasonFor(vid('v', 'Grand Theft Auto V: Official Trailer 1'), gta5)).toBe('accepted');
    expect(reasonFor(vid('v', 'The Witcher 3: Wild Hunt Trailer 2'), witcher)).toBe('accepted');
    expect(reasonFor(vid('v', "Baldur's Gate 3 – Official Launch Trailer #2 | 60 FPS"), bg3)).toBe('accepted');
  });
});

describe('language: more tags, and neutral language codes', () => {
  it.each(['(Spanish)', '(Portuguese)', '(Japanese)', 'Dubbed', 'DUB', 'VOSTFR', 'LATAM'])('rejects the tag %s', (tag) => {
    expect(reasonFor(vid('v', `Hades – Launch Trailer ${tag}`), hades)).toBe('language tag');
  });

  it('treats und / zxx (no speech) / mul as unknown, not as another language', () => {
    for (const code of ['und', 'zxx', 'mul', 'UND']) {
      expect(reasonFor(vid('v', 'Hades – Launch Trailer', { defaultAudioLanguage: code }), hades)).toBe('accepted');
    }
    expect(reasonFor(vid('v', 'Hades – Launch Trailer', { defaultAudioLanguage: 'fr' }), hades)).toBe('language fr');
  });

  it('does not call a game "in Spanish" because of its own name', () => {
    expect(reasonFor(vid('v', 'Spanish Fly – Launch Trailer'), { title: 'Spanish Fly' })).toBe('accepted');
  });
});

describe('an unknown uploader needs an official signal for a bare "gameplay" or "teaser"', () => {
  it('rejects random gameplay uploads from search, but not a trailer', () => {
    expect(reasonFor(vid('v', 'Hades gameplay 4K no commentary'), hades)).toBe('no official signal');
    expect(reasonFor(vid('v', 'Hades – Teaser'), hades)).toBe('no official signal');
    expect(reasonFor(vid('v', 'Hades – Trailer'), hades)).toBe('accepted');
    expect(reasonFor(vid('v', 'Hades – Official Gameplay'), hades)).toBe('accepted'); // says "official"
    expect(reasonFor(vid('v', 'Hades gameplay', { channel: 'Supergiant Games' }), hades)).toBe('accepted'); // developer channel
  });

  it('trusts IGDB-listed videos more: the same bare gameplay video passes as an IGDB candidate', () => {
    expect(assess(vid('v', 'Hades gameplay'), hades, { source: 'igdb', igdbName: 'Gameplay video' }).ok).toBe(true);
  });
});

describe('scoring and labels', () => {
  // IGDB source, so the "bare gameplay needs an official signal" rule for search results does not apply here
  const score = (title, extra, game = hades, opts = { source: 'igdb' }) => assess(vid('v', title, extra), game, opts).score;
  const label = (title) => assess(vid('v', title), hades, { source: 'igdb' }).label;

  it('labels by what the video is', () => {
    expect(label('Hades - Official Gameplay Trailer')).toBe('Gameplay trailer');
    expect(label('Hades - Launch Trailer')).toBe('Launch trailer');
    expect(label('Hades - Release Date Trailer')).toBe('Release trailer');
    expect(label('Hades - Reveal Trailer')).toBe('Reveal trailer');
    expect(label('Hades - Announcement Trailer')).toBe('Reveal trailer');
    expect(label('Hades - Cinematic Trailer')).toBe('Cinematic trailer');
    expect(label('Hades - Trailer')).toBe('Trailer');
    expect(label('Hades - Gameplay Overview')).toBe('Gameplay'); // not a trailer, so not labelled one
    expect(label('Hades - Gameplay Showcase')).toBe('Gameplay');
    expect(label('Hades - Gameplay Reveal')).toBe('Gameplay trailer');
    expect(label('Hades - Gameplay')).toBe('Gameplay');
    expect(label('Hades - Teaser')).toBe('Teaser');
  });

  it('ranks gameplay trailer > launch > release > reveal > plain trailer > gameplay > teaser', () => {
    const order = [
      'Hades - Gameplay Trailer',
      'Hades - Launch Trailer',
      'Hades - Release Date Trailer',
      'Hades - Reveal Trailer',
      'Hades - Trailer',
      'Hades - Gameplay',
      'Hades - Teaser',
    ];
    const scores = order.map((t) => score(t, { views: 1000 }));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(scores.length);
  });

  it('"official" adds, an official channel adds, and more views add (logarithmically)', () => {
    const base = score('Hades - Launch Trailer', { views: 1000 });
    expect(score('Hades - Official Launch Trailer', { views: 1000 })).toBeGreaterThan(base);
    expect(score('Hades - Launch Trailer', { views: 1000, channel: 'Supergiant Games' })).toBeGreaterThan(base + 20); // the developer's channel
    expect(score('Hades - Launch Trailer', { views: 1000, channel: 'IGN' })).toBeGreaterThan(base + 20); // a known official channel
    expect(score('Hades - Launch Trailer', { views: 1_000_000 })).toBeGreaterThan(base);
    // 10x views is worth a constant 5 points, not 10x the score
    expect(score('Hades - Launch Trailer', { views: 10_000 }) - base).toBeCloseTo(5, 0);
  });

  it('matches developer/publisher channels loosely and known channels by name', () => {
    const channelBonus = (channel, game) => assess(vid('v', 'Hades - Launch Trailer', { channel, views: 1000 }), game).channelMatch;
    expect(channelBonus('CD PROJEKT RED', witcher)).toBeUndefined(); // a Hades video fails the title check for the Witcher
    expect(channelBonus('CD PROJEKT RED', hades)).toBe(true); // but it is a known official channel
    expect(channelBonus('Supergiant Games', hades)).toBe(true);
    expect(channelBonus('Supergiant Games Inc.', hades)).toBe(true);
    expect(channelBonus('PlayStation', hades)).toBe(true);
    expect(channelBonus('Nintendo of America', hades)).toBe(true);
    expect(channelBonus('Bandai Namco Entertainment', hades)).toBe(true);
    expect(assess(vid('v', 'Grand Theft Auto V Launch Trailer', { channel: 'Rockstar Games', views: 1000 }), gta5).channelMatch).toBe(true);
    expect(channelBonus('PlayStation Europe', hades)).toBe(true); // regional channel of the brand
    expect(channelBonus('PlayStation Universe', hades)).toBe(false); // a fan site that merely contains the name
    expect(channelBonus('Nintendo Life', hades)).toBe(false);
    expect(channelBonus('SteamTrick', hades)).toBe(false);
    expect(channelBonus('gamer guy 99', hades)).toBe(false);
    expect(channelBonus('', hades)).toBe(false);
  });

  it('an IGDB-curated name is a small bonus, only for IGDB candidates', () => {
    const plain = assess(vid('v', 'Hades - Launch Trailer'), hades, { source: 'youtube', igdbName: 'Trailer' }).score;
    const curated = assess(vid('v', 'Hades - Launch Trailer'), hades, { source: 'igdb', igdbName: 'Launch trailer' }).score;
    const igdbNoHint = assess(vid('v', 'Hades - Launch Trailer'), hades, { source: 'igdb', igdbName: 'Developer Diary' }).score;
    expect(curated).toBeGreaterThan(plain);
    expect(igdbNoHint).toBe(plain);
  });

  it('breaks score ties by views and ignores duplicates', () => {
    const a = vid('aaa', 'Hades - Launch Trailer', { views: 500 });
    const b = vid('bbb', 'Hades - Launch Trailer', { views: 500 });
    const { accepted } = rank([{ video: a }, { video: b }, { video: a }], hades);
    expect(accepted).toHaveLength(2);
  });
});

describe('normalise', () => {
  it('lowercases, strips accents and apostrophes, and turns & into and', () => {
    expect(normalise("Baldur's Gate 3: Pokémon & Friends!")).toBe('baldurs gate 3 pokemon and friends');
    expect(normalise(null)).toBe('');
  });
});
