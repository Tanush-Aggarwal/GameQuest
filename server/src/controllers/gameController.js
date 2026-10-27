export function createGameController({ gameService, trailerService }) {
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
      res.json({ trailers: await trailerService.getTrailers(req.params.slug, req.auth.userId) });
    },

    async reportTrailer(req, res) {
      res.set('Cache-Control', 'private, no-store');
      res.json(await trailerService.reportTrailer(req.auth.userId, req.params.slug, req.body.videoId));
    },

    async getFriends(req, res) {
      res.json(await gameService.getFriendsPlaying(req.auth.userId, req.params.slug));
    },
  };
}
