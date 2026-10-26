# GameQuest 🎮

A full-stack MERN web application — a smart, unified game library where you can track every game you own across platforms, log play sessions, write reviews, and get personalised "what to play next" recommendations.

---

## Tech Stack

| Layer | Tools |
|---|---|
| **Client** | React 19, Vite, React Router 7, Tailwind CSS 3 (CSS-variable tokens), Recharts, Sonner toasts, Lucide icons, Axios |
| **Server** | Node.js, Express 5, Mongoose 9, Zod (validation), Pino (logging), Helmet, bcrypt, JSON Web Tokens |
| **Database** | MongoDB Atlas |
| **Shared** | `@gamequest/shared` — Zod schemas re-used on both client and server |
| **Testing** | Jest + Supertest (server, 83 tests), Vitest + Testing Library (client) |

---

## Features

- **Auth** — Register, login, JWT access token (15 min) + refresh rotation (7 days), HTTP-only cookies
- **Game catalog** — Search via IGDB (Twitch-backed), cache-first, cursor pagination
- **Unified library** — One entry per game, multi-platform ownerships, status state machine (Wishlist → Backlog → Playing → Completed | Dropped), history tracking
- **Progress tracking** — Manual progress slider, play-session logging (date / minutes / note), journal entries
- **Dashboard** — Resume card, stat tiles, "What to play next" recommendations (genre/time/progress scoring), backlog snapshot
- **Reviews** — Star rating (1–5), text body, community reviews per game, atomic avg refresh on Game
- **Library entry page** — Full detail view: cover art, status transitions, progress panel, play logs, journal, reviews

---

## Project Structure

```
gamequest/
├── client/          # React + Vite SPA
│   └── src/
│       ├── app/         # Router, route guards
│       ├── components/  # UI primitives, feature panels
│       ├── features/    # Auth context
│       ├── hooks/       # useAsync, useAuth
│       ├── pages/       # Route-level pages
│       └── services/    # Axios API wrappers
├── server/          # Express API
│   └── src/
│       ├── adapters/    # IGDB content adapter
│       ├── config/      # Env validation (Zod)
│       ├── controllers/ # Thin HTTP handlers
│       ├── events/      # In-process event bus
│       ├── middleware/  # Auth, validate, error handler
│       ├── models/      # Mongoose models
│       ├── routes/      # Express routers
│       ├── services/    # Business logic (DI pattern)
│       └── tests/       # Jest unit tests
├── shared/          # @gamequest/shared — Zod schemas
└── .env.example     # Copy → server/.env and fill in
```

---

## Setup

### Prerequisites

- Node.js ≥ 20
- A MongoDB Atlas cluster (free tier works)
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
cd server
node scripts/seed.js
```

This creates:
- Demo login: `demo@gamequest.dev` / `Demo1234!`
- 6 games (Elden Ring, Hollow Knight, Celeste, Hades, Stardew Valley, The Witcher 3)
- Library entries in various statuses with play logs and reviews

### 4. Run in development

```bash
# From repo root — runs server (port 4000) and client (port 5173) together
npm run dev
```

Open **http://localhost:5173** — log in with the demo account or register a new one.

---

## API Endpoints

All routes are under `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login → sets HTTP-only cookie |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Clear tokens |
| GET | `/auth/me` | Current user |
| GET | `/games` | Search game catalog |
| GET | `/games/:slug` | Game detail |
| GET | `/library` | List user's library |
| GET | `/library/:id` | Single library entry |
| POST | `/library` | Add game to library |
| PATCH | `/library/:id/status` | Change game status |
| PATCH | `/library/:id/progress` | Set manual progress |
| POST | `/library/:id/playlogs` | Log a play session |
| GET | `/library/:id/playlogs` | List play logs |
| DELETE | `/library/:id/playlogs/:logId` | Delete play log |
| POST | `/library/:id/journal` | Add journal note |
| GET | `/library/:id/journal` | List journal |
| DELETE | `/library/:id/journal/:noteId` | Delete note |
| GET | `/insights/dashboard` | Dashboard data |
| GET | `/insights/play-next` | "What to play next" |
| GET | `/insights/backlog-health` | Backlog summary |
| PUT | `/reviews/:gameId` | Upsert review |
| DELETE | `/reviews/:gameId` | Delete own review |
| GET | `/reviews/mine/:gameId` | Own review for a game |
| GET | `/reviews/game/:gameId` | All reviews for a game |

---

## Running Tests

```bash
# Server (Jest)
npm test --workspace=server

# Client (Vitest)
npm test --workspace=client
```

---

## Deployment

See `docs/DEPLOY.md` for Vercel (client) + Render (API) + MongoDB Atlas deployment guide.

Key production env vars to add on Render:
- `NODE_ENV=production`
- `CLIENT_ORIGIN=https://your-vercel-app.vercel.app`
- `COOKIE_SAMESITE=lax`
- `PUBLIC_API_URL=https://your-api.onrender.com`

---

## Architecture Notes

- **Services use dependency injection** — every service factory takes `{ Model, logger, ... }` so unit tests swap in in-memory fakes without touching MongoDB.
- **Identity comes only from the signed cookie** — never from the request body.
- **Status is a state machine** — invalid transitions return 409 with clear `allowed` details.
- **Event bus** — services emit domain events (`library.statusChanged`, `library.sessionLogged`, …) for decoupled side-effects.
- **Atomic rating refresh** — reviews recalculate `ratingAvg` via `$group` aggregate after every upsert/delete.
