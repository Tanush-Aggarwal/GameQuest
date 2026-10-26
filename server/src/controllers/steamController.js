export function createSteamController({ steamService }) {
  return {
    async status(req, res) {
      res.json({ steam: await steamService.getStatus(req.auth.userId) });
    },

    async link(req, res) {
      res.json({ steam: await steamService.link(req.auth.userId, req.body.input) });
    },

    async unlink(req, res) {
      await steamService.unlink(req.auth.userId);
      res.status(204).end();
    },
  };
}
