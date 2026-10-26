# GameQuest — AGENTS.md (shared rules for every AI tool)

GameQuest is a MERN web app: one unified game library across platforms, smart "what to play next" decisions, and social play with friends (recommendations, scheduled sessions with Discord). The full product and design blueprint is in `docs/BLUEPRINT.md`. This file holds the rules every change must follow, whichever AI tool makes it.

## Stack
- Client: React + Vite, React Router, Tailwind (CSS-variable tokens), shadcn/ui (Radix), lucide-react, Framer Motion, Recharts, Sonner, axios, Socket.io client
- Server: Node + Express, Mongoose, Zod, Agenda (jobs on MongoDB), Socket.io, pino, helmet, express-rate-limit, bcrypt, jsonwebtoken
- Shared: `shared/` holds Zod schemas used by both client and server
- Tests: Jest + Supertest (server), Vitest + Testing Library (client)
- Deploy: Vercel (client), Render (API), MongoDB Atlas

## Folder structure
```
client/src/{app,pages,components/ui,components/<feature>,features,services,hooks,lib,styles}
server/src/{config,routes,middleware,controllers,services,adapters/{platforms,content,discord},models,jobs,events,sockets,utils,validation,tests}
shared/
```

## Architecture rules
- Layers: routes → middleware → controllers → services → models/adapters. Controllers are thin; ALL business rules live in services.
- Only adapters call external APIs. Every adapter result is normalised and cached in MongoDB (`MediaCache`, TTL per source).
- Services emit domain events on the internal event bus (`library.statusChanged`, `review.created`, `sync.completed`, `recommendation.sent`, `session.created`). Quests, activity and notifications subscribe; never call them directly from another service.
- Long or scheduled work (platform sync, reminders, digests, price checks, enrichment refresh, quest rollover) runs as Agenda jobs with retries + exponential backoff.
- Fetch from multiple external sources with `Promise.allSettled`; one failing source must never fail the whole response.

## Data rules
- LibraryEntry is unique per (userId, gameId) and holds `ownerships[]` per platform. Never create one entry per platform.
- Library status is a state machine: Wishlist → Backlog → Playing → Completed | Dropped (enforce allowed transitions in the service). Every change writes StatusHistory.
- Progress tracks stay separate: manualProgress, achievement % (unlocked/total), playtime. Synced data never overwrites manual input.
- One review per user per game, only for games past Wishlist. Maintain Game.ratingAvg/ratingCount atomically.
- CollectionItem lives in its own collection with fractional `position`. Smart-collection rules compile only from a whitelist of fields and operators.
- Friendships are mutual; store user pairs sorted. Blocks override everything.
- Store all times in UTC; format in the client in the viewer's timezone.
- Add indexes for every query pattern listed in the blueprint's data model.

## Security rules
- Identity comes only from the auth cookie. Never accept userId, role or ownerId from the request body.
- Auth middleware chain: requireAuth → requireRole / requireOwnership / requireCollectionRole.
- Apply the privacy filter (public / friends / private + hiddenFromFriends) in the service layer on every read of another user's data.
- Access token 15 min, refresh token 7 days with rotation and reuse detection; HTTP-only, Secure, SameSite=None cookies in production; CORS only for the client origin with credentials.
- Third-party tokens encrypted at rest (AES-256-GCM). Secrets only in env vars; keep `.env.example` updated with names, never values. Nothing secret in the Vite bundle.
- Validate every request with the shared Zod schema. Rate-limit auth, sync, recommendations and invite validation.

## API conventions
- REST under `/api/v1`. Errors always `{ error: { code, message, details? } }` via the central error handler and typed error classes (ValidationError, AuthError, ForbiddenError, NotFoundError, ConflictError, RateLimitError, UpstreamError).
- Lists use cursor pagination (`cursor`, `limit`) and filters as query params.
- Status changes, progress updates and RSVPs are dedicated endpoints, not a generic PATCH.

## UI rules
- Dark theme by default. Use only the design tokens in `client/src/styles/tokens.css` (`--bg`, `--surface`, `--surface-raised`, `--border`, `--text`, `--text-muted`, `--accent` #7C5CFF, `--reward` #FFC14D, status and trophy colours). Gold (`--reward`) is only for quests, trophies and XP.
- Fonts: Space Grotesk (headings), Inter (UI), tabular numerals for stats.
- Spacing on an 8-point grid; radius 12 px cards, 8 px controls.
- Every data view implements loading (skeleton), empty (reason + one action), error (message + Retry, scoped to its section) and success states.
- Optimistic updates with rollback + toast. Destructive actions confirm or offer 5-second Undo.
- Status is never colour alone: always icon + label.
- Accessible: Radix primitives, visible focus ring, labelled icon buttons, keyboard support, WCAG AA contrast, `prefers-reduced-motion` respected.
- Route-level code splitting; video embeds load only on click; lazy-load images.
- Mobile: bottom tab bar (Home, Library, Explore, Friends, Profile); touch targets ≥ 44 px.

## Workflow
- Build in tiers: 1 Foundation → 2 Progress → 3 Organise → 4 Social. Deploy at the end of each tier.
- For each feature: service + tests → route/controller → client service → screen → loading/empty/error states.
- Small, focused commits with clear messages after each working feature.
- Before finishing a task: run lint and tests, and check the feature works with the seeded demo account.

## Shared memory between AI tools (Claude Code, Antigravity, local models)
Several AI tools work on this repo in turn. They share context ONLY through files and Git, so:
- At the start of every session: read this file, `docs/PROGRESS.md` and the last 10 commits (`git log --oneline -10`).
- Work on ONE task from the "Next up" list in `docs/PROGRESS.md` at a time.
- Record any design or architecture decision in `docs/DECISIONS.md` (date, decision, why).
- Before ending a session, or when told "handoff": update `docs/PROGRESS.md` (Done / In progress / Next up / Known issues), then commit with a clear message.
- Never edit `.env` or print secrets. Never rewrite Git history. Never delete files outside the task.
- If a rule here conflicts with a request, say so instead of silently breaking the rule.
