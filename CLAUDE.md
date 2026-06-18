# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Huzoo (互圈) is a mutual-help social platform — users create profiles listing what they can offer (skills/resources/services) and what they need, then search to match with others.

**Stack:** Node.js + Express + SQLite (better-sqlite3), vanilla JS frontend, no build step.

**Deployment:** Self-hosted on Aliyun Lighthouse (轻量应用服务器), single-machine same-origin deploy. PM2 for process management, Nginx for reverse proxy + HTTPS. See [DEPLOY.md](./DEPLOY.md) for the complete beginner-friendly guide.

**Monetization:** Google AdSense display ads. Ad slots are pre-wired in the HTML/JS but disabled by default (`ADS_ENABLED: false` in `ads-config.js`). Flip the switch after AdSense approval.

## Commands

```bash
# Install dependencies (from server/ directory)
cd server && npm install

# Start the server (production)
node server/server.js

# Start the server (dev mode, auto-reload)
cd server && npm run dev

# Run tests
cd server && npm test
```

There is no build step. The frontend is raw HTML/CSS/JS served statically.

## Architecture

```
                   ┌─────────────────────────┐
                   │   index.html            │
                   │   app.js (vanilla)      │  ← SPA: login page / main page
                   │   ads.js + ads-config.js│  ← AdSense integration
                   │   style.css             │
                   └────────┬────────────────┘
                            │ fetch() to ${API_BASE}/api/*
                   ┌────────▼────────────────┐
                   │  server/server.js       │  ← Express app entry
                   │  server/config.js       │  ← All config from env vars
                   │  server/db.js           │  ← SQLite init + schema
                   └────────┬────────────────┘
                            │
              ┌─────────────┼─────────────┐
     ┌────────▼──────┐ ┌────▼─────────┐
     │ routes/auth.js │ │routes/profiles│
     │  - register    │ │  - GET / 浏览  │
     │  - login       │ │  - GET /mine   │
     │  - wechat OAuth│ │  - PUT /mine   │
     │  - GET /me     │ │  - GET /stats  │
     └───────┬────────┘ └─────┬────────┘
             │                 │
     ┌───────▼─────────┐       │
     │ middleware/auth.js│──────┘
     │  - auth (required)│
     │  - optionalAuth
     └─────────────────┘
```

### Frontend (root)

- **`index.html`** — Two pages in one file: login page (WeChat QR or username/password with login/register tabs) and main page (search bar, hot tags, card grid, FAB button). Also contains two overlay modals: profile edit form and delete confirmation. AdSense script tag in `<head>`, three `<div class="ad-slot">` for banner ads.

- **`app.js`** — Vanilla JS SPA. Key patterns:
  - `API` is a simple constant `/api` (same-origin; frontend and backend served from the same Express app via `express.static`).
  - `Auth` object wraps localStorage for token/userId/nickname persistence.
  - `api()` helper adds Bearer token header and parses JSON responses.
  - `render()` builds card HTML via string templates. After `innerHTML` is set, calls `Ads.injectInFeedAds()` to insert native ads every 6 cards (only if ads enabled).

- **`ads-config.js`** — **Single point of ad configuration**. `ADS_ENABLED`, `PUBLISHER_ID`, `SLOT_TOP`/`SLOT_BOTTOM`/`SLOT_INFEED`, `INFEED_INTERVAL`. Default: disabled.

- **`ads.js`** — Ad rendering logic. `Ads.enabled()` checks the flag. `Ads.initFixedSlots()` activates top/bottom banners on DOMContentLoaded. `Ads.injectInFeedAds(container)` inserts native ad units between cards.

- **`style.css`** — Single CSS file. `.ad-slot` is `display:none` by default; `.ad-slot.ad-active` shows it (only added when ads enabled). `.ad-infeed` blends with `.card` style. Responsive: desktop card grid, tablet at 1024px, mobile at 768px.

### Deployment (deploy/)

- **`deploy/setup.sh`** — One-command setup script. Installs Node.js 20 LTS, PM2, Nginx, generates `.env` with random JWT_SECRET, starts the app, configures Nginx reverse proxy. Run as `sudo bash deploy/setup.sh your-domain.com`.
- **`deploy/update.sh`** — Re-run after pushing code changes. Reinstalls deps, restarts PM2 + Nginx.
- **`deploy/nginx.conf`** — Nginx site config template. HTTP→HTTPS redirect, SSL hardening, gzip, reverse proxy to localhost:3000.
- **`server/ecosystem.config.js`** — PM2 config. Reads env from `.env` via `dotenv`. Auto-restart on crash, max 500MB memory.

### Backend (server/)

- **`server.js`** — Express app. CORS + JSON body parser + request logger, then routes + static file serving + SPA fallback. Same-origin deployment means CORS is essentially unused in practice.

- **`db.js`** — Creates/opens SQLite database (WAL mode, foreign keys on). Tables: `users` (id, username, password_hash bcrypt, nickname, avatar, wechat_openid/unionid) and `profiles` (id, user_id FK 1:1, nickname, intro, offers/keywords/needs as JSON strings, wechat).

- **`config.js`** — Environment-driven config. Reads from `process.env` (or `.env` file via dotenv in production). `origin` is a single string for CORS allowlist.

- **`middleware/auth.js`** — `auth` (rejects 401 without valid Bearer token) and `optionalAuth` (parses token if present, continues either way). JWT with secret from config.

- **`routes/auth.js`** — Registration (bcrypt + auto-create blank profile), username/password login, WeChat OAuth web flow, `GET /me`, `DELETE /me` (account deletion with password confirmation, WeChat users skip).

- **`routes/profiles.js`** — Public listing with LIKE search across nickname/intro/keywords/offers/needs, pagination. "My profile" get-or-create + update (syncs nickname to users table). `/stats` endpoint with 30s in-memory cache.

## Monetization: Google AdSense

Display ads (banner + in-feed native). Not the original "watch ad to unlock" model — that required WeChat Mini Program + 流量主 (300 RMB business verification). Free web hosting + AdSense is the zero-cost alternative.

**Setup** (after deployment):
1. Apply at https://www.google.com/adsense/start/
2. Pass review (need real content, working HTTPS site)
3. Get publisher ID (`ca-pub-xxxxxxxx`) + create 3 ad units
4. Fill `ads-config.js` (set `ADS_ENABLED: true`, fill IDs)
5. Push to GitHub → Cloudflare auto-deploys → ads appear

Before that, `ADS_ENABLED: false` keeps the site ad-free for development.

## Data Model Notes

- `profiles.offers`, `profiles.keywords`, `profiles.needs` are JSON string arrays. Parse with `safeJson()` before use.
- Profile "deletion" from UI blanks all fields; user deletion CASCADEs.
- JWT tokens expire after 30 days, stored in localStorage.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Server port |
| `JWT_SECRET` | (hardcoded dev value) | JWT signing key — must change in production (process exits if unset in `NODE_ENV=production`). On the server, `deploy/setup.sh` auto-generates this into `server/.env`. |
| `DB_PATH` | `server/data.db` | SQLite file path |
| `BASE_URL` / `ORIGIN` | `http://localhost:3000` | Public URL (used for CORS and WeChat OAuth redirect) |
| `RATE_LIMIT` | `true` | Set to `false` to disable rate limits |
| `WECHAT_APPID` | (none) | WeChat Open Platform AppID; set to enable WeChat login |
| `WECHAT_SECRET` | (none) | WeChat Open Platform AppSecret |

In production, all of these live in `server/.env` (loaded by dotenv). Edit with `nano /var/www/huzoo/server/.env`, then `pm2 restart huzoo`.

## Testing

```bash
cd server && npm test
```

29 tests across 2 suites:
- `auth.test.js` — register, login, me, account deletion, wechat url
- `profiles.test.js` — list, search, mine, update, delete, stats

Tests use temp SQLite files and wipe tables in `beforeEach`.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the complete Aliyun + beginner guide:
1. Buy Aliyun Lighthouse (轻量应用服务器) — Ubuntu 22.04, 2 core / 2 GB
2. Domain ICP 备案 (7-20 day review, free)
3. DNS A record → server IP
4. Upload code via scp
5. Run `sudo bash deploy/setup.sh your-domain.com` (installs Node 20 LTS + PM2 + Nginx + generates .env)
6. Apply HTTPS via certbot

Quick prod env file (`server/.env`, auto-generated by setup.sh):
```
NODE_ENV=production
PORT=3000
JWT_SECRET=<random 64-char hex>
BASE_URL=https://your-domain.com
RATE_LIMIT=true
```
