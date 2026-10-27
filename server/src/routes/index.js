import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { createAuthRouter } from './auth.js';
import { createGamesRouter } from './games.js';
import { createPublicRouter } from './public.js';
import { createLibraryRouter } from './library.js';
import { createProgressRouter } from './progress.js';
import { createInsightsRouter } from './insights.js';
import { createReviewsRouter } from './reviews.js';
import { createCollectionsRouter } from './collections.js';
import { createSocialRouters } from './social.js';
import { createSessionsRouter } from './sessions.js';
import { createRecommendationsRouter } from './recommendations.js';
import { createSteamRouter } from './steam.js';
import { createSyncRouter } from './sync.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createAccountRouters } from './account.js';

export function createRoutes({
  authService,
  gameService,
  libraryService,
  progressService,
  insightsService,
  reviewService,
  collectionService,
  friendService,
  activityService,
  profileService,
  sessionService,
  recommendationService,
  steamService,
  steamSyncService,
  trailerService,
  homeService,
  requirementsService,
  ratingsService,
  accountService,
  notificationService,
  googleAdapter,
  LibraryEntry,
  config,
}) {
  const router = Router();
  const requireAuth = createRequireAuth(authService);
  const social = createSocialRouters({ authService, friendService, profileService, activityService });

  router.get('/health', health);
  router.use('/auth', createAuthRouter({ authService, googleAdapter, config }));
  router.use('/public', createPublicRouter({ gameService, homeService }));
  router.use('/games', createGamesRouter({ authService, gameService, trailerService, homeService, requirementsService, ratingsService }));
  router.use('/library', createLibraryRouter({ authService, libraryService }));
  router.use('/library', createProgressRouter({ requireAuth, progressService }));
  router.use('/insights', createInsightsRouter({ requireAuth, insightsService, homeService }));
  router.use('/collections', createCollectionsRouter({ authService, collectionService }));
  router.use('/reviews', createReviewsRouter({ requireAuth, reviewService, LibraryEntry }));
  router.use('/friends', social.friends);
  router.use('/blocks', social.blocks);
  router.use('/users', social.users);
  router.use('/feed', social.feed);
  router.use('/sessions', createSessionsRouter({ authService, sessionService }));
  router.use('/steam', createSteamRouter({ authService, steamService }));
  router.use('/sync', createSyncRouter({ authService, steamSyncService }));
  if (accountService && notificationService) {
    const { account, notifications } = createAccountRouters({ authService, accountService, notificationService, config });
    router.use('/account', account);
    router.use('/notifications', notifications);
  }
  if (recommendationService) {
    router.use('/recommendations', createRecommendationsRouter({ authService, recommendationService }));
  }

  return router;
}
