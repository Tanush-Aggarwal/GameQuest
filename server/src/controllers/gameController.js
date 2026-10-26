export function createGameController({ gameService, trailerService }) {
  return {
    async search(req, res) {
      res.json(await gameService.search(req.query));
    },

    async get(req, res) {
      res.json({ game: await gameService.getBySlug(req.params.slug) });
    },

    async getTrailer(req, res) {
      res.json({ trailer: await trailerService.getTrailer(req.params.slug) });
    },

    async getFriends(req, res) {
      res.json(await gameService.getFriendsPlaying(req.auth.userId, req.params.slug));
    },
  };
}
