import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@gamequest/shared';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createAuthController } from '../controllers/authController.js';

// Express 5 forwards rejected promises to the error handler, so handlers need no try/catch.
export function createAuthRouter({ authService, googleAdapter, config }) {
  const router = Router();
  const controller = createAuthController({ authService, googleAdapter, config });
  const requireAuth = createRequireAuth(authService);

  const credentialsLimiter = createRateLimiter({ max: config.auth.rateLimitMax });
  const refreshLimiter = createRateLimiter({ max: config.auth.rateLimitMax * 3 });

  router.post('/register', credentialsLimiter, validate(registerSchema), controller.register);
  router.post('/login', credentialsLimiter, validate(loginSchema), controller.login);
  router.post('/verify-email', credentialsLimiter, validate(verifyEmailSchema), controller.verifyEmail);
  router.post('/resend-verification', credentialsLimiter, validate(resendVerificationSchema), controller.resendVerification);
  router.get('/providers', controller.providers);
  router.get('/google', credentialsLimiter, controller.googleStart);
  router.get('/google/callback', credentialsLimiter, controller.googleCallback);
  router.post('/refresh', refreshLimiter, controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  router.post('/forgot-password', credentialsLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
  router.post('/reset-password', credentialsLimiter, validate(resetPasswordSchema), controller.resetPassword);

  return router;
}
