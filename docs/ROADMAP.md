# GameQuest roadmap

What to improve and add next, grouped by how much work each item is. Each item says why it matters and where it would go in the code.

## 1. Quick wins (an evening each)

| Idea | Why | Where |
|---|---|---|
| **Trophy unlock toasts** | Celebrate the moment a tier is earned instead of the player finding it later | Compare old/new stats after a status change or review; `sonner` toast |
| **Open Graph previews** for `/u/:username` and `/games/:slug` | Links shared on Discord or WhatsApp show the cover and title | Small server route that returns meta tags, or Vercel middleware |
| **Empty-state illustrations** | First-time users see a friendlier library, friends and sessions page | `components/ui/states.jsx` |
| **Keyboard shortcuts sheet** (`?`) | Makes `/`, `Ctrl K` and the others discoverable | Command palette |
| **Mobile pass** at 375 px | Game hero, session page and profile were designed on desktop | Tailwind breakpoints |

## 2. Medium features (a weekend each)

| Idea | Why | Where |
|---|---|---|
| **Weekly quests** ("finish 1 backlog game", "log 5 hours") with bonus XP | Gives a reason to come back every week; the event bus already emits the right events | New `Quest` model + Agenda weekly rollover job, subscriber on `library.statusChanged` |
| **Real-time notifications** with Socket.io | Friend requests, RSVPs and recommendations arrive instantly instead of on refresh | `server/src/sockets`, client `TopBar` bell |
| **Session reminders** by email or Discord webhook, 1 hour before start | Fewer no-shows at game nights | Agenda job + Discord adapter |
| **Price tracking for the wishlist** (IsThereAnyDeal or Steam store) | "Tell me when it's on sale" is the most-requested wishlist feature in apps like this | New content adapter, cached in `MediaCache` |
| **More platforms**: Xbox (OpenXBL), PlayStation (PSN profile), GOG | The "unified library" promise covers more than Steam | `server/src/adapters/platforms/*` following `steam.js` |
| **Year in review** page (hours by month, top genres, games finished) | Shareable and fun; the data already exists in PlayLog and StatusHistory | `insightsService`, Recharts |
| **Leaderboards among friends** (weekly hours, level, completions) | Light competition between friends | Aggregation in `insightsService`, privacy filter applied |
| **Avatar upload** instead of an image URL | Easier than finding a link | Cloudinary (free tier) signed upload |

## 3. Bigger bets (a week or more)

| Idea | Why |
|---|---|
| **Personalised recommendations** ("players who finished Hades also loved…") from co-occurrence in libraries and ratings | Discovery beyond the catalog's popularity order |
| **Groups / clubs** with a shared backlog and a monthly "game club" pick | Social play beyond one-off sessions |
| **Public API + Discord bot** (`/gq nowplaying`, `/gq session`) | Brings GameQuest into the place where players already talk |
| **PWA**: installable, offline library view, push notifications | Feels like an app on phones |
| **Admin dashboard** for reported trailers, users and catalog fixes | Moderation without touching the database |

## 4. Engineering quality

- **CI on GitHub Actions**: run lint, server tests and client tests on every push and pull request; block merges when they fail.
- **Preview deploys**: Vercel already builds every branch; point previews at a staging Render service and a separate Atlas database.
- **End-to-end tests** with Playwright for sign-up → add game → schedule session (Playwright is already a dev dependency).
- **Error tracking** with Sentry (client and server) and request IDs in Pino logs.
- **Rate-limit store in MongoDB or Redis** so limits survive restarts and work with more than one server.
- **Image performance**: serve covers as WebP/AVIF at the size shown, lazy-load below the fold, and add `width`/`height` to avoid layout shift.
- **Accessibility re-check** with axe after the latest UI changes.

## Suggested order

1. Rotate keys, CI, mobile pass (protects what already works)
2. Trophy toasts + weekly quests (builds on levels and trophies)
3. Real-time notifications + session reminders (makes the social side feel alive)
4. Year in review + friend leaderboards
5. More platforms and price tracking
