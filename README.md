<div align="center">

# 🎮 GameQuest

**One library for every game you own: track progress, decide what to play next, and play together with friends.**

[![Live demo](https://img.shields.io/badge/Live%20demo-gamequest--five.vercel.app-111?style=for-the-badge&logo=vercel)](https://gamequest-five.vercel.app)
[![Tutorial video](https://img.shields.io/badge/Tutorial-Watch%20on%20YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/YOUR_VIDEO_ID)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Node](https://img.shields.io/badge/Node-20+-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Tests](https://img.shields.io/badge/server%20tests-588%20passing-2ea44f)

</div>

---

## 📺 Tutorial video

[![GameQuest walkthrough](https://img.youtube.com/vi/YOUR_VIDEO_ID/maxresdefault.jpg)](https://youtu.be/YOUR_VIDEO_ID)

A walkthrough of the app: signing up, linking Steam, the library, collections, friends and scheduling a session.
<!-- To add your video: upload it to YouTube (Unlisted is fine), copy the id after "youtu.be/" or "v=",
     and replace every YOUR_VIDEO_ID in this file (3 places). -->

---

## ✨ What it does

| | |
|---|---|
| 📚 **Unified library** | One entry per game, whichever platforms you own it on. Status flow Wishlist → Backlog → Playing → Completed / Dropped, with history. |
| 🔗 **Steam sync** | Link your Steam profile to import owned games, playtime and achievements. Your manual progress is never overwritten. |
| 🎯 **What to play next** | Scores your backlog by recent play, progress, time to beat and the genres you enjoy, and says why each pick was chosen. |
| 📈 **Progress** | Manual progress, logged play sessions, journal notes and achievement percentage, kept as separate tracks. |
| 🔎 **Search** | Type part of any word ("hol" finds Hollow Knight), with live suggestions in the top bar (press `/` or `Ctrl K`). |
| 🗂️ **Collections** | Hand-picked lists with drag-to-reorder, or smart collections built from rules (e.g. "backlog and under 15 h"). |
| 👥 **Friends** | Requests, blocking, an activity feed, game recommendations and public profiles with privacy settings. |
| 📅 **Sessions** | Schedule a game night, invite friends, RSVP with a player limit, add a Discord link and download a calendar file. |
| 🏆 **Levels & trophies** | XP from real activity and trophy tracks with Bronze → Platinum tiers (explained below). |
| 🎬 **Game pages** | Art header, validated trailers, screenshots, time to beat, system requirements and community reviews. |

### How levels work

XP comes only from things you actually do, and it never goes down:

| Action | XP |
|---|---|
| Each hour played (Steam or logged by you, whichever is higher per game) | +10 |
| Each game completed | +100 |
| Each review written | +25 |

Level *n* starts at **100 × (n − 1)² XP**: level 2 at 100, level 3 at 400, level 5 at 1,600, level 10 at 8,100. Each level takes a little longer than the last. Click **How levels work** on your profile to see your own numbers.

### Trophies & milestones

Eight tracks, each with Bronze, Silver, Gold and Platinum tiers, all worked out from your real stats. Your profile shows the next goal for each track.

| Track | Counts | Bronze / Silver / Gold / Platinum |
|---|---|---|
| Collector | games in library | 1 / 10 / 25 / 50 |
| Finisher | games completed | 1 / 5 / 15 / 30 |
| Time played | hours played | 10 / 50 / 150 / 500 |
| Achievement hunter | Steam achievements unlocked | 10 / 100 / 500 / 1,500 |
| Critic | reviews written | 1 / 5 / 15 / 30 |
| Genre explorer | different genres played | 3 / 6 / 10 / 15 |
| Platform hopper | platforms linked | 1 / 2 / 3 / 4 |
| Squad | friends | 1 / 3 / 10 / 25 |

---

## 🧱 Tech stack

| Layer | Tools |
|---|---|
| **Client** | React 19, Vite, React Router 7, Tailwind CSS (CSS-variable tokens), Radix UI, Framer Motion, Recharts, Sonner, Lucide, Axios |
| **Server** | Node.js, Express 5, Mongoose, Zod, Pino, Helmet, express-rate-limit, bcrypt, JSON Web Tokens |
| **Database** | MongoDB Atlas |
| **Shared** | `@gamequest/shared`: Zod schemas used by both client and server |
| **External APIs** | IGDB (catalog), Steam Web API (library and achievements), YouTube Data API (trailers) |
| **Testing** | Jest + Supertest (server, in-memory fakes, no database needed), Vitest + Testing Library (client) |
| **Hosting** | Vercel (client), Render (API), MongoDB Atlas (database), UptimeRobot (keeps the API awake) |

## 🏗️ Architecture

```
Browser ──► Vercel (React SPA)
              │  /api/* is rewritten to Render, so auth cookies stay first-party
              ▼
           Render (Express API)  ──►  IGDB · Steam · YouTube  (adapters, cached in MongoDB)
              │
              ▼
           MongoDB Atlas
```

- **Layers:** routes → middleware → controllers → services → models / adapters. Controllers are thin; all rules live in services, which receive their models by injection so tests can use in-memory fakes.
- **Identity only from the signed cookie.** Access token 15 min, refresh token 7 days with rotation and reuse detection.
- **Privacy in the service layer:** profiles, collections, sessions and the feed all use one definition of "friend" and "blocked"; something you may not see answers 404.
- **Events:** services emit domain events (`library.statusChanged`, `review.created`, `session.created`, …) and the activity feed subscribes. Activity is written nowhere else.
- **External sources fail alone:** `Promise.allSettled`, so a failing IGDB call becomes a warning next to cached results.
- **Times are UTC**, shown in the viewer's timezone.

## 📁 Project structure

```
gamequest/
├── client/                 React + Vite SPA
│   └── src/
│       ├── app/            router, route guards, wake-up page
│       ├── components/     ui primitives + feature components
│       ├── features/       auth context
│       ├── hooks/          useAsync, useLayered, …
│       ├── lib/            levels, trophies, art helpers, status metadata
│       ├── pages/          route-level pages
│       └── services/       axios API wrappers
├── server/                 Express API
│   ├── scripts/            seed, catalog import, index sync
│   └── src/                adapters · config · controllers · events · middleware
│                           models · routes · services · tests · utils
├── shared/                 Zod schemas
├── docs/DEPLOY.md          deployment guide
├── docs/ROADMAP.md         what to build next
├── render.yaml             Render blueprint
└── vercel.json             Vercel config + API rewrite
```

---

## 🚀 Run it locally

**Needs:** Node.js 20.19 or newer, a MongoDB Atlas cluster (free tier works; allow your IP under Network Access). Optional: Twitch app (IGDB), Steam Web API key, YouTube Data API key.

```bash
git clone https://github.com/<your-username>/gamequest.git
cd gamequest
npm install                     # installs all workspaces
cp .env.example server/.env     # then fill it in (below)
npm run seed                    # optional demo data
npm run dev                     # API on :4000, client on :5173
```

Open **http://localhost:5173** and log in with `demo@gamequest.dev` / `Demo1234!`, or register.

### Environment (`server/.env`)

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/gamequest
JWT_ACCESS_SECRET=<random 32+ chars>
JWT_REFRESH_SECRET=<different random 32+ chars>
TOKEN_ENCRYPTION_KEY=<32 bytes, base64>
CLIENT_ORIGIN=http://localhost:5173

# Optional: each feature switches itself off without its key
TWITCH_CLIENT_ID=           # game search (IGDB)
TWITCH_CLIENT_SECRET=
STEAM_API_KEY=              # Steam sync
YOUTUBE_API_KEY=            # trailers
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

The seed creates **demo** and **alex** (`alex@gamequest.dev` / `Demo1234!`), who are friends, with libraries, reviews, collections and an upcoming session.

<details>
<summary><b>Catalog, Steam and trailer details</b></summary>

#### Import the game catalog (needs `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`)

```bash
npm run catalog:import     # ~3,000 games from IGDB; resumable, safe to re-run (add `-- --fresh` to start over)
npm run catalog:fix        # repair games already in the database
npm run catalog:steam-art  # Steam CDN cover/backdrop for games that have a Steam id but no art
npm run db:indexes         # build indexes (production runs with autoIndex off)
```

`catalog:import` fills the catalog in three steps — top PC games (~1,500, by Steam peak players and IGDB visits / want-to-play), top PS5 / PS4 / Xbox Series / Xbox One / Switch games by rating count (~1,000), and releases from the last 12 months or the next 3 (~500). Every game gets covers, artworks, screenshots, a wide `backdrop`, developer / publisher, themes, modes, ratings, time to beat and a blended `popularity` score that the catalog sorts by. Progress is kept in one `MediaCache` document, so an interrupted run continues where it stopped.

Only main games, remakes, remasters, expanded games, ports and standalone expansions are catalog games, and they need a cover and no `version_parent`. DLC, bundles, mods, episodes, seasons, updates, packs and editions are never imported and never returned by live search. `catalog:fix` re-checks games already stored: DLC / bundles / editions become `hidden: true` with `parentGameId` set (library entries pointing at them keep working and show the parent game's art), missing art is filled, and seeded slugs are aligned with IGDB's.

#### Steam and trailers (needs `STEAM_API_KEY` / `YOUTUBE_API_KEY`; each feature switches itself off without its key)

- **Link Steam** on *Profile → Steam* with a SteamID64, a `steamcommunity.com/profiles/<id>` URL or a vanity name. Steam **Game details must be Public** (Steam → Edit Profile → Privacy Settings), otherwise the sync stops with a message that says so. One Steam account links to one GameQuest user. Unlinking keeps the games already in your library.
- **Sync now** reads your owned games (free games included) and each game's achievements, matches them to the catalog by Steam app id, and imports unknown games from IGDB with the same catalog rule (tools, soundtracks and DLC are listed as "not matched", never added). It keeps one library entry per game, adds a `Steam` ownership with playtime and an achievement snapshot, and never overwrites your manual progress or the status of a game that is already in your library. New games start as *Playing* (played in the last 2 weeks), *Completed* (100% achievements) or *Backlog*. One sync per user every 5 minutes; failed attempts do not use that up.
- **Steam art fallback:** a game with a Steam id and no cover or backdrop gets Steam CDN art (`library_600x900_2x`, `library_hero`, `header` last). Each game is probed once and the answer is cached in `MediaCache`.
- **Trailers** on the game page are validated before they are shown. Candidates are the game's IGDB videos; only when none passes does a YouTube search run (`"<title> official gameplay trailer"`, then `"<title> official trailer"`; embeddable, Gaming category, English, US). Every candidate is checked with one `videos.list` call (up to 50 ids, 1 quota unit) and rejected if it is not public/embeddable, blocked in India or the US, shorter than 30 s or longer than 8 min, tagged with another language or written in a non-Latin script, not named after this game (or named after a sequel or neighbouring game), or noise such as developer diaries, interviews, reviews, reactions, soundtracks, walkthroughs, mods or livestreams. The rest are scored (gameplay trailer > launch > release > reveal > trailer; "official"; the developer's or a known official channel; views) and the best 3 are shown, with small tabs for the others. The player only loads the `youtube-nocookie.com` iframe (English interface, captions off) when you click play. **Wrong trailer?** hides a video for you at once and for everyone once two different people reported it. The section is hidden when nothing passes. **`YOUTUBE_API_KEY` is required for trailers**: without it nothing is shown, because a video cannot be validated.
- **Trailer quota:** a game costs at most one search round (up to two searches, 100 units each) per 7 days, "nothing found" is remembered too, page views and the refresh script share a daily ceiling of 90 searches (9,000 of the 10,000 units a day), and a 403/429 pauses all lookups for 24 hours (the pause and the count are shared by all processes and survive restarts). Each evaluation logs the units it used.
- `npm run trailers:refresh -- --limit=300 [--budget=80]` pre-picks trailers for the most popular games (cheap `videos.list` checks on IGDB candidates first, at most `--budget` search calls) and prints how many came from IGDB or YouTube and the quota used.
- After pulling these changes run `npm run db:indexes` (new unique index on a user's Steam id).

</details>

## 🧪 Tests and checks

```bash
npm test -w server      # Jest: 588 tests, no database needed
npm test -w client      # Vitest + Testing Library
npm run lint
npm run build           # production build of the client
```

## ☁️ Deployment

| Part | Where | URL |
|---|---|---|
| Client | Vercel | https://gamequest-five.vercel.app |
| API | Render (free plan) | https://gamequest-jou3.onrender.com |
| Database | MongoDB Atlas | n/a |
| Uptime | UptimeRobot pings `/api/v1/health` every 5 minutes | n/a |

Render's free plan sleeps after 15 minutes without traffic. The UptimeRobot monitor keeps it awake; if it does fall asleep, the app shows a wake-up page while it starts. The full Vercel + Render + Atlas walkthrough is in [`docs/DEPLOY.md`](docs/DEPLOY.md).

Key Render env vars: `NODE_ENV=production`, `CLIENT_ORIGIN=https://gamequest-five.vercel.app`, `COOKIE_SAMESITE=lax`, `TRUST_PROXY=2`.

<details>
<summary><b>API endpoints</b> (all under <code>/api/v1</code>)</summary>

Every route except `/health` and `/auth/*` needs the session cookie. Errors look like `{ error: { code, message, details? } }`; lists use cursor pagination (`cursor`, `limit`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | Account and session |
| GET | `/auth/me` | Current user |
| GET | `/games` · `/games/:slug` | Search the catalog (`q`, `genre`, `platform`, `minRating`, `minHours`, `maxHours`; most popular first) · game detail |
| GET | `/games/:slug/trailer` | `{ trailers: [{ videoId, label, source: igdb \| youtube }] }`: up to 3 validated, scored trailers, best first (`[]` when none passes) |
| POST | `/games/:slug/trailer/report` | "Wrong trailer?" `{ videoId }` -> `{ trailers, changed, dropped }`. Hides it for you; dropped for everyone after 2 different reporters. 20 per hour per user |
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
| GET | `/insights/dashboard` · `/insights/play-next?limit=` · `/insights/backlog-health` | Dashboard data; play-next takes `limit` 1-12 (default 5) and returns each game's cover, backdrop and reasons |
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

</details>

## 🗺️ Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for planned features.

## 🏷️ Versions

Stable versions are tagged in Git (`v1.0`, …). To look at or go back to one, see **Releases** on GitHub, or run `git checkout v1.0`.

---

<div align="center">
Built by <b>Tanush Aggarwal</b> as a MERN end-term project.
</div>
