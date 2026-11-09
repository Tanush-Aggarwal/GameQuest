import { Router } from 'express';
import { featuredQuerySchema, gameSearchQuerySchema, gameSlugParamsSchema, trailerReportSchema } from '@gamequest/shared';
import { createHomeController } from '../controllers/homeController.js';
import { validate } from '../middleware/validate.js';
import { createRequireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createGameController } from '../controllers/gameController.js';

export function createGamesRouter({ authService, gameService, trailerService, homeService, requirementsService, ratingsService, steamMediaService, Game, adminService }) {
  const router = Router();
  const controller = createGameController({ gameService, trailerService, steamMediaService, Game, adminService });
  const home = createHomeController({ homeService, requirementsService, ratingsService });

  // Search and stale-game refreshes can fan out to IGDB, so they share their own bucket (client debounces typing).
  const searchLimiter = createRateLimiter({ max: 300 });
  // Browsing (Explore's carousel and rails, no search text) only reads the local catalog and never reaches IGDB, and one page
  // visit makes about a dozen such reads, so it has a roomier bucket of its own, per account.
  const browseLimiter = createRateLimiter({ max: 1500, keyGenerator: (req) => `games-browse:${req.auth.userId}` });
  const listLimiter = (req, res, next) => (req.query.q ? searchLimiter : browseLimiter)(req, res, next);
  // Hiding a trailer affects everyone, so even an administrator is kept to a sensible pace.
  const reportLimiter = createRateLimiter({
    max: 20,
    windowMs: 60 * 60 * 1000,
    keyGenerator: (req) => `trailer-report:${req.auth.userId}`,
    message: 'You have reported a lot of trailers. Try again in a while.',
  });

  router.use(createRequireAuth(authService));
  router.get('/', listLimiter, validate(gameSearchQuerySchema, 'query'), controller.search);
  // Before '/:slug' so "featured" is never read as a slug.
  if (homeService) router.get('/featured', browseLimiter, validate(featuredQuerySchema, 'query'), home.featured);
  router.get('/:slug', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.get);
  router.get('/:slug/trailer', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.getTrailers);
  // "Wrong trailer?" is for administrators: it hides the video for everyone at once.
  router.post(
    '/:slug/trailer/report',
    requireRole('admin'),
    reportLimiter,
    validate(gameSlugParamsSchema, 'params'),
    validate(trailerReportSchema),
    controller.reportTrailer,
  );
  router.get('/:slug/friends', searchLimiter, validate(gameSlugParamsSchema, 'params'), controller.getFriends);
  if (ratingsService) router.get('/:slug/ratings', searchLimiter, validate(gameSlugParamsSchema, 'params'), home.ratings);
  if (requirementsService) {
    router.get('/:slug/requirements', searchLimiter, validate(gameSlugParamsSchema, 'params'), home.requirements);
  }

  return router;
}
