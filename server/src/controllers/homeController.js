export function createHomeController({ homeService, requirementsService, ratingsService }) {
  return {
    // Public and identical for everyone: a shared cache may keep it for ten minutes.
    async publicStats(req, res) {
      res.set('Cache-Control', 'public, max-age=600');
      res.json(await homeService.publicStats());
    },

    async featured(req, res) {
      res.json(await homeService.featured({ limit: req.query.limit }));
    },

    async nextAdventure(req, res) {
      res.json({ pick: await homeService.nextAdventure(req.auth.userId) });
    },

    async ratings(req, res) {
      res.json(await ratingsService.forSlug(req.params.slug));
    },

    async requirements(req, res) {
      res.json(await requirementsService.forSlug(req.params.slug));
    },
  };
}
