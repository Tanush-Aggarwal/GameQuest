# GameQuest — Progress log

Every AI tool reads this at the start of a session and updates it at the end.
Keep it short: newest first, one line per item.

## Current tier
Tier 1 — Foundation

## In progress
- (nothing yet)

## Next up (do these in order, one at a time)
6. Unified library: LibraryEntry with `ownerships[]`, status state machine + StatusHistory, Library page
7. First deploy: Vercel + Render + Atlas, verify cookies/CORS on live URLs

## Done
- Item 5: game catalog (IGDB adapter with clear error when Twitch credentials are missing, Game model, cache-first search with filters + cursor pagination, /games and /games/:slug, Explore search page, game page skeleton; 18 new server tests, 8 new client tests)
- Item 1: monorepo scaffold (client/server/shared, tokens.css, .env.example, ESLint, Jest/Vitest)
- Item 2: server foundations (config validation, Mongo connect, pino, helmet, CORS, typed errors + central handler, validate middleware, /api/v1/health, 11 tests)
- Item 3: auth (register, login, refresh rotation + reuse detection, logout, /auth/me, rate limits, requireAuth/requireRole; 30 server tests in total)
- Item 4: client shell (lazy routes, top nav + mobile tab bar, login/register using shared Zod schemas, protected/public-only routes, session restore + refresh-on-401, toasts, ui primitives; 20 client tests)

## Known issues / blockers
- IGDB lookups have never run against real credentials; adapter is tested with a mocked fetch only. Set TWITCH_CLIENT_ID/SECRET in server/.env and search once to verify.
- Catalog search/refresh cooldowns are in-memory per instance (reset on restart, not shared across instances). Local text search matches whole words, so a partial word triggers an IGDB lookup.
- Two IGDB games sharing one Steam uid would fail the second upsert (unique sparse index); it is logged and skipped.
- docs/BLUEPRINT.md is still a placeholder; export the real blueprint when available
- Auth rate limiter uses the in-memory store (per instance, resets on restart; login and register have separate buckets). Move to a shared store before scaling beyond one instance.
- `trust proxy` is hard-coded to 1; verify the hop count on Render during the first deploy.
- Cookie `Secure` follows NODE_ENV=production only; no CSRF header check on cookie-authenticated POSTs (see DECISIONS).
- No seeded demo account exists yet and nothing has been run against a real MongoDB; end-to-end login is unverified until MONGODB_URI and the JWT secrets are set.
- Client: after a manual logout the login redirect state is not cleared on the next login of a different user (minor).
- Auth is tested against in-memory fakes only; unique indexes / TTL need a check against a real MongoDB.

## Session log
<!-- newest first: date — tool used — what changed — commit hash -->



