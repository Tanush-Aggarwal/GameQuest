import { Router } from 'express';
import { publicCoversQuerySchema } from '@gamequest/shared';
import { createHomeController } from '../controllers/homeController.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createGameController } from '../controllers/gameController.js';

// The only routes that need no account. Keep this list short and read-only: it exposes public catalog art only.
export function createPublicRouter({ gameService, homeService }) {
  const router = Router();
  const controller = createGameController({ gameService });
  // Anyone can call these, so they are limited per client IP (the sign-in pages load them once).
  const limiter = createRateLimiter({ max: 60 });
  router.get('/covers', limiter, validate(publicCoversQuerySchema, 'query'), controller.publicCovers);
  // Real catalog/community counts for the Home hero (no personal data).
  if (homeService) router.get('/stats', limiter, createHomeController({ homeService }).publicStats);
  return router;
}