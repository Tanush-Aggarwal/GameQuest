import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { createRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAuthService } from './services/authService.js';
import { User } from './models/User.js';
import { RefreshToken } from './models/RefreshToken.js';
import { Game } from './models/Game.js';
import { createIgdbAdapter } from './adapters/content/igdb.js';
import { createGameService } from './services/gameService.js';
import { LibraryEntry } from './models/LibraryEntry.js';
import { StatusHistory } from './models/StatusHistory.js';
import { createLibraryService } from './services/libraryService.js';
import { createEventBus } from './events/eventBus.js';

// Services can be injected (tests pass ones backed by in-memory models).
export function createApp({
  config,
  logger,
  authService = createAuthService({ User, RefreshToken, config }),
  gameService = createGameService({ Game, igdb: createIgdbAdapter({ config }), logger }),
  libraryService = createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus: createEventBus({ logger }), logger }),
}) {
  const app = express();

  // Proxies in front (Render, plus the Vercel rewrite in production); needed for correct client IPs.
  app.set('trust proxy', config.trustProxy ?? 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1', createRoutes({ authService, gameService, libraryService, config }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
