# AGENTS.md

## Cursor Cloud specific instructions

**SpotMap** is a crowd-sourced map reporting app (React + Express + SQLite). Users report incidents (police, accidents, hazards, etc.) as emoji pins on a Leaflet/OpenStreetMap-based map. All users see each other's reports.

### Architecture

| Layer | Tech | Directory |
|---|---|---|
| Frontend | React 19 + Vite + Leaflet | `client/` |
| Backend | Express + better-sqlite3 + JWT | `server/` |
| Database | SQLite (auto-created at `server/spotmap.db`) | — |

### Running the app

```bash
npm run dev          # starts both server (:3001) and client (:5173) via concurrently
npm run dev:server   # backend only
npm run dev:client   # frontend only (proxies /api to :3001)
```

### Lint / Build / Test

```bash
npm run lint   # ESLint on client code
npm run build  # production build of client
```

No automated test suite yet. Manual testing via browser at `http://localhost:5173`.

### Non-obvious notes

- The Vite dev server proxies `/api` requests to the Express backend at port 3001 (configured in `client/vite.config.js`).
- SQLite DB is auto-created on first server start — no migrations needed.
- Datapoints auto-expire based on the `duration` field (5–1440 minutes); expired rows are cleaned up on each GET request.
- The map defaults to NYC (40.7128, -74.006) when geolocation is denied or unavailable.
- `react-hooks/set-state-in-effect` ESLint rule is strict in React 19 — use lazy initializers or callbacks in geolocation handlers to avoid violations.
