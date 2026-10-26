import { Router } from 'express';
import {
  createRecommendationSchema,
  recommendationIdParamsSchema,
  recommendationListQuerySchema,
  respondRecommendationSchema,
  userIdParamsSchema,
} from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createRecommendationController } from '../controllers/recommendationController.js';

export function createRecommendationsRouter({ authService, recommendationService }) {
  const router = Router();
  const controller = createRecommendationController({ recommendationService });
  const idParams = validate(recommendationIdParamsSchema, 'params');
  const sendLimiter = createRateLimiter({ max: 30 });

  router.use(createRequireAuth(authService));

  router.post('/', sendLimiter, validate(createRecommendationSchema), controller.send);
  router.get('/inbox', validate(recommendationListQuerySchema, 'query'), controller.inbox);
  router.get('/sent', validate(recommendationListQuerySchema, 'query'), controller.sent);
  router.patch('/:id/respond', idParams, validate(respondRecommendationSchema), controller.respond);
  router.delete('/:id', idParams, controller.remove);
  router.get('/score/:userId', validate(userIdParamsSchema, 'params'), controller.pickScore);
  router.get('/score', controller.pickScore);

  return router;
}
