# NBB Roweb — Image Editor

This repo contains a small image-generation webapp (frontend React + backend Express + SQLite). Below are instructions to build and run using Docker.

Prerequisites:
- Docker and Docker Compose installed on the server.

Quick local dev (non-docker):
- Frontend:
  - cd frontend
  - npm install
  - npm run dev
- Backend:
  - cd server
  - npm install
  - PORT=4000 node index.js

Run with Docker (recommended for deployment):
- Build and start:
  - docker compose build
  - docker compose up -d
- The frontend will be served by nginx on port 80, API on port 4000.

Environment:
- Create an `.env` in repo root with at least:
  - FAL_KEY=your_fal_key
  - JWT_SECRET=change_this_secret

Data persistence:
- `server/data.db` and `server/uploads` are mounted into the api container — back them up as needed.

Deploy notes:
- After building images, push to your registry or run on your server and configure your domain with nginx/letsencrypt (proxy to container port 80).


