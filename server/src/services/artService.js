const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE = 'steam-art';

// A write that only lands while the field is still empty, so art IGDB supplied in the meantime is never replaced.
const stillEmpty = (field) => ({ $or: [{ [field]: null }, { [field]: '' }, { [field]: { $exists: false } }] });

// Steam CDN art for games IGDB has no cover or backdrop for. Each game is probed once: the answer
// (including "nothing there") is cached in MediaCache, a hit for 30 days and a miss for 7, and the
// art found is stored on the Game itself so every list and page shows it without another lookup.
// Only fills what is empty; art that IGDB supplied is never replaced.
// After a failed probe the CDN is left alone for `cooldownMs`, so an outage costs one short timeout
// a minute instead of one per page view or per game in a sync.
export function createArtService({
  Game,
  MediaCache,
  steam,
  logger,
  now = () => new Date(),
  hitTtlMs = 30 * DAY_MS,
  missTtlMs = 7 * DAY_MS,
  cooldownMs = 60_000,
}) {
  let downUntil = 0;
  let failures = 0;

  async function lookup(game) {
    const cached = await MediaCache.findOne({ gameId: game._id, source: SOURCE }).lean();
    if (cached && new Date(cached.expiresAt).getTime() > now().getTime()) return cached.payload;
    if (now().getTime() < downUntil) throw new Error('Steam CDN in cooldown after a failure');
    let art;
    try {
      art = await steam.probeArt(game.externalIds.steam); // throws on a network failure: nothing is cached
    } catch (err) {
      downUntil = now().getTime() + cooldownMs;
      throw err;
    }
    const payload = { cover: art.cover ?? null, backdrop: art.backdrop ?? null };
    const found = Boolean(payload.cover || payload.backdrop);
    try {
      await MediaCache.findOneAndUpdate(
        { gameId: game._id, source: SOURCE },
        { $set: { payload, fetchedAt: now(), expiresAt: new Date(now().getTime() + (found ? hitTtlMs : missTtlMs)) } },
        { upsert: true },
      );
    } catch (err) {
      if (err?.code !== 11000) throw err; // a concurrent request stored the same answer
    }
    return payload;
  }

  return {
    // How many lookups failed (CDN unreachable or cooling down) since start; lets scripts tell a real miss from a failure.
    failureCount: () => failures,

    // Returns the game with any missing cover/backdrop filled in. Never throws: the page that asked
    // for the game must still render when the CDN is down.
    async fillSteamArt(input) {
      const game = input?.toObject?.() ?? input;
      if (!game?.externalIds?.steam || game.hidden || (game.cover && game.backdrop)) return game;
      try {
        const art = await lookup(game);
        const filled = {};
        for (const field of ['cover', 'backdrop']) {
          if (game[field] || !art[field]) continue;
          const { matchedCount } = await Game.updateOne({ _id: game._id, ...stillEmpty(field) }, { $set: { [field]: art[field] } });
          if (matchedCount) filled[field] = art[field];
        }
        return Object.keys(filled).length ? { ...game, ...filled } : game;
      } catch (err) {
        failures += 1;
        logger?.warn({ err, slug: game.slug }, 'steam art lookup failed');
        return game;
      }
    },
  };
}
