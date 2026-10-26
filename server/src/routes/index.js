import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { createAuthRouter } from './auth.js';

export function createRoutes({ authService, config }) {
  const router = Router();

  router.get('/health', health);
  router.use('/auth', createAuthRouter({ authService, config }));

  return router;
}
