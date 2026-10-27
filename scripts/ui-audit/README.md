# UI audit scripts

Repeatable checks for the look and the accessibility of the whole app. They drive the Chrome that is already installed
(Playwright with `channel: 'chrome'`, so there is no browser download), log in as the seeded demo account and write their
results to `docs/screenshots/`.

## Run them

Use a **production build** (that is what Lighthouse should judge) pointing at an API you control:

```powershell
# 1. the API on :4001, allowing the preview origin (uses server/.env for the database and keys; nothing is printed)
cd server; $env:PORT='4001'; $env:CLIENT_ORIGIN='http://localhost:4173'; node --env-file-if-exists=.env src/index.js

# 2. the client, built for that API, served on :4173
cd client; $env:VITE_API_URL='http://localhost:4001/api/v1'; npm run build; npx vite preview --port 4173 --strictPort

# 3. the audits (from the repository root)
node scripts/ui-audit/shots.mjs       # screenshots of every page at 375 / 768 / 1440 px + open states (palette, quick menu, lightbox)
node scripts/ui-audit/a11y.mjs        # axe-core (WCAG 2.0/2.1 A + AA) on every page at 375 and 1440, and a keyboard walk
node scripts/ui-audit/lighthouse.mjs  # Lighthouse on Home and a game page, signed in, mobile and desktop
```

`AUDIT_WEB`, `AUDIT_API` and `AUDIT_ONLY=home|game` (Lighthouse) change the targets. The demo account is
`demo@gamequest.dev` / `Demo1234!` (see the README).

## What they write

| File | Contents |
| --- | --- |
| `docs/screenshots/<page>-<width>.jpg` | full-page screenshots (lazy images are scrolled into view first) |
| `docs/screenshots/report.json` | per page and width: h1s, horizontal overflow, console errors, failed requests, broken images |
| `docs/screenshots/a11y-report.json` | every axe violation with its selector, and the keyboard walk (tab stops without a visible focus indicator) |
| `docs/screenshots/lighthouse-report.json` | the four Lighthouse scores, the main metrics, layout-shift culprits and weak audits |

Expected noise in `report.json`: the sign-in pages log a 401 for `/auth/me` and `/auth/refresh` (nobody is signed in yet).