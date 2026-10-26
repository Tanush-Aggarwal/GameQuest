# GameQuest — Progress log

Every AI tool reads this at the start of a session and updates it at the end.
Keep it short: newest first, one line per item.

## Current tier
Tier 1 — Foundation

## In progress
- (nothing yet)

## Next up (do these in order, one at a time)
1. Scaffold monorepo: `client/` (React + Vite + Tailwind + tokens.css), `server/` (Express + Mongoose), `shared/` (Zod), root `.gitignore`, `.env.example`
2. Server foundations: config, MongoDB connection, pino logger, helmet, CORS, central error handler + typed errors, `/api/v1/health`
3. Auth: register, login, refresh rotation, logout, `/auth/me`, rate limits, tests
4. Client shell: router, layout with top nav + mobile tab bar, auth pages, protected routes, toasts
5. Game catalog: IGDB adapter, Game model, cache-first search, game page skeleton
6. Unified library: LibraryEntry with `ownerships[]`, status state machine + StatusHistory, Library page
7. First deploy: Vercel + Render + Atlas, verify cookies/CORS on live URLs

## Done
- (nothing yet)

## Known issues / blockers
- (none)

## Session log
<!-- newest first: date — tool used — what changed — commit hash -->
