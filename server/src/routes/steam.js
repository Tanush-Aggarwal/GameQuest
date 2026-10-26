import { Router } from 'express';
import { linkSteamSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createSteamController } from '../controllers/steamController.js';

export function createSteamRouter({ authService, steamService }) {
  const router = Router();
  const controller = createSteamController({ steamService });
  // Each link attempt can call Steam twice, so it has its own small bucket.
  const linkLimiter = createRateLimiter({ max: 10 });

  router.use(createRequireAuth(authService));
  router.get('/', controller.status);
  router.post('/link', linkLimiter, validate(linkSteamSchema), controller.link);
  router.delete('/link', controller.unlink);

  return router;
}
