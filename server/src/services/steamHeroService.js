// Looks up Steam's real banner art (library hero) for catalog games and stores it on the game, so every header can
// use Steam's wide key art. The classic CDN path only works for older games; newer ones keep art under a hashed folder
// that only the Steam store API knows. Some catalog entries point at a child app ("The Quarry - Full Game"), so when an
// app has no hero its parent app's hero is used.
const BATCH = 50;

export function createSteamHeroService({ Game, steam, log = () => {}, now = () => new Date(), pauseMs = 300 }) {
  const pause = () => new Promise((r) => setTimeout(r, pauseMs));

  async function lookup(appids) {
    const found = new Map();
    for (let i = 0; i < appids.length; i += BATCH) {
      const batch = appids.slice(i, i + BATCH);
      const assets = await steam.getStoreAssets(batch);
      for (const [id, a] of assets) found.set(id, a);
      if (i + BATCH < appids.length) await pause();
    }
    return found;
  }

  return {
    // `all`: look up every Steam game again, not only the ones never checked.
    async run({ all = false } = {}) {
      const filter = { hidden: { $ne: true }, 'externalIds.steam': { $nin: [null, ''] } };
      if (!all) filter.steamHeroCheckedAt = { $exists: false };
      const games = await Game.find(filter).select('_id title externalIds').lean();
      log(`${games.length} Steam game(s) to look up`);
      const report = { checked: 0, found: 0, fromParent: 0, none: 0 };

      for (let i = 0; i < games.length; i += BATCH) {
        const batch = games.slice(i, i + BATCH);
        const assets = await lookup(batch.map((g) => g.externalIds.steam));
        // apps without a hero of their own: try the parent app once
        const parents = [...new Set(batch.map((g) => assets.get(String(g.externalIds.steam))).filter((a) => a && !a.libraryHero && a.parentAppid).map((a) => a.parentAppid))];
        const parentAssets = parents.length ? await lookup(parents) : new Map();

        for (const g of batch) {
          const own = assets.get(String(g.externalIds.steam));
          const parent = own?.parentAppid ? parentAssets.get(own.parentAppid) : null;
          const pick = own?.libraryHero ? own : parent?.libraryHero ? parent : null;
          await Game.updateOne(
            { _id: g._id },
            { $set: { steamHero: pick?.libraryHero ?? null, steamHero2x: pick?.libraryHero2x ?? null, steamHeroCheckedAt: now() } },
          );
          report.checked += 1;
          if (pick === own && pick) report.found += 1;
          else if (pick) report.fromParent += 1;
          else report.none += 1;
        }
        log(`  ${Math.min(i + BATCH, games.length)}/${games.length}: ${report.found + report.fromParent} heroes so far`);
        await pause();
      }
      return report;
    },
  };
}
