import { Router } from 'express';
import { playNextQuerySchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createInsightsController } from '../controllers/insightsController.js';

export function createInsightsRouter({ requireAuth, insightsService }) {
  const router = Router();
  const ctrl = createInsightsController({ insightsService });

  router.get('/dashboard', requireAuth, ctrl.dashboard);
  router.get('/play-next', requireAuth, validate(playNextQuerySchema, 'query'), ctrl.playNext);
  router.get('/backlog-health', requireAuth, ctrl.backlogHealth);

  return router;
}
