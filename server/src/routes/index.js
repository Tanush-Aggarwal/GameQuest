import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { createAuthRouter } from './auth.js';
import { createGamesRouter } from './games.js';
import { createLibraryRouter } from './library.js';

export function createRoutes({ authService, gameService, libraryService, config }) {
  const router = Router();

  router.get('/health', health);
  router.use('/auth', createAuthRouter({ authService, config }));
  router.use('/games', createGamesRouter({ authService, gameService }));
  router.use('/library', createLibraryRouter({ authService, libraryService }));

  return router;
}
