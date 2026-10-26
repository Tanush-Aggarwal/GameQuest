import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { createAuthRouter } from './auth.js';
import { createGamesRouter } from './games.js';
import { createLibraryRouter } from './library.js';
import { createProgressRouter } from './progress.js';
import { createInsightsRouter } from './insights.js';
import { createReviewsRouter } from './reviews.js';
import { createRequireAuth } from '../middleware/auth.js';

export function createRoutes({ authService, gameService, libraryService, progressService, insightsService, reviewService, LibraryEntry, config }) {
  const router = Router();
  const requireAuth = createRequireAuth(authService);

  router.get('/health', health);
  router.use('/auth', createAuthRouter({ authService, config }));
  router.use('/games', createGamesRouter({ authService, gameService }));
  router.use('/library', createLibraryRouter({ authService, libraryService }));
  router.use('/library', createProgressRouter({ requireAuth, progressService }));
  router.use('/insights', createInsightsRouter({ requireAuth, insightsService }));
  router.use('/reviews', createReviewsRouter({ requireAuth, reviewService, LibraryEntry }));

  return router;
}
