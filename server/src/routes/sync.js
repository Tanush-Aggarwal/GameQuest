import { Router } from 'express';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export function createSyncRouter({ authService, steamSyncService }) {
  const router = Router();

  // One sync per user every 5 minutes. Failed attempts (private profile, Steam down) don't use it up.
  const steamLimiter = createRateLimiter({
    max: 1,
    windowMs: 5 * 60 * 1000,
    keyGenerator: (req) => `steam-sync:${req.auth.userId}`,
    skipFailedRequests: true,
    message: 'You synced Steam a moment ago. You can sync again in a few minutes.',
  });

  router.use(createRequireAuth(authService));
  router.post('/steam', steamLimiter, async (req, res) => {
    const { added, updated, unmatched, warnings } = await steamSyncService.syncUser(req.auth.userId);
    res.json({ added, updated, unmatched, warnings });
  });

  return router;
}
