import { Router } from 'express';
import { gameSearchQuerySchema, gameSlugParamsSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createGameController } from '../controllers/gameController.js';

export function createGamesRouter({ authService, gameService }) {
  const router = Router();
  const controller = createGameController({ gameService });

  // Search and stale-game refreshes can fan out to IGDB, so they share their own bucket (client debounces typing).
  const searchLimiter = createRateLimiter({ max: 300 });

  router.use(createRequireAuth(authService));
  router.get('/', searchLimiter, validate(gameSearchQuerySchema, 'query'), controller.search);
  router.get('/:slug', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.get);
  router.get('/:slug/friends', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.getFriends);

  return router;
}
