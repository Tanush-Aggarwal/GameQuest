# GameQuest — Progress log

Every AI tool reads this at the start of a session and updates it at the end.
Keep it short: newest first, one line per item.

## Current tier
Tier 4 — Social: collections, friends + activity feed, game sessions, and game recommendations complete; live cloud deploy postponed to end

## In progress
- (nothing)

## Next up (do these in order, one at a time)
13. UI & Visual Identity Overhaul: Game Page enrichment (Overview, Reviews, Friends Playing, ambient cover tinting), Library filter rail (platform, genre, length, shelf view), Explore curated discovery shelves
14. Cloud deploy (postponed to end): Atlas + Render + Vercel

## Done
- Catalog expansion & high-res posters: Expanded seed catalog to 32 iconic titles with 1080p vertical posters (`t_1080p`), release dates, genres, platforms, and timeToBeat numbers; added client-side cover upscaler (`getHighResCover`) in `GameCard.jsx`, `LibraryEntry.jsx`, `RecommendationsTab.jsx`, `RecommendationWidget.jsx`, `Home.jsx`, and `CollectionCard.jsx` to eliminate pixelation; enriched demo & alex libraries, reviews, play logs, and collections; 231 server tests + 108 client tests pass
- Database improvements: connection pooling & Atlas resilience in connectDb (maxPoolSize 20, minPoolSize 2, socketTimeoutMS 45s, autoIndex off in prod, error event listener), Game compound & weighted text indexes, MediaCache model with TTL, User profile fields (avatar, bio, favouriteGames <= 4, discord, notificationPrefs), aggregation ObjectId casting in reviewService, projection optimizations in insightsService, and dedicated db.test.js suite; 231 server tests + 108 client tests pass (339 total tests pass)
- Item 12 (game recommendations): Recommendation model with unique (fromId, toId, gameId) index, recommendationService (friend/block verification, review snippet linkage, inbox/sent listing, outcome tracking on status/review events, pick score calculation), /recommendations endpoints (create rate-limited, respond, delete, score), RecommendationsTab in Friends hub with Pick Score banner, RecommendationModal on Game and LibraryEntry pages, RecommendationWidget on Home dashboard, seeded recommendation from alex to demo; 11 server tests + 3 client tests (330 total tests pass)
- Item 11 (deploy readiness & verification): Vercel proxy rewrite + Render blueprint confirmed, automated post-deploy verification script (scripts/verify-deploy.js), CLIENT_ORIGIN trailing-slash normalization in config, package.json verify-deploy script, README deployment section updated; 211 server + 105 client tests pass
- Item 10 (game sessions): GameSession + Rsvp models, sessionService (friends/invite visibility, blocks, host-only update/cancel, RSVP with capacity, upcoming list with composite cursor, .ics), /sessions routes (create rate-limited), Sessions page grouped by local day, schedule form (game search or ?game=, invitees, Discord pattern check, UTC conversion), session detail (optimistic RSVP with rollback, attendees, Add to calendar, Join Discord, host edit/cancel), Home upcoming widget, seeded Hades night; 35 server + 19 client tests, hardened after review: atomic seat counter, friend-gated access, privacy-aware attendee lists
- Item 9 (friends + activity feed): Friendship/Block/Activity models, friendService (sorted-pair mutual friendships, crossed-request auto-accept, blocks override everything, username search), activityService (subscriber-written activity, read-time visibility incl. hiddenFromFriends, cursor feed), profileService + User.privacy, /friends /blocks /users /feed routes with request rate limit, Friends page (friends / requests / find, optimistic with rollback), /u/:username profile, Home friends feed, own Profile (privacy + blocked list), seeded user alex (friends with demo) with feed content; 34 server + 26 client tests
- Item 8b (collections): Collection + CollectionItem models, collectionService (manual fractional-position reorder, smart whitelist rules compiled on read, privacy filter, ownership), /collections routes + preview, collection.created / library.entryRemoved events, Collections + Collection detail pages (drag + up/down reorder with rollback, rule builder with live preview), Add-to-collection on the library entry page, seeded demo collections; 48 server + 21 client tests
- Item 8 (reviews): Review model, reviewService (upsert with aggregate avg refresh, delete, list), 6 new tests; ReviewPanel client component (StarPicker, own review, community list); /reviews routes; wired into LibraryEntry page; 83 server tests pass
- Item 7 (progress & insights): progressService (setProgress, logSession, journal CRUD, auto-promote backlog→playing), insightsService (getDashboard, getPlayNext, scorePlayNext, backlogHealth), PlayLog/JournalEntry models, /library/:id progress+journal routes, /insights routes, Home page rewrite (ResumeCard, StatTiles, PlayNext, BacklogHealth), LibraryEntry page (hero, status transitions, ProgressPanel, ReviewPanel), all 77→83 server tests pass, client builds clean
- Item 6: unified library (LibraryEntry with ownerships[], status state machine + StatusHistory, library.statusChanged event, /library endpoints, Library page with status tabs + optimistic moves, library panel on the game page; 15 new server tests, 11 new client tests)
- Item 5: game catalog (IGDB adapter with clear error when Twitch credentials are missing, Game model, cache-first search with filters + cursor pagination, /games and /games/:slug, Explore search page, game page skeleton; 18 new server tests, 8 new client tests)
- Item 1: monorepo scaffold (client/server/shared, tokens.css, .env.example, ESLint, Jest/Vitest)
- Item 2: server foundations (config validation, Mongo connect, pino, helmet, CORS, typed errors + central handler, validate middleware, /api/v1/health, 11 tests)
- Item 3: auth (register, login, refresh rotation + reuse detection, logout, /auth/me, rate limits, requireAuth/requireRole; 30 server tests in total)
- Item 4: client shell (lazy routes, top nav + mobile tab bar, login/register using shared Zod schemas, protected/public-only routes, session restore + refresh-on-401, toasts, ui primitives; 20 client tests)

## Known issues / blockers
- Sessions: RSVPs from someone later unfriended stay in the data (hidden from attendee lists, still counted in going). No reminder job, Discord OAuth/bot, or clash warning yet; session.updated/cancelled/rsvp events have no subscribers.
- The seeded demo session is created for two days after the seed is run; re-run 
pm run seed to get a fresh upcoming one after it ends.
- Jest prints "A worker process has failed to exit gracefully" when the server suite runs with workers (predates the social tests; all tests pass). Probably a leftover timer from a rate limiter/app instance; find it with --detectOpenHandles when convenient.
- Review lists (/reviews/game/:id, /reviews/user/:userId) ignore profile privacy and blocks (reviews are treated as public content).
- Feed/profile reads scan up to 5 batches to fill a page; a user with very many hidden items may get a short page with a cursor to continue.
- Seed: `npm run seed` (idempotent, reads MONGODB_URI from server/.env); Atlas must allow your current IP (Network Access).
- Library has no UI for adding ownerships/platforms (arrives with platform sync).
- Catalog search/refresh cooldowns are in-memory per instance (reset on restart, not shared across instances).
- Auth rate limiter uses the in-memory store (per instance, resets on restart).
- `trust proxy` is hard-coded to 1; verify the hop count on Render during the first deploy.
- Cookie `Secure` follows NODE_ENV=production only.
- No end-to-end test against real MongoDB yet; indexes and TTL need a check.
- Client: after a manual logout the login redirect state is not cleared on the next login of a different user (minor).
- docs/BLUEPRINT.md is still a placeholder.

## Session log
<!-- newest first: date — tool used — what changed — commit hash -->
- 2026-10-27 — Antigravity — catalog expansion (32 games in 1080p, enriched demo/alex libraries & reviews) and client high-res cover upscaler (getHighResCover); 231 server tests, 108 client tests pass clean
- 2026-10-27 — Antigravity — database optimization & model enhancements (db options, Game indexes, MediaCache, User fields, reviewService aggregation cast, insights projections, db.test.js); 231 server tests, 108 client tests pass clean
- 2026-10-27 — Antigravity — game recommendations (model, service, endpoints, Friends tab, modals, Home widget, seed); 222 server tests, 108 client tests pass clean
- 2026-10-27 — Antigravity — deploy verification script, CORS origin trailing-slash normalization, updated README & deploy docs; 211 server tests, 105 client tests pass clean
- 2026-10-27 — Claude Code — collections (3e292b5), friends + activity feed (797dd90), game sessions + README; server 211 tests, client 105; demo + alex seeded
- 2026-10-27 — Claude Code — applied bundle ce99c9c, approved install scripts, `npm run seed` + `npm run dev` verified against Atlas and real IGDB (Celeste/Hades search OK, no upstream errors); fixed seed giving Hades the wrong slug (IGDB: `hades--1`), which made IGDB's own `hades` fail to cache with E11000.
- 2026-10-26 — Claude Code — reviews + seed script + README; 83 server tests — 349fdc2
- 2026-10-26 — Claude Code — progress/insights/LibraryEntry page; 77→83 tests — 556e9fb
