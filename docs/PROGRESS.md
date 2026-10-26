# GameQuest — Progress log

Every AI tool reads this at the start of a session and updates it at the end.
Keep it short: newest first, one line per item.

## Current tier
Tier 2 — In Progress (Progress tracking, Reviews complete)

## In progress
- (nothing)

## Next up (do these in order, one at a time)
7. First deploy: Vercel + Render + Atlas, verify cookies/CORS on live URLs
8. Collections (manual, smart rules) — model + service + routes + client
9. Friends + activity feed
10. Game sessions (invite, RSVP, .ics)

## Done
- Item 8 (reviews): Review model, reviewService (upsert with aggregate avg refresh, delete, list), 6 new tests; ReviewPanel client component (StarPicker, own review, community list); /reviews routes; wired into LibraryEntry page; 83 server tests pass
- Item 7 (progress & insights): progressService (setProgress, logSession, journal CRUD, auto-promote backlog→playing), insightsService (getDashboard, getPlayNext, scorePlayNext, backlogHealth), PlayLog/JournalEntry models, /library/:id progress+journal routes, /insights routes, Home page rewrite (ResumeCard, StatTiles, PlayNext, BacklogHealth), LibraryEntry page (hero, status transitions, ProgressPanel, ReviewPanel), all 77→83 server tests pass, client builds clean
- Item 6: unified library (LibraryEntry with ownerships[], status state machine + StatusHistory, library.statusChanged event, /library endpoints, Library page with status tabs + optimistic moves, library panel on the game page; 15 new server tests, 11 new client tests)
- Item 5: game catalog (IGDB adapter with clear error when Twitch credentials are missing, Game model, cache-first search with filters + cursor pagination, /games and /games/:slug, Explore search page, game page skeleton; 18 new server tests, 8 new client tests)
- Item 1: monorepo scaffold (client/server/shared, tokens.css, .env.example, ESLint, Jest/Vitest)
- Item 2: server foundations (config validation, Mongo connect, pino, helmet, CORS, typed errors + central handler, validate middleware, /api/v1/health, 11 tests)
- Item 3: auth (register, login, refresh rotation + reuse detection, logout, /auth/me, rate limits, requireAuth/requireRole; 30 server tests in total)
- Item 4: client shell (lazy routes, top nav + mobile tab bar, login/register using shared Zod schemas, protected/public-only routes, session restore + refresh-on-401, toasts, ui primitives; 20 client tests)

## Known issues / blockers
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
