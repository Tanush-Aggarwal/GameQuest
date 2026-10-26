# GameQuest 🎮

A full-stack MERN web app: one unified game library across platforms, smart "what to play next" decisions, and social play with friends — collections, an activity feed, and scheduled play sessions.

---

## Tech Stack

| Layer | Tools |
|---|---|
| **Client** | React 19, Vite, React Router 7, Tailwind CSS 3 (CSS-variable tokens), Recharts, Sonner toasts, Lucide icons, Axios |
| **Server** | Node.js, Express 5, Mongoose 9, Zod (validation), Pino (logging), Helmet, bcrypt, JSON Web Tokens |
| **Database** | MongoDB Atlas |
| **Shared** | `@gamequest/shared` — Zod schemas re-used on both client and server |
| **Testing** | Jest + Supertest (server, 377 tests), Vitest + Testing Library (client, 144 tests) |

---

## Features

**Library and progress**
- **Auth** — Register, login, JWT access token (15 min) + refresh rotation with reuse detection (7 days), HTTP-only cookies
- **Game catalog** — Search via IGDB (Twitch-backed), cache-first in MongoDB, filters, cursor pagination; degrades to cached games if IGDB is unavailable
- **Unified library** — One entry per game with multi-platform ownerships, status state machine (Wishlist → Backlog → Playing → Completed | Dropped), status history, "hide from friends" switch
- **Progress tracking** — Manual progress, play-session logging, journal entries
- **Dashboard** — Resume card, stat tiles, "What to play next" scoring, backlog snapshot
- **Reviews** — 1–5 stars, community reviews, atomic average refresh on the game

**Organise**
- **Collections** — Manual collections with drag-to-reorder (keyboard up/down buttons too; fractional positions) and smart collections whose rules (a whitelist of fields and operators) are compiled on every read, with a live preview in the rule builder. Visibility: public / friends / private

**Social**
- **Friends** — Search by username, requests (send / accept / decline / cancel), unfriend, block. Friendships are mutual and stored as a sorted pair; blocks override everything
- **Activity feed** — Friends' activity on Home (status changes, first reviews, session logs, new collections, new sessions), written only by event-bus subscribers and filtered at read time for `hiddenFromFriends` and current visibility
- **Public profiles** — `/u/:username` with stats, recent activity and public collections; profile privacy (public / friends / private)
- **Game sessions** — Schedule a play session (game, time, length, platform, player limit, optional Discord invite), invite friends or open it to all friends, RSVP going / maybe / can't make it with capacity enforcement, calendar file (`.ics`) download, upcoming list grouped by day in your own timezone

---

## Project Structure

```
gamequest/
├── client/          # React + Vite SPA
│   └── src/
│       ├── app/         # Router, route guards
│       ├── components/  # UI primitives + feature components (library, collections, feed, sessions…)
│       ├── features/    # Auth context
│       ├── hooks/       # useAsync, useLayered, useAuth
│       ├── lib/         # Status metadata, time helpers
│       ├── pages/       # Route-level pages
│       └── services/    # Axios API wrappers
├── server/          # Express API
│   ├── scripts/         # seed.js, import-catalog.js, fix-catalog.js, sync-indexes.js
│   └── src/
│       ├── adapters/    # IGDB content adapter
│       ├── config/      # Env validation (Zod)
│       ├── controllers/ # Thin HTTP handlers
│       ├── events/      # Event bus + subscribers (activity feed, clean-up)
│       ├── middleware/  # Auth, validate, rate limit, error handler
│       ├── models/      # Mongoose models
│       ├── routes/      # Express routers
│       ├── services/    # Business rules (dependency injection)
│       ├── tests/       # Jest tests with in-memory fakes
│       └── utils/       # Errors, smart-rule compiler, .ics builder
├── shared/          # @gamequest/shared — Zod schemas
└── .env.example     # Copy → server/.env and fill in
```

---

## Setup

### Prerequisites

- Node.js ≥ 20.19
- A MongoDB Atlas cluster (free tier works; allow your IP under Network Access)
- (Optional) Twitch Developer App for IGDB game search

### 1. Clone and install

```bash
git clone <repo-url> gamequest
cd gamequest
npm install          # installs all workspaces
```

### 2. Configure environment

```bash
cp .env.example server/.env
```

Open `server/.env` and fill in:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/gamequest
JWT_ACCESS_SECRET=<random 32+ chars>
JWT_REFRESH_SECRET=<different random 32+ chars>
TOKEN_ENCRYPTION_KEY=<32 bytes, base64>

# Optional — needed for game search
TWITCH_CLIENT_ID=<from dev.twitch.tv>
TWITCH_CLIENT_SECRET=<from dev.twitch.tv>
```

**Generate secrets quickly:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Seed demo data (optional but recommended)

```bash
npm run seed
```

The seed is idempotent. It creates:
- **demo** — `demo@gamequest.dev` / `Demo1234!`: 8 games across every status, play logs, reviews, a public manual collection ("All-time favourites") and a smart collection ("Short backlog": status = backlog and ≤ 15 h to beat)
- **alex** — `alex@gamequest.dev` / `Demo1234!`, friends with demo, with a library, two reviews and a public collection, so demo's activity feed has content
- An upcoming session hosted by alex ("Hades night") with demo invited

Alex's activity is created through the real services and event bus, not inserted directly. The seed also runs `npm run db:indexes`.

### 3b. Import the game catalog (needs `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`)

```bash
npm run catalog:import     # ~3,000 games from IGDB; resumable, safe to re-run (add `-- --fresh` to start over)
npm run catalog:fix        # repair games already in the database
npm run catalog:steam-art  # Steam CDN cover/backdrop for games that have a Steam id but no art
npm run db:indexes         # build indexes (production runs with autoIndex off)
```

`catalog:import` fills the catalog in three steps — top PC games (~1,500, by Steam peak players and IGDB visits / want-to-play), top PS5 / PS4 / Xbox Series / Xbox One / Switch games by rating count (~1,000), and releases from the last 12 months or the next 3 (~500). Every game gets covers, artworks, screenshots, a wide `backdrop`, developer / publisher, themes, modes, ratings, time to beat and a blended `popularity` score that the catalog sorts by. Progress is kept in one `MediaCache` document, so an interrupted run continues where it stopped.

Only main games, remakes, remasters, expanded games, ports and standalone expansions are catalog games, and they need a cover and no `version_parent`. DLC, bundles, mods, episodes, seasons, updates, packs and editions are never imported and never returned by live search. `catalog:fix` re-checks games already stored: DLC / bundles / editions become `hidden: true` with `parentGameId` set (library entries pointing at them keep working and show the parent game's art), missing art is filled, and seeded slugs are aligned with IGDB's.

### 3c. Steam and trailers (needs `STEAM_API_KEY` / `YOUTUBE_API_KEY`; each feature switches itself off without its key)

- **Link Steam** on *Profile → Steam* with a SteamID64, a `steamcommunity.com/profiles/<id>` URL or a vanity name. Steam **Game details must be Public** (Steam → Edit Profile → Privacy Settings), otherwise the sync stops with a message that says so. One Steam account links to one GameQuest user. Unlinking keeps the games already in your library.
- **Sync now** reads your owned games (free games included) and each game's achievements, matches them to the catalog by Steam app id, and imports unknown games from IGDB with the same catalog rule (tools, soundtracks and DLC are listed as "not matched", never added). It keeps one library entry per game, adds a `Steam` ownership with playtime and an achievement snapshot, and never overwrites your manual progress or the status of a game that is already in your library. New games start as *Playing* (played in the last 2 weeks), *Completed* (100% achievements) or *Backlog*. One sync per user every 5 minutes; failed attempts do not use that up.
- **Steam art fallback:** a game with a Steam id and no cover or backdrop gets Steam CDN art (`library_600x900_2x`, `library_hero`, `header` last). Each game is probed once and the answer is cached in `MediaCache`.
- **Trailers** on the game page use the IGDB video first (no quota). Without one, a YouTube search ("<title> official trailer", embeddable only) runs at most once per game per 7 days and is cached; the player only loads the `youtube-nocookie.com` iframe when you click play, and the section is hidden when there is no video.
- After pulling these changes run `npm run db:indexes` (new unique index on a user's Steam id).

### 4. Run in development

```bash
# From repo root — runs server (port 4000) and client (port 5173) together
npm run dev
```

Open **http://localhost:5173** — log in with the demo account or register a new one.

---

## API Endpoints

All routes are under `/api/v1` and (except `/health` and `/auth/*`) require the session cookie. Errors always look like `{ error: { code, message, details? } }`; lists use cursor pagination (`cursor`, `limit`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | Account and session |
| GET | `/auth/me` | Current user |
| GET | `/games` · `/games/:slug` | Search the catalog (`q`, `genre`, `platform`, `minRating`, `minHours`, `maxHours`; most popular first) · game detail |
| GET | `/games/:slug/trailer` | `{ trailer: { videoId, source: igdb \| youtube } \| null }`: IGDB video first, else one cached YouTube search per 7 days |
| GET | `/steam` | Linked Steam account: persona, avatar, last sync (`{ linked: false }` when none) |
| POST · DELETE | `/steam/link` | Link by SteamID64 / profile URL / vanity name `{ input }` (rate-limited) · unlink |
| POST | `/sync/steam` | Sync the linked Steam library → `{ added, updated, unmatched: [{ appid, name, playtimeMin }], warnings }`. 1 per 5 min per user; a private profile answers 502 with how to fix it |
| GET | `/library` · `/library/:id` | List entries · one entry |
| POST | `/library` | Add a game to the library |
| PATCH | `/library/:id/status` | Change status (state machine) |
| PATCH | `/library/:id/visibility` | Hide / show to friends |
| PATCH | `/library/:id/progress` | Set manual progress |
| GET · POST · DELETE | `/library/:id/playlogs[/:logId]` | Play sessions log |
| GET · POST · DELETE | `/library/:id/journal[/:noteId]` | Journal notes |
| GET | `/library/:id/history` | Status history |
| DELETE | `/library/:id` | Remove from library |
| GET | `/insights/dashboard` · `/insights/play-next` · `/insights/backlog-health` | Dashboard data |
| PUT · DELETE | `/reviews/:gameId` | Upsert / delete own review |
| GET | `/reviews/mine/:gameId` · `/reviews/game/:gameId` · `/reviews/user/:userId` | Read reviews |
| GET · POST | `/collections` | List mine · create (manual or smart) |
| POST | `/collections/preview` | Preview unsaved smart rules |
| GET · PATCH · DELETE | `/collections/:id` | Read (privacy-filtered) · update · delete |
| POST | `/collections/:id/items` | Add a library entry (manual only) |
| DELETE | `/collections/:id/items/:itemId` | Remove an item |
| PATCH | `/collections/:id/items/:itemId/position` | Reorder: `{ afterItemId \| null }` |
| GET | `/users/search?q=` | Find players by username prefix |
| GET | `/users/:username` | Profile header + stats (privacy / blocks applied) |
| GET | `/users/:username/activity` · `/users/:username/collections` | Profile sections |
| PATCH | `/users/me/privacy` | Profile privacy: public / friends / private |
| GET | `/friends` · `/friends/requests` | Friends · incoming and outgoing requests |
| POST | `/friends/requests` | Send a request by username (rate-limited) |
| POST | `/friends/requests/:id/accept` · `/decline` | Answer a request |
| DELETE | `/friends/requests/:id` | Cancel a request you sent |
| DELETE | `/friends/:userId` | Unfriend |
| GET | `/blocks` | Players you blocked |
| POST · DELETE | `/blocks/:userId` | Block / unblock |
| GET | `/feed` | Friends' activity |
| GET · POST | `/sessions` | Upcoming sessions (mine, invited, friends') · create |
| GET · PATCH | `/sessions/:id` | Session detail · update (host only) |
| POST | `/sessions/:id/cancel` | Cancel (host only) |
| PUT | `/sessions/:id/rsvp` | RSVP: `{ response: going \| maybe \| declined }` |
| GET | `/sessions/:id/ics` | Calendar file (`text/calendar`, UTC) |

---

## Running Tests

```bash
npm test -w server    # Jest — 211 tests, no database needed (in-memory fakes)
npm test -w client    # Vitest + Testing Library — 105 tests
npm run build -w client
npm run lint
```

---

## Deployment

| Service | URL |
|---------|-----|
| **Client** | [https://gamequest-tanush.vercel.app](https://gamequest-tanush.vercel.app) |
| **API** | proxied through the client domain at `/api/v1` |

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full step-by-step Vercel + Render + Atlas setup.

After deploying, verify with:

```bash
node scripts/verify-deploy.js https://gamequest-tanush.vercel.app
```

Key production env vars on Render:
- `NODE_ENV=production`
- `CLIENT_ORIGIN=https://gamequest-tanush.vercel.app` (your Vercel URL, no trailing slash)
- `COOKIE_SAMESITE=lax`
- `TRUST_PROXY=2`

---

## Architecture Notes

- **Layers** — routes → middleware → controllers → services → models/adapters. Controllers are thin; business rules live in services, which take their models by injection so tests swap in in-memory fakes.
- **Identity comes only from the signed cookie** — never from the request body. Other people are addressed by URL.
- **Privacy filter in the service layer** — profiles, collections, sessions and the feed all decide visibility from one definition of "friend" and "blocked"; a thing you may not see answers 404.
- **Events** — services emit domain events (`library.statusChanged`, `review.created`, `library.sessionLogged`, `collection.created`, `session.created`, …); the activity feed and clean-up jobs subscribe in `events/subscribers.js`. Activity is written nowhere else.
- **Status is a state machine** — invalid transitions return 409 with the allowed moves.
- **Smart collections are safe by construction** — rules compile only from a whitelist of fields, operators and value types; nothing a user types becomes a Mongo key or operator.
- **Times are UTC** — stored and sent as UTC, formatted in the viewer's timezone in the client.
- **External sources fail alone** — `Promise.allSettled`; a failing IGDB lookup becomes a warning next to cached results.
