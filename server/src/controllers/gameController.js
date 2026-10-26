export function createGameController({ gameService }) {
  return {
    async search(req, res) {
      res.json(await gameService.search(req.query));
    },

    async get(req, res) {
      res.json({ game: await gameService.getBySlug(req.params.slug) });
    },
  };
}
