import { Router } from 'express';
import { gameSearchQuerySchema, gameSlugParamsSchema, trailerReportSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createGameController } from '../controllers/gameController.js';

export function createGamesRouter({ authService, gameService, trailerService }) {
  const router = Router();
  const controller = createGameController({ gameService, trailerService });

  // Search and stale-game refreshes can fan out to IGDB, so they share their own bucket (client debounces typing).
  const searchLimiter = createRateLimiter({ max: 300 });
  // "Wrong trailer?" drops a video for everyone, so each account only gets a few an hour.
  const reportLimiter = createRateLimiter({
    max: 20,
    windowMs: 60 * 60 * 1000,
    keyGenerator: (req) => `trailer-report:${req.auth.userId}`,
    message: 'You have reported a lot of trailers. Try again in a while.',
  });

  router.use(createRequireAuth(authService));
  router.get('/', searchLimiter, validate(gameSearchQuerySchema, 'query'), controller.search);
  router.get('/:slug', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.get);
  router.get('/:slug/trailer', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.getTrailers);
  router.post(
    '/:slug/trailer/report',
    reportLimiter,
    validate(gameSlugParamsSchema, 'params'),
    validate(trailerReportSchema),
    controller.reportTrailer,
  );
  router.get('/:slug/friends', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.getFriends);

  return router;
}
