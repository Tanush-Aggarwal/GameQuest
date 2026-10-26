export function createGameController({ gameService }) {
  return {
    async search(req, res) {
      res.json(await gameService.search(req.query));
    },

    async get(req, res) {
      res.json({ game: await gameService.getBySlug(req.params.slug) });
    },

    async getFriends(req, res) {
      res.json(await gameService.getFriendsPlaying(req.auth.userId, req.params.slug));
    },
  };
}
