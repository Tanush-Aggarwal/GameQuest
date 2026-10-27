# GameQuest — Product & Design Blueprint

Oct 26, 2026 · @Tanush Aggarwal

## Product vision

GameQuest is one home for every game you own, play and want — and the friends you play them with. It turns a scattered, guilt-inducing backlog into a set of clear next steps, small wins and shared sessions.

**Problem.** Gamers own games across Steam, Xbox, Epic, consoles and more. Libraries, achievements and wishlists live in separate apps, so nobody sees the full picture. Backlogs grow, games go unfinished, and friends rarely know what each other are playing.

**Target users.** College students and regular gamers who own games on more than one platform, have a growing backlog, and play with a friend group (often coordinated on Discord).

**Core promise — three things every screen should serve:**

1. **See everything** — one unified library across platforms, with real progress.
2. **Decide what to play** — time-to-beat, series order, smart suggestions and quests make the next game obvious.
3. **Play together** — friends, recommendations and scheduled sessions turn a solo tracker into a shared habit.

**Design principle.** If a feature does not help a user see, decide or play together, it does not ship.

## Core user journeys

Five journeys carry the product. Every feature below exists to make one of them better; the demo video walks through them in this order.

1. **Build my library** — Sign up → connect Steam (or import a CSV) → games merge into one unified library, de-duplicated across platforms → playtime and achievements fill in automatically.
2. **Decide what to play next** — Open the dashboard → "Play next" suggests 3 backlog games with reasons ("\~9h to beat, matches your 5★ RPGs") → open a game page with time-to-beat, trailer, series order and friends' progress → start it.
3. **Track and finish** — Log sessions and journal notes → sync updates achievements → progress, quests and backlog health move → completion creates a trophy, a feed card and a "you vs average vs world record" moment.
4. **Organise and share** — Build a collection (manual or smart) → make it public, invite a collaborator or start it as a play-through challenge → others save or fork it.
5. **Play together** — Add a friend → recommend a game with your review → see what they play → schedule a session with RSVP, ownership check, reminder and Discord invite.

## Feature set

Every feature is kept; they are grouped into four build tiers so each tier ships a complete, deployable app. The rules in bold are what make each one real application logic rather than CRUD.

### Tier 1 — Foundation

**Accounts and security**

- Register, login, logout; bcrypt hashing; short-lived access token + rotating refresh token in HTTP-only cookies; reuse of a refresh token revokes the session.
- Zod validation shared by client and server; rate limits on auth routes.
- Roles: USER, ADMIN. Profile privacy: Public, Friends only, Private — **enforced on every read endpoint**.

**Game catalog**

- Metadata from IGDB (one Twitch developer login also covers Twitch clips). RAWG as a fallback adapter.
- **Cache-first:** search hits MongoDB; misses fetch, normalise and upsert. Text index search, filters (genre, platform, length, rating), cursor pagination.
- `externalIds` on every game: igdb, steam, twitch, speedrun.

**Unified library**

- **One entry per user per game**, with an `ownerships[]` array (platform, external id, playtime, last synced). Owning a game on two platforms shows one card with two platform badges.
- **Status state machine:** Wishlist → Backlog → Playing → Completed / Dropped. Invalid jumps rejected; Completed sets `completedAt` and progress 100; every change written to `StatusHistory`.
- Per-game "hide from friends" switch.

### Tier 2 — Progress and insight

**Progress model**

- Three tracks, never merged: manual %, achievement % (unlocked ÷ total), playtime (informational).
- **Conflict rule:** synced data never overwrites manual input; both are shown.
- `AchievementSnapshot` on each sync → progress-history chart.

**Play sessions and journal**

- Log a session (date, duration, optional note). Feeds playtime for non-synced games, streaks and stats.
- Private journal per game + a **Resume card** on the dashboard: last session, days ago, your last note.

**Platform sync**

- Steam: OpenID link, owned games + playtime, achievements for recently played games, concurrency-limited.
- Xbox: adapter behind a feature flag; verify access terms before enabling.
- Epic, GOG, consoles: generic **Import adapter** (CSV/JSON) with a preview-and-confirm step.
- **Sync runs as a background job** (Agenda on MongoDB): Queued → Running → Succeeded / Failed, live status in the UI, retries with backoff, 10-minute cooldown, idempotent upserts, nightly auto-sync.

**Game page enrichment**

- Time to beat (main / extras / 100%) from IGDB; world records per category from speedrun.com with the WR video; official trailers; top Twitch clips by views; YouTube gameplay results stored per game.
- **Per-source cache TTLs**, stale-while-revalidate, YouTube quota counter, `Promise.allSettled` so one failing source only empties its own section.
- Click-to-play embeds; always credit and link the source.

**Dashboard and insight**

- Aggregation-pipeline stats: library size, completed, playing, backlog, total playtime, top genres, achievement %.
- **Backlog health:** games added vs finished per month, backlog in hours, projected clear date.
- **Play next:** scores backlog games by genre match with your 4★+ ratings, time in backlog, partial progress, time to beat — and shows the reason.
- **Your pace:** your playtime vs average time to beat; on completion, you vs average vs world record.

### Tier 3 — Organise and discover

**Series pages**

- IGDB series/franchise data; release order plus admin-curated story order; mainline vs spin-off; remakes grouped under originals.
- "You've finished 3 of 7 — next up" with time to beat; series quests; sequel prompt on completion.

**Collections**

- Manual collections: title, description, tags, auto mosaic cover, Public / Unlisted / Private, drag-to-reorder (fractional `position`), per-item notes.
- **Smart collections:** saved rules (whitelisted fields and operators) compiled to a safe MongoDB query.
- Collaborators with editor / viewer roles; save and fork with credit; play-through mode with a progress bar; trending on Discover (saves + forks, last 7 days).

**Reviews**

- One per user per game, only for games past Wishlist; spoiler tag; helpful votes; auto badge "reviewed at 64% progress".
- Game rating average and count updated atomically.
- **Spoiler-safe mode:** spoiler reviews stay blurred until your progress passes the reviewer's.

**Discovery extras**

- Hidden gems (high rating, few ratings, from your own review data); release calendar for wishlisted games with day-one reminders; wishlist price alerts (verify a price source's access first).

### Tier 4 — Social and play together

**Friends**

- Mutual friendship: Pending → Accepted / Declined / Cancelled; block; crossed requests auto-accept; find by username, invite link, or opted-in Discord friends.
- Friends tab: now playing, completions, milestones, quests. Game pages show "3 friends playing · Arjun at 72%". Compare view per game.

**Recommendations**

- Send a game + message + optional review to a friend; inbox with Add / Already played (auto-detected) / Not for me.
- No duplicate recommendation per friend per game; outcome tracking ("Riya finished Hades, 5★"); **pick score** per friend.

**Sessions with Discord**

- Schedule: game, time (stored UTC, shown local), invitees, Discord invite. RSVP Going / Maybe / Can't.
- Ownership check with one-click recommend; clash warning; reminder job 30 min before; `.ics` download; lifecycle Scheduled → Live → Completed / Cancelled.
- Discord level 1: OAuth `identify` link + pasted invite validated server-side, shown only to invitees. Level 2: GameQuest bot creates the invite and a Discord scheduled event.

**Quests and rewards**

- User and monthly system quests ("Finish 2 backlog games", "Beat a game under average time", "Finish the trilogy"); progress driven by library events.
- Year in Review page; shareable completion cards.

**Notifications and moderation**

- Internal event bus → notification service; Socket.io real-time with polling fallback; per-event preferences and a daily digest.
- Reports: Open → Under review → Resolved / Dismissed; auto-hide after N reports; audit log; timed suspensions; admin fixes for external-ID mismatches and series story order.

**Data ownership**

- Export library, reviews, collections and journal as JSON / CSV.

## UI inspiration review

GameQuest borrows the best-known pattern from each product its users already live in, so it feels familiar on day one. The review below is from hands-on familiarity with each product; check the latest versions for screenshots before you design.

| Product | What it does well | Borrow for GameQuest | Avoid |
| --- | --- | --- | --- |
| Steam library | Big hero art per game, an action strip under it, shelves you curate, dynamic collections | Game page hero + action bar; shelves on the dashboard; smart collections | Dense small text, deep nested menus, store vs library confusion |
| PlayStation 5 | Per-game hub with activity cards, trophy tiers, ambient background tinted from game art | Game page "cards" (progress, next step, friends); bronze → platinum tiers; colour tint from cover art | Settings and details hidden too deep |
| Xbox app | Bold tiles, clear top-level tabs, achievements with rarity %, "leaving soon" urgency | Achievement rarity; tab bars; urgency chips ("release in 3 days", "price drop") | Ad-heavy home that pushes content over your own games |
| GOG Galaxy 2.0 | The closest product: unified multi-platform library, platform badges, grid/list views, filter sidebar | Platform badges on one card; view toggle; filter rail | Slow, crowded filters; stats buried in a separate place |
| Backloggd / Letterboxd | Diary, lists, ratings culture, poster grids, "favourite 4" profile showcase | Profile showcase; review cards; rating histogram on game pages; lists feel | Social-first with little personal utility |
| Spotify | Playlists with mosaic covers, play-through flow, yearly Wrapped | Collections page, mosaic cover, play-through mode, Year in Review | Endless autoplay-style feeds |
| Discord | Presence ("playing now"), friend list, event cards with RSVP | Friends rail with live status; session cards with RSVP avatars | Notification noise |

**What GameQuest adds that none of them do:** one card per game across platforms, time-to-beat everywhere a decision is made, and a single "Play next" answer with its reasons.

## Design system

GameQuest uses one theme only: a warm ivory light theme with a dark sidebar. Game art carries the colour, the interface stays quiet. Art headers (game, library entry, collection, profile, session) are dark because they sit on game art behind a scrim; text on them is white. There is no dark theme and no theme toggle.

### Colour tokens

Every colour is a CSS variable in `client/src/styles/tokens.css`, mapped into Tailwind. Do not hard-code page colours.

| Token | Value | Used for |
| --- | --- | --- |
| `--bg` | #F2EEE4 | Page background |
| `--surface` | #FBF8F1 | Cards, panels |
| `--surface-raised` | #E8DFCF | Hover, menus, chips |
| `--border` | #D3C8B7 | Dividers, card outlines |
| `--text` / `--text-muted` | #151713 / #625B4F | Body text / secondary text |
| `--accent` / `--accent-fg` | #C9F36D / #151713 | Primary buttons, active states |
| `--accent-text` | #9B3510 | Accent-coloured text on ivory |
| `--secondary-accent` | #B8420E | Highlights, icons |
| `--reward` | #8B5A14 | Trophies, XP, ratings |
| Status: Playing / Completed / Backlog / Wishlist / Dropped | #155F77 / #17633B / #625B4F / #9B3510 / #A32828 | Status chips, icons |
| Trophy tiers: Bronze / Silver / Gold / Platinum | #8B4A1B / #62686C / #8B5A14 / #155F77 | Trophy badges |
| Sidebar | #111311 bg, #8E928B text | Left navigation rail |

Never rely on colour alone: every status also has an icon and a label.

### Typography

- **Headings:** Space Grotesk (600) — a slightly techy, game-like feel without being gimmicky.
- **Body and UI:** Inter (400/500), 15–16 px base.
- **Numbers and stats:** JetBrains Mono or Inter with tabular numerals, so hours, percentages and times line up.
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 48.

### Shape, space, depth

- 8-point spacing grid; page gutter 16 px mobile, 32 px desktop.
- Radius: 12 px cards, 8 px buttons and inputs, full for chips and avatars.
- Depth by surface colour, not heavy shadows; a soft glow only on the focused or selected card.

### Signature elements (what makes it feel like GameQuest)

- **Status ring** — a thin coloured ring around each cover shows its status at a glance.
- **Art-tinted headers** — the game page header gradient is tinted from the cover's dominant colour (e.g. `fast-average-color`), like PS5's ambient backgrounds.
- **Platform badges** — small monochrome icons with the platform name; one card can carry several.
- **XP bar** — a slim gold bar under the top nav shows progress on your active quest.
- **Rarity glow** — achievements under 5% rarity get a subtle gold edge.

### Core components

GameCard · HeroHeader · ActionBar · StatTile · ProgressRing · TimeToBeat strip · QuestCard · SessionCard (RSVP avatars) · ReviewCard · CollectionCover (2×2 mosaic) · FriendRow (live status) · Chip / Badge · Toast · Skeleton · EmptyState · Command palette.

### Motion

- 150–250 ms ease-out for hovers, tabs and drawers; progress bars animate their fill once on load.
- One celebration: a short burst when a game is completed or a quest finishes.
- All motion off under `prefers-reduced-motion`.

### Tooling

Tailwind with the tokens above · shadcn/ui on Radix for accessible menus, dialogs and tabs · lucide-react icons · Framer Motion · Recharts · Sonner for toasts.

## Navigation

Twenty-plus features fit into five destinations, so a new user never faces more than five choices at the top level.

&#91;embedded content: Navigation map · 5 destinations + global tools\]

Game pages are reachable from every card, search result, friend row and notification; a game is never more than one click away.

## Key screens

Each screen leads with the one thing the user came for, then everything else. Desktop layouts are described; on mobile, side columns stack below the main column.

**Onboarding (3 steps, skippable)**

1. Pick favourite genres and 3 favourite games (seeds Play next).
2. Connect Steam, import a CSV, or skip.
3. Set privacy and optionally link Discord. Lands on a dashboard that is never empty.

**Home dashboard**

- Top: the **Resume card** — art-tinted, your last game, days since, your last journal note, "Continue" button.
- Under it: **Play next** — three cards, each with a one-line reason and time to beat.
- Stat tiles row (playing, backlog hours, completed this year, achievement %), then the backlog-health chart.
- Right column: active quest with XP bar, upcoming sessions, friends playing now, recommendation inbox count.

**Library**

- Status tabs with counts (All · Playing · Backlog · Completed · Wishlist · Dropped).
- Left filter rail: platform, genre, length (time to beat), rating, sort. View toggle: grid / list / shelf.
- GameCards with status ring, platform badges and a progress bar; multi-select for bulk status change or add to collection.
- Empty state: "Connect Steam or import your games" with both buttons.

**Game page** (the most important screen)

- Hero: art-tinted header, cover, title, platforms owned, rating, series link.
- Action bar: status dropdown · Log session · Add to collection · Recommend · Schedule session.
- Tabs: Overview · Progress · Media · Speedruns · Reviews · Series.
- Right sidebar: **time-to-beat strip** (main / extras / 100%) with a "you are here" marker, friends playing with their %, your stats.

**Explore**

- Search bar with instant results (also opens from the command palette, Ctrl/Cmd + K).
- Rows: trending collections, hidden gems, upcoming releases, "short games under 10h", genre chips.

**Collection page**

- Playlist-style header: mosaic cover, title, owner and collaborator avatars, visibility, saves, buttons Start play-through · Save · Fork · Share.
- Ordered list with drag handles, per-item notes and progress; smart collections show their rules in an editable drawer.

**Series page**

- Horizontal timeline of entries with a Release order / Story order toggle; each entry shows your status and time to beat; "Next up" highlighted.

**Friends hub**

- Tabs: Friends (live status) · Activity · Recommendations inbox · Requests. A Compare button on every friend opens a side-by-side view.

**Sessions**

- Agenda list grouped by day; session cards with game art, time in your timezone, RSVP avatars, Discord button.
- Create flow as a 4-step modal: game → time → friends (ownership warnings inline) → Discord invite.

**Profile**

- Banner, avatar, bio, favourite 4 showcase, trophy shelf (2D grid of tier badges), stats, reviews, public collections, Year in Review link.

**Connections**

- One card per platform: connected account, last sync, live job status (Queued / Running / Failed with reason), Sync now, Disconnect.

**Quests** — active, available and completed quests with progress bars.

**Admin console** — reports queue, ID-mismatch fixes, series story order, audit log, user suspensions.

## UX rules

A large feature set stays easy to use when every screen follows the same handful of rules. Put these in `CLAUDE.md` so every generated component obeys them.

**Every data view has four states**

- Loading: skeletons shaped like the real content, never a full-page spinner.
- Empty: a sentence saying why it is empty plus the one action that fixes it ("No sessions yet — Schedule one").
- Error: what failed, in plain words, with Retry; one failing section never blanks the page.
- Success: the content, plus a toast for any action the user took.

**Interaction rules**

- Optimistic updates for status changes, reorders and RSVPs; roll back with a toast on failure.
- Destructive actions (delete, unfriend, leave collection) confirm once, or offer Undo for 5 seconds.
- Forms validate inline on blur with the same Zod schema the server uses; the submit button shows progress and disables while pending.
- Duplicate actions blocked in the UI and on the server (double-click on Send recommendation creates one, not two).
- Command palette (Ctrl/Cmd + K): jump to any game, collection, friend or action.
- Every list is filterable from the URL, so filtered views can be shared and survive refresh.

**Progressive disclosure**

- New users see Home, Library, Explore and Profile; Friends, Sessions and Quests appear as soon as they are relevant (first friend, first quest) — no empty tabs on day one.
- Advanced controls (smart-collection rules, import mapping) live in drawers, not on the main page.

**Accessibility**

- WCAG AA contrast on all text; visible focus ring in Quest Violet; full keyboard use; Radix primitives for menus, dialogs and tabs.
- Every icon button has a label; every chart has a text summary; status is never colour alone.

**Performance**

- Route-level code splitting; embeds load only on click; images lazy-loaded at the right size from the source CDN.
- Lists paginate by cursor with infinite scroll and a "Back to top" button.
- Budget: first load under 200 KB of JavaScript (gzipped) for the landing and login pages.

**Mobile**

- Bottom tab bar: Home · Library · Explore · Friends · Profile. Action bar becomes a sticky bottom sheet on the game page. Touch targets at least 44 px.

## Architecture and data model

A layered Express API: routes check identity and input, services hold every business rule, and adapters are the only code that talks to outside APIs.

&#91;embedded content: GameQuest architecture · client, API layers, jobs, adapters, data\]

Controllers never touch external APIs or other services' models directly; jobs and the event bus call the same services the routes use.

### Folder structure

```
gamequest/
├── client/                  React + Vite
│   └── src/
│       ├── app/             router, providers, layout
│       ├── pages/           one folder per screen
│       ├── components/      ui/ (design system) + feature components
│       ├── features/        library, collections, friends, sessions, quests...
│       ├── services/        API calls (axios instance + per-area modules)
│       ├── hooks/  lib/  styles/ (tokens.css)
├── server/
│   └── src/
│       ├── config/  routes/  middleware/  controllers/
│       ├── services/        business rules
│       ├── adapters/        platforms/ (steam, xbox, import) + content/ (igdb, speedrun, twitch, youtube) + discord/
│       ├── models/  jobs/  events/  sockets/  utils/  validation/
│       └── tests/
├── shared/                  Zod schemas used by client and server
├── .github/workflows/ci.yml
├── docker-compose.yml  .env.example  README.md  CLAUDE.md
```

### Data model

| Collection | Key fields | Indexes and rules |
| --- | --- | --- |
| User | username, email, passwordHash, role, avatar, bio, privacy, favouriteGames\[4\], notificationPrefs, discord{id, username} | email, username unique |
| Game | title, slug, summary, cover, genres, platforms, releaseDate, externalIds{igdb, steam, twitch, speedrun}, seriesIds, timeToBeat{main, extras, full}, ratingAvg, ratingCount, cachedAt | slug unique; text index on title; externalIds.\* sparse unique |
| LibraryEntry | userId, gameId, status, manualProgress, ownerships\[{platform, externalId, playtimeMin, lastSyncedAt}\], completedAt, hiddenFromFriends | (userId, gameId) unique |
| StatusHistory | entryId, userId, from, to, at | (userId, at) |
| PlayLog | entryId, userId, date, minutes, note | (userId, date) |
| JournalEntry | entryId, userId, body, createdAt | (entryId, createdAt) |
| AchievementSnapshot | entryId, platform, unlocked, total, percentage, fetchedAt | (entryId, fetchedAt) |
| PlatformConnection | userId, platform, externalUserId, encryptedTokens, connectedAt, lastSyncAt | (userId, platform) unique |
| MediaCache | gameId, source, payload, fetchedAt, expiresAt | (gameId, source) unique; TTL on expiresAt |
| ApiQuota | source, day, unitsUsed | (source, day) unique |
| Series | name, slug, entries\[{gameId, releaseOrder, storyOrder, kind}\] | slug unique |
| Review | userId, gameId, rating, body, spoiler, progressAtReview, helpfulCount | (userId, gameId) unique; (gameId, createdAt) |
| Collection | ownerId, title, slug, description, tags, coverUrl, visibility, type, rules, collaborators\[{userId, role}\], forkedFrom, itemCount, saveCount | slug unique; (visibility, saveCount) |
| CollectionItem | collectionId, gameId, position, note, addedBy | (collectionId, gameId) unique; (collectionId, position) |
| Friendship | userA, userB (sorted), status, requestedBy | (userA, userB) unique |
| Block | blockerId, blockedId | unique pair |
| Recommendation | fromId, toId, gameId, message, reviewId, status, outcome | (fromId, toId, gameId) unique |
| GameSession | hostId, gameId, startAt (UTC), durationMin, invitees\[{userId, rsvp}\], discord{inviteCode, guildName, eventId}, status | (hostId, startAt); (invitees.userId, startAt) |
| Quest / QuestProgress | type, rules, period, reward / userId, questId, progress, completedAt | (userId, questId) unique |
| Activity | actorId, type, entityRef, visibility, createdAt | (actorId, createdAt) |
| Notification | userId, type, actorId, entityRef, read, createdAt | (userId, read, createdAt) |
| Report / AuditLog | reporterId, target, reason, status / adminId, action, target, at | (status, createdAt) / (at) |

## API surface

REST under `/api/v1`, JSON everywhere, one error shape: `{ error: { code, message, details? } }`. Every list takes `cursor`, `limit` and filters as query params.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Users and privacy | `GET /users/:username` · `PATCH /users/me` · `PATCH /users/me/privacy` · `GET /users/me/export` |
| Games | `GET /games?q=&genre=&platform=&maxHours=` · `GET /games/:slug` · `GET /games/:slug/media` · `GET /games/:slug/speedruns` · `GET /games/:slug/friends` |
| Series | `GET /series/:slug` · `PATCH /series/:slug/order` (admin) |
| Library | `GET /library` · `POST /library` · `PATCH /library/:id/status` · `PATCH /library/:id/progress` · `DELETE /library/:id` · `GET /library/:id/history` |
| Sessions log and journal | `POST /library/:id/playlogs` · `GET /library/:id/journal` · `POST /library/:id/journal` |
| Insights | `GET /insights/dashboard` · `GET /insights/backlog-health` · `GET /insights/play-next` · `GET /insights/year/:year` |
| Platforms | `GET /platforms` · `GET /platforms/steam/connect` · `GET /platforms/steam/callback` · `POST /platforms/:p/sync` · `GET /platforms/jobs/:jobId` · `POST /platforms/import` · `DELETE /platforms/:p` |
| Reviews | `POST /reviews` · `PATCH /reviews/:id` · `DELETE /reviews/:id` · `POST /reviews/:id/helpful` · `GET /games/:slug/reviews` |
| Collections | `GET /collections?scope=mine\|saved\|trending` · `POST /collections` · `GET /collections/:slug` · `PATCH /collections/:id` · `POST /collections/:id/items` · `PATCH /collections/:id/items/:itemId` · `POST /collections/:id/fork` · `POST /collections/:id/save` · `POST /collections/:id/collaborators` |
| Friends | `GET /friends` · `POST /friends/requests` · `PATCH /friends/requests/:id` · `DELETE /friends/:userId` · `POST /blocks/:userId` · `GET /friends/:userId/compare/:gameSlug` |
| Recommendations | `POST /recommendations` · `GET /recommendations/inbox` · `PATCH /recommendations/:id` |
| Game sessions | `GET /sessions` · `POST /sessions` · `PATCH /sessions/:id` · `POST /sessions/:id/rsvp` · `GET /sessions/:id/ics` |
| Discord | `GET /discord/connect` · `GET /discord/callback` · `POST /discord/validate-invite` · `DELETE /discord` |
| Quests | `GET /quests` · `POST /quests` · `POST /quests/:id/join` |
| Notifications | `GET /notifications` · `PATCH /notifications/:id/read` · `PATCH /notifications/preferences` · Socket.io `notification:new` |
| Admin | `GET /admin/reports` · `PATCH /admin/reports/:id` · `POST /admin/users/:id/suspend` · `PATCH /admin/games/:id/external-ids` · `GET /admin/audit` |

Status and RSVP changes are separate endpoints on purpose: each runs its own rules instead of one generic PATCH.

## Integrations, caching and jobs

Every external source sits behind an adapter with the same shape, caches into MongoDB, and fails alone. Check each provider's current docs and terms before you build its adapter.

| Source | Gives us | Auth | Cache TTL | When it fails |
| --- | --- | --- | --- | --- |
| IGDB | Metadata, time to beat, trailers, series | Twitch client ID + secret (server only) | 30 days | Serve cached data; new games fall back to RAWG |
| Steam Web API | Owned games, playtime, achievements | Steam OpenID + Web API key | Stored on sync | Private profile → clear message with a link to Steam privacy settings |
| speedrun.com API | World records per category + run video | None for reads | 1 day | Section shows "No records yet" |
| Twitch Helix | Top clips by game | App access token | 6 hours | Section hidden, trailers still shown |
| YouTube Data API | Gameplay videos per game | API key | 7 days | Quota counter stops searches near the daily limit |
| Discord | Identity link, invite validation, bot invites and events | OAuth2 `identify`; bot token | Invite checked at schedule time | Session works without Discord; card shows "Invite expired — add a new one" |
| CSV/JSON import | Epic, GOG, console libraries | User upload | — | Row-level errors shown in the preview before anything is saved |

**Adapter interface** (platforms)

```
connect() · disconnect() · getOwnedGames() · getProgress(gameId) · sync(userId)
```

**Background jobs (Agenda, stored in MongoDB)**

- `platform-sync` — on demand and nightly; retries with exponential backoff; status visible in Connections.
- `enrichment-refresh` — refreshes stale media and speedrun data for games people are viewing.
- `session-reminders` — 30 minutes before each session.
- `release-reminders` and `price-check` — daily, for wishlisted games.
- `daily-digest` — friends' activity summary for users who chose digests.
- `quest-rollover` — closes monthly quests and issues new ones.

**Event bus** — services emit `library.statusChanged`, `review.created`, `sync.completed`, `recommendation.sent`, `session.created`; quests, activity feed and notifications subscribe. Features stay decoupled.

## Security and error handling

The server trusts nothing from the client: identity comes from the cookie, ownership and roles are checked in middleware, and every secret stays in environment variables.

**Security**

- bcrypt (cost 12) for passwords; access token 15 min, refresh token 7 days with rotation and reuse detection.
- Cookies: HTTP-only, `Secure`, `SameSite=None` in production (frontend and API on different domains); CORS allows only the frontend origin with credentials.
- `requireAuth` → `requireRole` / `requireOwnership` / `requireCollectionRole` middleware chain; never accept `userId` or `role` from a request body.
- Privacy filter applied in the service layer to every profile, library, feed and friend query.
- Third-party tokens (Discord, any OAuth refresh tokens) encrypted at rest with AES-256-GCM; unlinking deletes them.
- Helmet headers, rate limits on auth, sync, recommendations and invite validation; review and journal text sanitised; uploads limited by type and size.
- `.env.example` with every variable named and no values; secrets never in the Vite client bundle.

**Error handling**

- Typed error classes (`ValidationError`, `AuthError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `UpstreamError`) mapped to status codes by one central handler.
- Mongo duplicate-key errors become `ConflictError` with a friendly message ("You already reviewed this game").
- Upstream failures become `UpstreamError` and show only in their own section.
- Structured request logs (pino) with a request ID returned in the error body for debugging.

**Edge cases to test**

- Steam profile private · game with zero achievements · sync started twice · invite expired · friend blocked mid-session · collection item deleted by a collaborator while you reorder · recommendation to a game the friend already owns · session time in a different timezone.

## Build plan and submission checklist

Build tier by tier and deploy at the end of each one, so whenever you stop, a complete product is live. Deadline: 27 October 2026, 11:59 PM IST.

&#91;embedded content: Build tiers · 4 tiers, each shippable\]

Within each tier, build backend service and tests first, then the screen, then its loading, empty and error states. Commit after every working feature.

### Submission checklist

- [ ] README: name, problem, users, solution, features, tech stack, architecture diagram, local setup, environment variables, deployment links, screenshots
- [ ] `.env.example` complete; no secrets in Git history
- [ ] Meaningful commit history across the build
- [ ] Frontend on Vercel, API on Render, database on MongoDB Atlas (network access open to Render)
- [ ] Cookies and CORS verified on the live URLs; API woken before the demo
- [ ] Seeded demo account with a full library, friends, a collection and a scheduled session
- [ ] Demo video, 3–5 minutes, following the five core journeys
- [ ] All links opened in an incognito window
- [ ] Submission form completed
