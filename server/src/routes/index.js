import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { createAuthRouter } from './auth.js';
import { createGamesRouter } from './games.js';

export function createRoutes({ authService, gameService, config }) {
  const router = Router();

  router.get('/health', health);
  router.use('/auth', createAuthRouter({ authService, config }));
  router.use('/games', createGamesRouter({ authService, gameService }));

  return router;
}
