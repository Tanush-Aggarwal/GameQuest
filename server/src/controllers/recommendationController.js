export function createRecommendationController({ recommendationService }) {
  return {
    async send(req, res) {
      const recommendation = await recommendationService.send(req.auth.userId, req.body);
      res.status(201).json({ recommendation });
    },

    async inbox(req, res) {
      res.json(await recommendationService.listInbox(req.auth.userId, req.query));
    },

    async sent(req, res) {
      res.json(await recommendationService.listSent(req.auth.userId, req.query));
    },

    async respond(req, res) {
      const recommendation = await recommendationService.respond(
        req.auth.userId,
        req.params.id,
        req.body,
      );
      res.json({ recommendation });
    },

    async remove(req, res) {
      await recommendationService.remove(req.auth.userId, req.params.id);
      res.status(204).end();
    },

    async pickScore(req, res) {
      const userId = req.params.userId ?? req.auth.userId;
      res.json(await recommendationService.getPickScore(userId));
    },
  };
}
