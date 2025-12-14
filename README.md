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
-   - docker compose build
-   - docker compose up -d
- The API listens on port 4444, while the frontend container still serves static assets via its internal nginx on port 80. The host side exposes the frontend on port 8088 so you can bind your public domain to `http://localhost:8088` through a host-level reverse proxy (see the TLS section below).

Environment:
- Create an `.env` in repo root with at least:
  - FAL_KEY=your_fal_key
  - JWT_SECRET=change_this_secret

Data persistence:
- `server/data.db` and `server/uploads` are mounted into the api container — back them up as needed.

Deploy notes:
- After building images, push to your registry or run on your server and configure a host-level nginx that proxies `digitalocean.team` to `http://localhost:8088`. Use `certbot` (or another ACME client) to obtain HTTPS certificates before sending traffic to the live site.

## Host nginx + TLS (Let’s Encrypt)

1. Install `nginx` + `certbot` and ensure your domain's A record (e.g., `digitalocean.team`) points to the server IP.
2. Create a site config under `/etc/nginx/sites-available/digitalocean.team`:

```nginx
server {
  listen 80;
  server_name digitalocean.team www.digitalocean.team;
  location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable it (`ln -s ...`), reload nginx, and then run `certbot --nginx -d digitalocean.team` to request certificates and let certbot handle the HTTPS server block. Certbot will replace the `listen 80` block with a redirect and add `listen 443 ssl`.


