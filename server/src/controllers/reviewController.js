// Identity always comes from req.auth (signed cookie), never from the body.
export function createReviewController({ reviewService, LibraryEntry }) {
  return {
    // PUT /reviews/:gameId — create or replace the caller's review
    async upsert(req, res) {
      const review = await reviewService.upsert(req.auth.userId, req.params.gameId, req.body, LibraryEntry);
      res.json({ review });
    },

    // DELETE /reviews/:gameId — remove the caller's review
    async deleteReview(req, res) {
      await reviewService.deleteReview(req.auth.userId, req.params.gameId);
      res.status(204).end();
    },

    // GET /reviews/mine/:gameId — get the caller's review of one game
    async getMine(req, res) {
      const review = await reviewService.getMyReview(req.auth.userId, req.params.gameId);
      res.json({ review }); // null if they have no review
    },

    // GET /reviews/game/:gameId — list all reviews for a game
    async listForGame(req, res) {
      const { limit, cursor } = req.query;
      const result = await reviewService.listForGame(req.params.gameId, {
        limit: limit ? Math.min(Number(limit), 50) : 20,
        cursor,
      });
      res.json(result);
    },

    // GET /reviews/user/:userId — list reviews written by a user (public profile)
    async listByUser(req, res) {
      const { limit, cursor } = req.query;
      const result = await reviewService.listByUser(req.params.userId, {
        limit: limit ? Math.min(Number(limit), 50) : 20,
        cursor,
      });
      res.json(result);
    },
  };
}
