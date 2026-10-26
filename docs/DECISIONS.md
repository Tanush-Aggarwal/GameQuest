# GameQuest — Decisions log

Record every design or architecture decision here so every AI tool follows the same choices.
Format: date — decision — why.

- 2026-10-26 — One LibraryEntry per user per game with an `ownerships[]` array — the product promise is a unified library; per-platform entries would duplicate games.
- 2026-10-26 — Progress kept as three separate tracks (manual, achievement %, playtime) — playtime is not completion; synced data must not overwrite user input.
- 2026-10-26 — Background jobs with Agenda on MongoDB instead of BullMQ — no Redis to host or pay for.
- 2026-10-26 — IGDB as main game data source (also unlocks Twitch clips with the same credentials); RAWG as fallback.
- 2026-10-26 — Discord: OAuth `identify` + validated pasted invite first; bot-created invites/events second — linking an account cannot create server invites.
- 2026-10-26 — Dark-first UI with Quest Violet accent and Loot Gold reserved for rewards.
- 2026-10-26 — 3D features (Blender/VRoid) deferred until the full website is built.

## 2026-10-26 — Claude Code — item 1: monorepo scaffold
- npm workspaces (shared, server, client); plain JS + ESM everywhere; single flat ESLint config at root.
- Tailwind v3 (config maps colours to tokens.css CSS variables); Vite client; Jest (ESM via --experimental-vm-modules) server, Vitest client.
- docs/BLUEPRINT.md is still a placeholder — rules taken from AGENTS.md only.

## 2026-10-26 — Claude Code — item 3: auth design
- Access JWT (15 min) in HTTP-only cookie `gq_access` (path /); refresh JWT (7 d) in `gq_refresh` scoped to path /api/v1/auth. Prod cookies are Secure + SameSite=None, dev Lax.
- Refresh rotation: one RefreshToken doc per issued token (jti, familyId, usedAt, TTL on expiresAt). Used tokens are kept until expiry; replaying one deletes the whole family (reuse detection).
- Services take models by injection (`createAuthService({ User, RefreshToken, config })`) so tests run on in-memory fakes with no MongoDB. Real-DB behaviour (unique indexes, TTL) is not covered by tests yet.
- CSRF: no token yet. Mutations only accept JSON bodies (cross-site forms can't send them without a CORS preflight, which the CORS allow-list blocks). Revisit if non-JSON mutations are added.
- Register returns 409 naming the taken field (email/username). Accepted trade-off: it allows account enumeration, mitigated by the per-IP rate limit; revisit if email verification is added.
- Passwords are capped at 72 bytes in the shared schema because bcrypt silently truncates beyond that.
- A replayed refresh token within 10 s of its rotation returns 401 without revoking the family (two tabs refreshing at once); later replays revoke the whole family.
- If a DB error happens after a refresh token is claimed but before new ones are issued, the user must log in again (accepted).
- Logout deletes the refresh family; the access token stays valid until its 15 min expiry.
- Login does a dummy bcrypt compare for unknown emails to keep timing uniform.

## 2026-10-26 — Claude Code — item 5: game catalog
- The `Game` collection is itself the IGDB metadata cache (`cachedAt`, 30-day TTL, refreshed on view of a stale game). `MediaCache` is kept for trailers/clips/speedruns (Tier 2), not for core metadata.
- Cache-first search: MongoDB first; IGDB is queried only when a text search returns fewer rows than `limit` on page 1. A term is not re-sent to IGDB for 10 min (in-memory, per instance); a failed lookup is not remembered, so it retries.
- IGDB failures or missing Twitch credentials never fail `/games`: the response carries `warnings[]` (`UPSTREAM_ERROR` / `NOT_CONFIGURED`) and cached games. The adapter itself throws an `UpstreamError` naming the missing env vars.
- Game list sorts by `slug` with the slug as cursor (stable and cheap). Text-search relevance order is traded away; revisit with a score-based cursor if search quality matters.
- `slug` is `$setOnInsert` only, so public URLs never change when IGDB renames a game. Upserts use flat `$set` keys so other sources' `externalIds` and review counters are never overwritten.
- `/games` requires auth and has its own rate-limit bucket (300 / 15 min), because search can fan out to IGDB.
- Client: `useAsync` hook derives loading/error from the current load function so effects never set state synchronously (react-hooks lint rule) and stale responses are ignored. The Explore query lives in the URL (`?q=`).
- Server `dev` script uses `--watch-path=src` so OneDrive churn in node_modules cannot restart the server.

## 2026-10-26 — Claude Code — item 6: unified library
- Transitions (shared `LIBRARY_TRANSITIONS`, used by server and client): wishlist→backlog; backlog→playing|dropped|wishlist; playing→completed|dropped|backlog; completed→playing; dropped→backlog|playing. Includes the "undo" moves players really make (pause, resume, replay). Same-status and every other jump return 409 with `{from,to,allowed}`.
- New entries may only start as wishlist, backlog or playing (default backlog); Completed/Dropped are reached by moving, so the state machine cannot be bypassed on creation. Creation writes a StatusHistory row with `from: null`.
- Status change is a conditional update (`status: from` in the filter), so a double-click or second tab loses the race with a 409 instead of writing two history rows. No multi-document transaction: if the history write fails the status change stands and the error is logged.
- Completed sets `completedAt` and `manualProgress = 100`; leaving Completed clears `completedAt` and keeps progress.
- Entries are scoped by `userId` from the auth cookie in every query; someone else's entry is a 404, never a 403, so ids can't be probed.
- `GET /library` supports `?status=`, `?gameId=` (game page lookup) and cursor = last `_id` (newest first); tab counts are returned on the first page only. `PATCH /library/:id/visibility` is the dedicated hide-from-friends endpoint (no UI yet).
- `library.statusChanged` is emitted on an in-process event bus (`events/eventBus.js`); subscriber errors are caught and logged so they never fail a request. No subscribers yet (quests/activity come in Tier 4).
- Removing an entry also deletes its StatusHistory. The client confirms removal inline (Remove → Confirm/Cancel) rather than offering Undo.
- Server-test fakes: `createFakeCollection` in tests/helpers.js covers the Mongoose calls the services use; real indexes (unique pairs, sparse unique) are still not exercised against MongoDB.

## 2026-10-26 — Claude (cloud session) — deployment
- Production traffic goes browser → Vercel → (rewrite `/api/*`) → Render. The client calls `/api/v1` on its own origin, so auth cookies are first-party and use `SameSite=Lax; Secure`. Cross-site `SameSite=None` cookies are blocked in incognito/Safari, which is how evaluators open links. `COOKIE_SAMESITE=none` remains available for a direct cross-site setup.
- `TRUST_PROXY` is configurable (Render alone = 1, Vercel rewrite + Render = 2) so rate limits key on the real client IP.
- Real-time notifications use polling, not Socket.io: Vercel rewrites do not proxy WebSockets, and polling keeps the single-origin cookie model.
- Vercel builds from the repository root (`vercel.json`) so the `@gamequest/shared` workspace resolves; Render runs `npm ci` + `npm start` from the root for the same reason.
