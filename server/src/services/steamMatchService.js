// Finds the Steam app for catalog games that have no Steam app id, so they get Steam's banner art, screenshots and
// trailers too. A match must be the same game, not a namesake: the store name has to equal the catalog title once
// both are normalised (case, ™/®, punctuation, "&" vs "and"), it has to be a game (not a DLC, soundtrack or demo),
// and when both sides know the release year they must be within a year of each other. Anything less is skipped and
// listed, never guessed. An app id another game already uses is never reused.

export const normaliseTitle = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\((19|20)\d{2}\)/g, '')
    .replace(/[^a-z0-9]+/g, '');

export function createSteamMatchService({ Game, steam, log = () => {}, now = () => new Date(), pauseMs = 1500 }) {
  const pause = () => new Promise((r) => setTimeout(r, pauseMs));

  async function matchOne(game) {
    const want = normaliseTitle(game.title);
    if (!want) return { status: 'skipped', reason: 'no title' };
    const hits = (await steam.searchStore(game.title)).filter((h) => normaliseTitle(h.name) === want).slice(0, 3);
    if (!hits.length) return { status: 'none' };
    const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
    for (const hit of hits) {
      const details = await steam.getStoreMedia(hit.appid).catch(() => null);
      if (!details || (details.type && details.type !== 'game')) continue;
      if (year && details.releaseYear && Math.abs(details.releaseYear - year) > 1) continue;
      const taken = await Game.exists({ _id: { $ne: game._id }, 'externalIds.steam': hit.appid });
      if (taken) return { status: 'taken', appid: hit.appid, name: hit.name };
      return { status: 'matched', appid: hit.appid, name: hit.name };
    }
    return { status: 'mismatch', candidates: hits.map((h) => h.name) };
  }

  return {
    matchOne,
    // `all`: search again for games already searched before.
    async run({ all = false, limit = Infinity } = {}) {
      const filter = { hidden: { $ne: true }, $or: [{ 'externalIds.steam': null }, { 'externalIds.steam': '' }, { 'externalIds.steam': { $exists: false } }] };
      if (!all) filter.steamMatchCheckedAt = { $exists: false };
      const games = await Game.find(filter).select('_id title releaseDate').limit(Number.isFinite(limit) ? limit : 0).lean();
      log(`${games.length} game(s) without a Steam app id to search for`);
      const report = { checked: 0, matched: [], unmatched: [], failed: 0 };
      for (const g of games) {
        let result;
        try {
          result = await matchOne(g);
        } catch (err) {
          report.failed += 1;
          log(`  ! ${g.title}: ${err.message}`);
          if (/rate limit/i.test(err.message)) await pause(), await pause(), await pause();
          continue;
        }
        const $set = { steamMatchCheckedAt: now() };
        if (result.status === 'matched') $set['externalIds.steam'] = result.appid;
        await Game.updateOne({ _id: g._id }, { $set });
        report.checked += 1;
        if (result.status === 'matched') {
          report.matched.push({ title: g.title, appid: result.appid });
          log(`  + ${g.title} -> Steam ${result.appid}`);
        } else {
          report.unmatched.push({ title: g.title, why: result.status, ...(result.candidates && { candidates: result.candidates }) });
        }
        await pause();
      }
      return report;
    },
  };
}
