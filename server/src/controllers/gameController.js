export function createGameController({ gameService, trailerService, steamMediaService, Game, adminService }) {
  // Validated IGDB/YouTube picks first, then official Steam trailers; anything an administrator hid is left out.
  async function listTrailers(req) {
    const trailers = await trailerService.getTrailers(req.params.slug, req.auth.userId);
    let steam = [];
    // (a model with no live connection, e.g. a test app without a database, would wait forever: skip it)
    if (steamMediaService && Game && (!Game.db || Game.db.readyState === 1)) {
      const game = await Game.findOne({ slug: req.params.slug }).select('_id externalIds').lean();
      if (game) steam = await steamMediaService.trailers(game);
    }
    const hidden = adminService ? await adminService.hiddenTrailersFor(req.params.slug) : new Set();
    return [...trailers, ...steam].filter((t) => !hidden.has(t.videoId)).slice(0, 6);
  }

  return {
    async search(req, res) {
      res.json(await gameService.search(req.query));
    },

    // Public (no account) and the same for everyone, so a shared cache may keep a real answer for an hour. The header is
    // set only once there is one: a failure or an empty catalog must never be remembered by a cache.
    async publicCovers(req, res) {
      const result = await gameService.publicCovers(req.query);
      res.set('Cache-Control', result.items.length ? 'public, max-age=3600' : 'no-store');
      res.json(result);
    },

    async get(req, res) {
      res.json({ game: await gameService.getBySlug(req.params.slug) });
    },

    // The list depends on who asks (a reporter's hidden videos), so no shared cache may keep it.
    async getTrailers(req, res) {
      res.set('Cache-Control', 'private, no-store');
      res.json({ trailers: await listTrailers(req) });
    },

    // Administrators only (the route checks the role): hides the trailer for everyone, then answers with the new list.
    async reportTrailer(req, res) {
      res.set('Cache-Control', 'private, no-store');
      if (adminService) await adminService.hideTrailer(req.auth.userId, req.params.slug, req.body.videoId);
      else await trailerService.reportTrailer(req.auth.userId, req.params.slug, req.body.videoId);
      res.json({ trailers: await listTrailers(req), changed: true, dropped: true });
    },

    async getFriends(req, res) {
      res.json(await gameService.getFriendsPlaying(req.auth.userId, req.params.slug));
    },
  };
}
