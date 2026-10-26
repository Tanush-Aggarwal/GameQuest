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

## 2026-10-27 — Claude Code — item 8: collections
- Manual collections store items in their own `CollectionItem` collection with a fractional `position`. A move writes the midpoint of the new neighbours (top: first-1, bottom: last+1); when two neighbours are closer than 1e-9 the list is renumbered 1..n once and the midpoint recomputed. Reorder is `PATCH /collections/:id/items/:itemId/position {afterItemId|null}` (dedicated endpoint, one write per move).
- Smart collections store nothing: rules are compiled on every read (`utils/smartRules.js`) from a whitelist of fields, operators and value types (shared `RULE_FIELDS` / `OPERATORS_BY_KIND`). Field and operator names are looked up with `Object.hasOwn`, values must be plain numbers/dates/strings (objects are rejected), so no user text becomes a Mongo key or operator. Rules are split by source: entry fields (status, manualProgress, lastPlayedAt) filter the owner's `LibraryEntry`, game fields (genres, platforms, timeToBeat.main, ratingAvg, releaseDate) filter `Game`; the owner's library bounds the query, never the catalog. A smart result is capped at 500 and pages by entry id.
- Items point at the owner's `LibraryEntry`, not at a `Game`, so status/progress show live and a collection can only hold games the owner has.
- Privacy is applied in `collectionService`: owner always; `public` for anyone not blocked; `friends` for friends; `private` owner only. A collection the viewer can't see is a 404 (existence is not revealed); a visible collection the viewer doesn't own gives 403 on writes. Entries marked `hiddenFromFriends` are removed from every non-owner view, including item counts and covers.
- The friend/block checks arrive through an injected `social = { isFriend, isBlocked }` (defaults: nobody is a friend) so collections don't depend on the friends feature; the friends item wires the real one.
- Ownership is enforced in the service (`loadOwned`) rather than a route middleware because it must pick 403 vs 404 from the collection's visibility.
- `library.entryRemoved` is emitted by `libraryService.remove`; `events/subscribers.js` listens and deletes the entry's collection items. The bus is now injectable into `createApp`.
- `collection.created` is emitted on create (for the activity feed later).
- Counts and covers in list views are computed per collection (2–3 queries each, page ≤ 24); acceptable at this scale, revisit with stored counts if lists grow.
- Seed: a real IGDB lookup overwrote Celeste's seeded 8h with 21.3h, so the "Short backlog" smart collection added two genuinely short backlog games (A Short Hike, Undertale).
- Small fixes made on the way: the LibraryEntry page used its own transition table (offered wishlist→playing, which the server rejects) and passed the wrong props to `ErrorState` (no Retry button); it now uses the shared `LIBRARY_TRANSITIONS` and correct props. Pre-existing lint errors (unused variables, unescaped quotes, setState-in-effect) were cleaned up.

## 2026-10-27 — Claude Code — item 9: friends + activity feed
- `Friendship` stores the pair sorted (`userA < userB` as strings) with a unique index, so there is exactly one document per pair whoever asks. Status is `pending | accepted`; declining or cancelling deletes the document (the sender may ask again), and crossed requests (A→B while B→A is pending) auto-accept. Dedicated endpoints: `POST /friends/requests`, `POST /friends/requests/:id/accept|decline`, `DELETE /friends/requests/:id` (cancel), `DELETE /friends/:userId`. Request creation has its own rate limit (30 / 15 min).
- Blocks (`Block {blockerId, blockedId}`) override everything: blocking deletes any friendship/request between the pair; a blocked player gets 404 on profile, search and requests (indistinguishable from "no such player"); the blocker gets 403 when trying to request ("unblock first"). `friendService` exposes `isFriend` / `isBlocked` / `friendIds` / `relation`, and collections + activity + profiles all use it, so there is one definition of "friend".
- Activity is written ONLY by event-bus subscribers (`events/subscribers.js` → `activityService.record`): `library.statusChanged`, `review.created`, `library.sessionLogged`, `collection.created` (and `session.created` for sessions). `reviewService` now emits `review.created` on a first review only (edits are quiet). Private collections leave no activity. The seed also builds alex's feed through the real services + subscribers, not by inserting rows.
- Visibility is stored as a coarse `level` (public/friends) and re-checked at READ time, because `hiddenFromFriends` and collection visibility can change after the fact: hidden entries drop out of everyone else's feed, library activity whose entry was removed is dropped, and a collection's activity follows its current visibility. Readers scan up to 5 batches to fill a page, and the cursor lets the client continue.
- Feed = friends' activity only (your own actions are not in it). Profile activity depends on the viewer: self sees all, a friend sees friends+public items, anyone else only public items (reviews and public collections).
- Profiles: `User.privacy` public | friends | private (default public), changed by `PATCH /users/me/privacy`. `GET /users/:username` returns `restricted: true` (no stats) for a viewer who may not see it, and the activity/collections endpoints answer 403; blocks answer 404. Stats leave out games hidden from friends. The three profile sections have separate endpoints so one failing section never blanks the page.
- Search is by username prefix on the lowercase copy, regex-escaped, ≥ 2 characters; users who blocked the searcher are excluded.
- Known gap: `/reviews/game/:id` and `/reviews/user/:userId` (from the reviews item) don't apply profile privacy or blocks; reviews are treated as public content for now.
- Test fakes: the auth fake's `User` is now a generic fake collection (24-hex ids, `find`, `$in`, `$regex`), so social tests can query the same users the auth service created.
