import { Router } from 'express';
import { createInsightsController } from '../controllers/insightsController.js';

export function createInsightsRouter({ requireAuth, insightsService }) {
  const router = Router();
  const ctrl = createInsightsController({ insightsService });

  router.get('/dashboard', requireAuth, ctrl.dashboard);
  router.get('/play-next', requireAuth, ctrl.playNext);
  router.get('/backlog-health', requireAuth, ctrl.backlogHealth);

  return router;
}
