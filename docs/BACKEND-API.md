# Backend additions (27 Oct 2026, evening)

For whoever builds the client. Everything below is live on the API (`/api/v1`), tested (server suite: 583 passing),
and replaces data the Home page currently fakes. All routes need the login cookie unless marked **public**.

## Replace the hard-coded Home data

| Hard-coded today | Use instead |
|---|---|
| Hero stats "10K+ / 25K+ / 100+" | `GET /public/stats` (**public**) → `{ games, players, collections, reviews }`. Real counts; cached 10 min. Label them truthfully, e.g. "Games tracked", "Players", "Public collections". |
| `/assets/hero-fantasy.jpg` + static trending images and ratings (★ 9.6 …) | `GET /games/featured?limit=5` → `{ items: Game[] }`, released popular games that have both `cover` and `backdrop`, best first. Each item has `rating` (IGDB score out of 10, one decimal, or `null`), plus the normal game fields (`slug`, `title`, `cover`, `backdrop`, `heroImage`, `platforms`, `genres`, `videos`). Use `backdrop` for the hero, `cover` for cards, `slug` for links and the trailer (`GET /games/:slug/trailer`). |
| "Your next adventure: Genshin Impact" | `GET /insights/next-adventure` → `{ pick: { source: 'library' \| 'popular', reasons: string[], entryId, game } \| null }`. `source: 'library'` is the best play-next pick from the user's library; otherwise a popular game they do not own. |
| "Level 12" in the sidebar | `GET /account/summary` → `{ username, avatar, level, xp, levelStartXp, nextLevelXp, breakdown: { hours, completed, reviews }, unreadNotifications }`. Level rule (real activity only): 10 XP per hour played, 100 per completed game, 25 per review; level n starts at 100 × (n − 1)² XP. |
| Decorative bell | `GET /notifications` → `{ items, unread }`; `POST /notifications/read` marks all read. Item: `{ id, type: 'friend_request' \| 'recommendation' \| 'session_invite', createdAt, unread, actor: { id, username, avatar }, game?, session?, text, link }`. `text` is a ready sentence ("bob invited you to Hades night"); `link` is the client route to open. Show the red dot when `unread > 0` (also in `/account/summary`). |

## New game page data

- `GET /games/:slug/requirements` → `{ available, reason, minimum: [{ label, value }], recommended: [...], source: { name, url } | null }`.
  From the Steam store, cached 7 days. When `available` is false, show `reason` (already user-facing text: not on Steam, none listed, or Steam unreachable).
- Time to beat is fixed. `game.timeToBeat` is now `{ main, extras, full, samples, endless, lowConfidence }`:
  - `main` ≤ `extras` ≤ `full` is guaranteed; any value can be `null` (hide that tile).
  - `endless: true` for multiplayer-only / live-service games (Fortnite, Valorant, MOBAs, MMOs…): show "Endless: multiplayer / live service" instead of the tiles.
  - `lowConfidence: true` means fewer than 3 reports: prefix with "~" and add a "few reports" hint.
  - Insights `timeToBeatMain` on play-next items now means "hours to plan with" (main, else main + extras; null if endless).

## Account and legal

- `DELETE /account` with body `{ confirmUsername }` (the user types their username; case-insensitive). Deletes the account and all their data, recalculates game ratings, clears the cookies, returns 204. Wrong username → 400 with a message. After success, send the user to `/login`.
- Registration accepts `acceptTerms: true` (optional for now; `false` is rejected). Send it from the register form's "I agree to the Terms and Privacy Policy" checkbox and keep the button disabled until it's ticked; the server stores the time.
- Terms and Privacy text: `import { TERMS, PRIVACY, LEGAL_UPDATED } from '@gamequest/shared'`. Each is `[{ heading, body: string[] }]`. Render them on `/terms` and `/privacy` ("Last updated LEGAL_UPDATED") and link both from the sidebar footer and the register page.

## Data fix to run once (on the machine with `server/.env`)

```
npm run catalog:ttb -w server
```

Re-fetches time to beat from IGDB for every catalog game, fixes the swapped main/extras values, and marks endless games.
Offline alternative (no IGDB calls): `npm run catalog:ttb -w server -- --local`. The API already corrects old values on
read, so pages look right even before this runs; the script makes filters ("Under 10 hours") and insights exact.
