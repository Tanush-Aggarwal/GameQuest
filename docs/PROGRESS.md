# GameQuest — Progress log

Every AI tool reads this at the start of a session and updates it at the end.
Keep it short: newest first, one line per item.

## Current tier
Tier 1 — Foundation

## In progress
- (nothing yet)

## Next up (do these in order, one at a time)
4. Client shell: router, layout with top nav + mobile tab bar, auth pages, protected routes, toasts
5. Game catalog: IGDB adapter, Game model, cache-first search, game page skeleton
6. Unified library: LibraryEntry with `ownerships[]`, status state machine + StatusHistory, Library page
7. First deploy: Vercel + Render + Atlas, verify cookies/CORS on live URLs

## Done
- Item 1: monorepo scaffold (client/server/shared, tokens.css, .env.example, ESLint, Jest/Vitest)
- Item 2: server foundations (config validation, Mongo connect, pino, helmet, CORS, typed errors + central handler, validate middleware, /api/v1/health, 11 tests)
- Item 3: auth (register, login, refresh rotation + reuse detection, logout, /auth/me, rate limits, requireAuth/requireRole; 30 server tests in total)

## Known issues / blockers
- docs/BLUEPRINT.md is still a placeholder; export the real blueprint when available
- Auth rate limiter uses the in-memory store (per instance, resets on restart; login and register have separate buckets). Move to a shared store before scaling beyond one instance.
- `trust proxy` is hard-coded to 1; verify the hop count on Render during the first deploy.
- Cookie `Secure` follows NODE_ENV=production only; no CSRF header check on cookie-authenticated POSTs (see DECISIONS).
- Auth is tested against in-memory fakes only; unique indexes / TTL need a check against a real MongoDB.

## Session log
<!-- newest first: date — tool used — what changed — commit hash -->


