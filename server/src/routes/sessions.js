import { Router } from 'express';
import { createSessionSchema, rsvpSchema, sessionIdParamsSchema, sessionListQuerySchema, updateSessionSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createSessionController } from '../controllers/sessionController.js';

// Host-only changes are enforced in sessionService (403 for someone who can see it, 404 otherwise).
export function createSessionsRouter({ authService, sessionService }) {
  const router = Router();
  const controller = createSessionController({ sessionService });
  const idParams = validate(sessionIdParamsSchema, 'params');
  // Creating sessions is the one thing here that others get to see, so it has a tighter budget.
  const createLimiter = createRateLimiter({ max: 30 });

  router.use(createRequireAuth(authService));
  router.get('/', validate(sessionListQuerySchema, 'query'), controller.list);
  router.post('/', createLimiter, validate(createSessionSchema), controller.create);
  router.get('/:id', idParams, controller.get);
  router.patch('/:id', idParams, validate(updateSessionSchema), controller.update);
  router.post('/:id/cancel', idParams, controller.cancel);
  router.put('/:id/rsvp', idParams, validate(rsvpSchema), controller.rsvp);
  router.get('/:id/ics', idParams, controller.ics);

  return router;
}
