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
import { PlayLog } from './models/PlayLog.js';
import { JournalEntry } from './models/JournalEntry.js';
import { createLibraryService } from './services/libraryService.js';
import { createProgressService } from './services/progressService.js';
import { createInsightsService } from './services/insightsService.js';
import { createEventBus } from './events/eventBus.js';
import { Review } from './models/Review.js';
import { createReviewService } from './services/reviewService.js';
import { Collection } from './models/Collection.js';
import { CollectionItem } from './models/CollectionItem.js';
import { createCollectionService } from './services/collectionService.js';
import { registerSubscribers } from './events/subscribers.js';
import { Friendship } from './models/Friendship.js';
import { Block } from './models/Block.js';
import { Activity } from './models/Activity.js';
import { createFriendService } from './services/friendService.js';
import { createActivityService } from './services/activityService.js';
import { createProfileService } from './services/profileService.js';
import { GameSession } from './models/GameSession.js';
import { Rsvp } from './models/Rsvp.js';
import { createSessionService } from './services/sessionService.js';
import { Recommendation } from './models/Recommendation.js';
import { createRecommendationService } from './services/recommendationService.js';
import { createSteamAdapter } from './adapters/platforms/steam.js';
import { createSteamService } from './services/steamService.js';
import { createSteamSyncService } from './services/steamSyncService.js';
import { createCatalogImportService } from './services/catalogImportService.js';
import { MediaCache } from './models/MediaCache.js';
import { createArtService } from './services/artService.js';
import { createYoutubeAdapter } from './adapters/content/youtube.js';
import { createTrailerService } from './services/trailerService.js';
import { createHomeService } from './services/homeService.js';
import { createNotificationService } from './services/notificationService.js';
import { createAccountService } from './services/accountService.js';
import { createRequirementsService } from './services/requirementsService.js';
import { createGoogleAdapter } from './adapters/auth/google.js';

// Services can be injected (tests pass ones backed by in-memory models).
export function createApp({
  config,
  logger,
  authService = createAuthService({ User, RefreshToken, config }),
  gameService: _gameSvc,
  libraryService: _libSvc,
  progressService: _progressSvc,
  insightsService: _insightsSvc,
  reviewService: _reviewSvc,
  collectionService: _collectionSvc,
  friendService: _friendSvc,
  activityService: _activitySvc,
  profileService: _profileSvc,
  sessionService: _sessionSvc,
  recommendationService: _recSvc,
  igdbAdapter = createIgdbAdapter({ config }),
  steamAdapter = createSteamAdapter({ config }),
  steamService: _steamSvc,
  steamSyncService: _steamSyncSvc,
  youtubeAdapter = createYoutubeAdapter({ config }),
  trailerService: _trailerSvc,
  homeService: _homeSvc,
  notificationService: _notifSvc,
  accountService: _accountSvc,
  requirementsService: _reqSvc,
  googleAdapter = createGoogleAdapter({ config }),
  eventBus = createEventBus({ logger }),
}) {
  const libraryService = _libSvc ?? createLibraryService({ LibraryEntry, StatusHistory, Game, eventBus, logger });
  const progressService = _progressSvc ?? createProgressService({ LibraryEntry, PlayLog, JournalEntry, libraryService, eventBus, logger });
  const insightsService = _insightsSvc ?? createInsightsService({ LibraryEntry, PlayLog, StatusHistory, Game, logger });
  const reviewService = _reviewSvc ?? createReviewService({ Review, Game, User, eventBus });
  const friendService = _friendSvc ?? createFriendService({ Friendship, Block, User, LibraryEntry, Game, eventBus });
  const artService = createArtService({ Game, MediaCache, steam: steamAdapter, logger });
  const gameService =
    _gameSvc ??
    createGameService({ Game, igdb: igdbAdapter, logger, friendService, LibraryEntry, User, artService });
  const collectionService =
    _collectionSvc ??
    createCollectionService({ Collection, CollectionItem, LibraryEntry, Game, User, eventBus, logger, social: friendService });
  const activityService =
    _activitySvc ?? createActivityService({ Activity, LibraryEntry, Game, User, Collection, GameSession, social: friendService, logger });
  const profileService =
    _profileSvc ?? createProfileService({ User, LibraryEntry, Review, friendService, activityService, collectionService, Game });
  const sessionService =
    _sessionSvc ?? createSessionService({ GameSession, Rsvp, Game, User, social: friendService, eventBus });
  const recommendationService =
    _recSvc ??
    createRecommendationService({
      Recommendation,
      Game,
      User,
      Review,
      LibraryEntry,
      libraryService,
      social: friendService,
      eventBus,
      logger,
    });
  const steamService = _steamSvc ?? createSteamService({ User, steam: steamAdapter });
  const trailerService = _trailerSvc ?? createTrailerService({ Game, MediaCache, youtube: youtubeAdapter, logger });
  const steamSyncService =
    _steamSyncSvc ??
    createSteamSyncService({
      User,
      Game,
      LibraryEntry,
      StatusHistory,
      steam: steamAdapter,
      igdb: igdbAdapter,
      importGame: createCatalogImportService({ Game, MediaCache, igdb: igdbAdapter }).upsertGame,
      fillArt: artService.fillSteamArt,
      eventBus,
      logger,
    });
  const homeService =
    _homeSvc ?? createHomeService({ Game, User, Collection, Review, LibraryEntry, insightsService });
  const notificationService =
    _notifSvc ?? createNotificationService({ User, Friendship, Recommendation, GameSession, Rsvp, Game });
  const accountService =
    _accountSvc ??
    createAccountService({
      User,
      RefreshToken,
      LibraryEntry,
      StatusHistory,
      PlayLog,
      JournalEntry,
      Review,
      Game,
      Collection,
      CollectionItem,
      Friendship,
      Block,
      Activity,
      GameSession,
      Rsvp,
      Recommendation,
      notificationService,
      logger,
    });
  const requirementsService = _reqSvc ?? createRequirementsService({ Game, MediaCache, steam: steamAdapter, logger });
  registerSubscribers({ eventBus, collectionService, activityService, recommendationService });

  const app = express();

  // Proxies in front (Render, plus the Vercel rewrite in production); needed for correct client IPs.
  app.set('trust proxy', config.trustProxy ?? 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1', createRoutes({
      authService,
      gameService,
      libraryService,
      progressService,
      insightsService,
      reviewService,
      collectionService,
      friendService,
      activityService,
      profileService,
      sessionService,
      recommendationService,
      steamService,
      steamSyncService,
      trailerService,
      homeService,
      requirementsService,
      accountService,
      notificationService,
      googleAdapter,
      LibraryEntry,
      config,
    }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
