NBB Roweb — deployment (Docker Compose v2)

Goal: single compose stack that runs anywhere; only set keys/ports.

Prereqs
- Docker + Docker Compose v2 (`docker compose`).
- Ports: 88 (frontend) and 4444 (API) free, or adjust in compose.

Quick start
1) Copy repo to server.
2) Create `.env` in repo root (same dir as docker-compose.yml). You can copy `.env.example` and fill:
   - `FAL_KEY=...` (required)
   - `JWT_SECRET=...` (required)
   - `PORT=4444` (API inside container; host port mapped in compose)
   - `TEXT_MODEL_ENDPOINT` and `IMAGE_MODEL_ENDPOINT` if overriding defaults.
3) Build & run:
   - `docker compose -f docker-compose.yml up -d --build`
4) Open:
   - Frontend: http://<server_ip>:88
   - API: http://<server_ip>:4444 (proxied by frontend in production)

Notes on containers
- Images include all dependencies (`npm ci` baked into Dockerfiles). No bind-mount of node_modules needed.
- Data/log use Docker named volumes by default (self-contained):
  - `api_data` ↔ `/app/data.db` (SQLite DB)
  - `api_uploads` ↔ `/app/uploads` (uploaded temp files)
  - `api_log` ↔ `/app/server.log` (API log)
- Frontend has no volumes; built assets served by nginx.

Common commands
- View logs: `docker compose logs -f api` and `docker compose logs -f web`
- Restart after env change: `docker compose down && docker compose up -d --build`
- Check containers: `docker compose ps`

If ports are busy
- Edit `docker-compose.yml` port mappings (e.g., `8088:80`, `4411:4444`), then rerun `docker compose up -d --build`.

Health checklist (server)
- `.env` present with real `FAL_KEY` and `JWT_SECRET`.
- `docker compose ps` shows `nbbroweb_api` and `nbbroweb_web` as running.
- `curl http://localhost:4000/api/me` with a valid token should respond 200 (use browser flow to log in first).

Where to adjust persistence
- Already using named volumes (self-contained). If you prefer host bind-mounts, edit docker-compose.yml:
  - change `api_data:/app/data.db` to `./server/data.db:/app/data.db`
  - change `api_uploads:/app/uploads` to `./server/uploads:/app/uploads`
  - change `api_log:/app/server.log` to `./server/server.log:/app/server.log`
  - ensure dirs/files exist or Docker will create them.

Authentication/users
- Users live in SQLite (`server/data.db`). Admin can create users via `/api/admin/users` (see AdminPanel UI).
- Public registration is disabled.

Generation flow (runtime)
- Frontend -> `/api/generate` → request_id stored in DB → `/api/requests/:id/status` polls Fal queue → when completed, DB updated with `result_url`; History reads from `/api/my/requests`.
