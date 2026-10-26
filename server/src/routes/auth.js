import { Router } from 'express';
import { loginSchema, registerSchema } from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createAuthController } from '../controllers/authController.js';

// Express 5 forwards rejected promises to the error handler, so handlers need no try/catch.
export function createAuthRouter({ authService, config }) {
  const router = Router();
  const controller = createAuthController({ authService, config });
  const requireAuth = createRequireAuth(authService);

  const credentialsLimiter = createRateLimiter({ max: config.auth.rateLimitMax });
  const refreshLimiter = createRateLimiter({ max: config.auth.rateLimitMax * 3 });

  router.post('/register', credentialsLimiter, validate(registerSchema), controller.register);
  router.post('/login', credentialsLimiter, validate(loginSchema), controller.login);
  router.post('/refresh', refreshLimiter, controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}
