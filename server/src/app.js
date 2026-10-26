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

// `authService` can be injected (tests pass one backed by in-memory models).
export function createApp({
  config,
  logger,
  authService = createAuthService({ User, RefreshToken, config }),
}) {
  const app = express();

  // Render sits behind a proxy; needed for secure cookies and correct client IPs.
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1', createRoutes({ authService, config }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
