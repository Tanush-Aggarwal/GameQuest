const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 60 * 60 * 1000;

// Steam store media for games that have a Steam app id: official trailers, full-size screenshots and
// key art (library_hero). Cached in MediaCache (a miss and an error too) and never throws, so a slow or
// failing Steam store never breaks a game page.
export function createSteamMediaService({ MediaCache, steam, logger, now = () => new Date() }) {
  async function forGame(game) {
    const appid = game?.externalIds?.steam;
    if (!appid || !steam?.getStoreMedia) return null;
    try {
      const cached = await MediaCache.findOne({ gameId: game._id, source: 'steam-media' }).lean();
      if (cached && new Date(cached.expiresAt) > now()) return cached.payload?.media ?? null;
    } catch (err) {
      logger?.warn({ err }, 'steam media cache read failed');
    }

    let media = null;
    let ttl = HIT_TTL_MS;
    try {
      media = await steam.getStoreMedia(appid);
      if (media && steam.probeArt) {
        // library_hero is Steam's wide key art without the logo baked in; header.jpg is the fallback.
        const art = await steam.probeArt(appid).catch(() => null);
        media.hero = art?.backdrop ?? media.background ?? null;
      }
      if (!media) ttl = MISS_TTL_MS;
    } catch (err) {
      logger?.warn({ err, appid }, 'steam media lookup failed');
      ttl = ERROR_TTL_MS;
    }
    try {
      await MediaCache.findOneAndUpdate(
        { gameId: game._id, source: 'steam-media' },
        { $set: { payload: { media }, fetchedAt: now(), expiresAt: new Date(now().getTime() + ttl) } },
        { upsert: true },
      );
    } catch (err) {
      logger?.warn({ err }, 'steam media cache write failed');
    }
    return media;
  }

  return {
    forGame,

    // Game DTO with Steam's art and screenshots first (they are the publisher's own, at full size).
    async enrich(dto, game) {
      const media = await forGame(game);
      if (!media) return dto;
      const screenshots = [...new Set([...(media.screenshots ?? []), ...(dto.screenshots ?? [])])];
      const hero = media.hero ?? null;
      return {
        ...dto,
        screenshots,
        ...(hero && { backdrop: hero, heroImage: hero, bannerImage: hero }),
        steamAppId: String(game.externalIds.steam),
      };
    },

    // Steam trailers in the shape the client's trailer player takes: { videoId: 'steam-<id>', source: 'steam', ... }.
    async trailers(game) {
      const media = await forGame(game);
      return (media?.movies ?? []).map((m) => ({
        videoId: `steam-${m.id}`,
        label: m.name,
        source: 'steam',
        poster: m.poster,
        mp4: m.mp4,
        webm: m.webm,
        hls: m.hls,
      }));
    },
  };
}
