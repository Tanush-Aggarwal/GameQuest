import { Router } from 'express';
import { adminGameUpdateSchema, adminIdParamsSchema, adminRoleSchema, adminSearchQuerySchema, adminTrailerSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRequireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

// /admin: administrators only (the role comes from the signed session cookie, never from the request).
export function createAdminRouter({ authService, adminService }) {
  const router = Router();
  const limiter = createRateLimiter({ max: 600, keyGenerator: (req) => `admin:${req.auth.userId}` });
  router.use(createRequireAuth(authService), requireRole('admin'), limiter);
  const nostore = (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  };
  router.use(nostore);

  router.get('/overview', async (req, res) => res.json(await adminService.overview()));
  router.get('/games', validate(adminSearchQuerySchema, 'query'), async (req, res) => res.json(await adminService.searchGames(req.query)));
  router.get('/games/:id', validate(adminIdParamsSchema, 'params'), async (req, res) => res.json(await adminService.getGame(req.params.id)));
  router.get('/games/:id/header-options', validate(adminIdParamsSchema, 'params'), async (req, res) =>
    res.json(await adminService.headerOptions(req.params.id)),
  );
  router.patch('/games/:id', validate(adminIdParamsSchema, 'params'), validate(adminGameUpdateSchema), async (req, res) =>
    res.json(await adminService.updateGame(req.auth.userId, req.params.id, req.body)),
  );
  router.get('/trailers', async (req, res) => res.json(await adminService.hiddenTrailers()));
  router.post('/games/:id/trailers/restore', validate(adminIdParamsSchema, 'params'), validate(adminTrailerSchema), async (req, res) =>
    res.json(await adminService.restoreTrailer(req.auth.userId, req.params.id, req.body.videoId)),
  );
  router.get('/users', validate(adminSearchQuerySchema, 'query'), async (req, res) => res.json(await adminService.searchUsers(req.query)));
  router.patch('/users/:id/role', validate(adminIdParamsSchema, 'params'), validate(adminRoleSchema), async (req, res) =>
    res.json(await adminService.setRole(req.auth.userId, req.params.id, req.body.role)),
  );
  return router;
}
