# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

搭把手 (Dabashou) is a mutual-help social platform — users create profiles listing what they can offer (skills/resources/services) and what they need, then search to match with others. The name translates to "lend a hand."

**Stack:** Node.js + Express + SQLite (better-sqlite3), vanilla JS frontend, no build step.

## Commands

```bash
# Install dependencies (from server/ directory)
cd server && npm install

# Start the server (production)
node server/server.js

# Start the server (from server/ directory)
cd server && npm start
```

There is no test suite, linter, or build pipeline. The frontend is raw HTML/CSS/JS — no bundler or framework.

## Architecture

```
                   ┌─────────────────��────┐
                   │   index.html         │
                   │   app.js (vanilla)   │  ← SPA: login page / main page
                   │   style.css          │
                   └────────┬─────────────┘
                            │ fetch() calls to /api/*
                   ┌────────▼─────────────┐
                   │  server/server.js    │  ← Express app entry
                   │  server/config.js    │  ← All config from env vars
                   │  server/db.js        │  ← SQLite init + schema
                   └────────┬─────────────┘
                            │
              ┌─────────────┼─────────────┐
     ┌────────▼──────┐ ┌────▼─────────┐
     │ routes/auth.js │ │routes/profiles│
     │  - register    │ │  - GET / 浏览  │
     │  - login       │ │  - GET /mine   │
     │  - wechat OAuth│ │  - PUT /mine   │
     │  - GET /me     │ │  - GET /stats  │
     └───────┬────────┘ └��─────┬────────┘
             │                 │
     ┌───────▼─────────┐       │
     │ middleware/auth.js│      │
     │  - auth (required)│──────┘
     │  - optionalAuth
     └─────────────────┘
```

### Backend (server/)

- **`server/server.js`** — Express app. Mounts CORS + JSON body parser, then:
  - `/api/auth/*` — authentication routes
  - `/api/profiles/*` — profile CRUD + search
  - `express.static('..')` serves the root HTML/CSS/JS
  - SPA fallback: all non-`/api/` GETs return `index.html`

- **`server/db.js`** — Creates/opens the SQLite database (WAL mode, foreign keys on). Defines two tables:
  - `users` — id, username, password_hash (bcrypt), nickname, avatar, wechat_openid/unionid
  - `profiles` — id, user_id (FK→users, 1:1), nickname, intro, offers (JSON array string), keywords (JSON array string), needs (JSON array string), wechat
  - The profiles table stores list fields (`offers`, `keywords`, `needs`) as JSON-encoded strings, parsed at the route layer via `safeJson()`.

- **`server/config.js`** — All configuration reads from environment variables with sensible defaults. WeChat login auto-enables only when `WECHAT_APPID` is set.

- **`server/middleware/auth.js`** — Two middleware: `auth` (rejects with 401 if no valid Bearer token) and `optionalAuth` (parses token if present, continues either way). Both use JWT with the secret from config.

- **`server/routes/auth.js`** — Registration (bcrypt hash + auto-create blank profile), username/password login, WeChat OAuth flow (`/wechat/url` returns the QR connect URL, `/wechat/callback` handles the redirect), and `/me` to get current user + profile.

- **`server/routes/profiles.js`** — Public profile listing with keyword search across nickname/intro/keywords/offers/needs (LIKE query), pagination (page/size params), "my profile" get-or-create + update, and a simple `/stats` endpoint returning total profile count. Profile updates sync the nickname to both tables.

### Frontend (root)

- **`index.html`** — Two pages in one file: login page (WeChat QR or username/password with login/register tabs) and main page (search bar, hot tags, card grid, FAB button). Also contains two overlay modals: profile edit form and delete confirmation.

- **`app.js`** — Vanilla JS SPA. Key patterns:
  - `Auth` object wraps localStorage for token/userId/nickname persistence.
  - `api()` helper adds the Bearer token header and parses JSON responses.
  - Search is live (fires on `input` event), queries the API directly (no client-side filtering — the server does the LIKE search).
  - Profile form uses newlines for multi-value fields (offers/needs) and comma/space-separated input for keywords.
  - WeChat callback: token arrives via URL hash fragment (after OAuth redirect), parsed on page load.
  - "Delete" actually clears the profile fields rather than removing the record (profile row is kept, just emptied).

- **`style.css`** — Single CSS file, no preprocessor. Responsive: desktop card grid (auto-fill, minmax 320px), tablet breakpoint at 1024px, mobile at 768px (single-column, stacked modals, smaller touch targets). WeChat green (#07c160) as the brand color.

## Data Model Notes

- `profiles.offers`, `profiles.keywords`, `profiles.needs` are stored as JSON string arrays (e.g., `'["item1","item2"]'`). Always parse with the `safeJson()` helper before use.
- User deletion is not implemented — profiles have `ON DELETE CASCADE` on the FK, but there's no delete user endpoint.
- Profile "deletion" from the UI just blanks all fields; it doesn't remove the row.
- JWT tokens expire after 30 days, stored in localStorage.

## Docker & Deployment

- **Dockerfile** — `node:20-alpine`, installs only production deps from `server/package.json`, copies whole project, exposes port 3000.
- **GitHub Actions** (`.github/workflows/deploy.yml`) — On push to master, builds + pushes Docker image to `ghcr.io`.
- **Deployment target** — Clawcloud (see `DEPLOY.md` for full instructions). Requires a persistent volume mounted at `/data` for the SQLite database.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Server port |
| `JWT_SECRET` | (hardcoded dev value) | JWT signing key — must change in production |
| `DB_PATH` | `server/data.db` | SQLite file path; in containers use `/data/data.db` |
| `BASE_URL` | `http://localhost:3000` | Public URL for WeChat OAuth redirect |
| `WECHAT_APPID` | (none) | WeChat Open Platform AppID; set to enable WeChat login |
| `WECHAT_SECRET` | (none) | WeChat Open Platform AppSecret |
