# Deploying GameQuest

Production layout:

```
Browser ──> Vercel (React app, https://<app>.vercel.app)
              │  /api/*  is rewritten (proxied) by vercel.json
              ▼
            Render (Express API, https://gamequest-api.onrender.com) ──> MongoDB Atlas
```

The browser only ever talks to the Vercel domain, so auth cookies are first-party
(`SameSite=Lax; Secure`). This keeps login working in incognito windows and in browsers that
block third-party cookies.

Do the steps in this order: Atlas → Render → Vercel → back to Render for the client URL.

---

## 1. MongoDB Atlas

1. **Database & Network Access → IP Access List → Add IP Address → Allow Access from Anywhere** (`0.0.0.0/0`).
   Render's free plan has no fixed outbound IP. Access is still protected by the database user's password.
2. Use a long, random password for the database user (rotate it if it was ever pasted anywhere).
3. Your connection string must include the database name:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/gamequest?retryWrites=true&w=majority`

## 2. Render (API)

1. Sign in at render.com with GitHub → **New → Web Service** → pick the `GameQuest` repository.
2. Settings:

   | Field | Value |
   | --- | --- |
   | Name | `gamequest-api` |
   | Root Directory | *(leave empty)* |
   | Runtime | Node |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |
   | Instance Type | Free |
   | Health Check Path (Advanced) | `/api/v1/health` |

3. **Environment variables** (Advanced → Add Environment Variable):

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `MONGODB_URI` | your Atlas connection string |
   | `JWT_ACCESS_SECRET` | 64+ random characters (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
   | `JWT_REFRESH_SECRET` | a *different* random string |
   | `TOKEN_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `TRUST_PROXY` | `2` |
   | `COOKIE_SAMESITE` | `lax` |
   | `AUTH_RATE_LIMIT_MAX` | `100` |
   | `CLIENT_ORIGIN` | `https://placeholder.vercel.app` for now (fixed in step 4) |
   | `PUBLIC_API_URL` | `https://placeholder.vercel.app` for now (fixed in step 4) |
   | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | from dev.twitch.tv (game search) |
   | `STEAM_API_KEY` | optional (Steam sync) |
   | `YOUTUBE_API_KEY` | optional (extra gameplay videos) |
   | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | optional (Discord link) |

4. **Create Web Service.** When the deploy is live, open `https://<your-service>.onrender.com/api/v1/health`.
   It should return JSON with `"status":"ok"`.
5. If Render gave a URL other than `https://gamequest-api.onrender.com`, edit the first rewrite in
   `vercel.json` to your real URL, then commit and push.

## 3. Vercel (client)

1. Sign in at vercel.com with GitHub → **Add New → Project** → import `GameQuest`.
2. Leave **Root Directory** as `./` (the repository root). `vercel.json` already sets:
   install `npm ci`, build `npm run build -w client`, output `client/dist`, and the rewrites.
   If Vercel asks for a Framework Preset, choose **Other**.
3. No environment variables are needed (the app calls `/api/v1` on its own domain).
4. **Deploy** and copy the production URL, e.g. `https://gamequest-tanush.vercel.app`.

## 4. Connect them

1. Render → your service → **Environment**: set `CLIENT_ORIGIN` and `PUBLIC_API_URL` to the Vercel URL
   (no trailing slash). Save; Render redeploys.
2. Discord (optional): in the Discord developer portal add the redirect
   `https://<your-vercel-url>/api/v1/discord/callback`.
3. Steam (optional): Steam OpenID returns to `https://<your-vercel-url>/api/v1/platforms/steam/callback`
   automatically; no portal setting needed.

## 5. Verify (in an incognito window)

- [ ] `https://<vercel-url>` loads; refreshing on `/library` does not 404.
- [ ] Register → log out → log in → refresh: still logged in.
- [ ] Explore search returns games (Twitch keys set).
- [ ] Add a game, change its status, see it in Library.
- [ ] Log in as the demo account (see README) and walk the demo flow.

## Notes

- **Cold starts:** Render's free plan sleeps after inactivity; the first request can take ~50 s.
  Open the health URL a minute before a demo.
- **Every push to `main`** redeploys both Render and Vercel automatically.
- **Seeding the demo account on production:** run `npm run seed` locally with `MONGODB_URI` in
  `server/.env` pointing at the same Atlas database.
