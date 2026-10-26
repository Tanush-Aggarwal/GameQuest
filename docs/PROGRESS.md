# GameQuest — Progress log

Every AI tool reads this at the start of a session and updates it at the end.
Keep it short: newest first, one line per item.

## Current tier
Tier 2 — In Progress (Progress tracking, Reviews complete)

## In progress
- (nothing)

## Next up (do these in order, one at a time)
10. Game sessions (invite, RSVP, .ics)
11. First deploy: Vercel + Render + Atlas, verify cookies/CORS on live URLs (postponed)

## Done
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
- 2026-10-27 — Claude Code — applied bundle ce99c9c, approved install scripts, `npm run seed` + `npm run dev` verified against Atlas and real IGDB (Celeste/Hades search OK, no upstream errors); fixed seed giving Hades the wrong slug (IGDB: `hades--1`), which made IGDB's own `hades` fail to cache with E11000.
- 2026-10-26 — Claude Code — reviews + seed script + README; 83 server tests — 349fdc2
- 2026-10-26 — Claude Code — progress/insights/LibraryEntry page; 77→83 tests — 556e9fb
