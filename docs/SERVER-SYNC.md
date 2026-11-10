# Server sync pilot — PostgreSQL and FastAPI

**Not production ready.** This milestone stores immutable full-state meet revisions while retaining OpenLifter's original local Redux Persist and `.openlifter` export/import.

## Configure

Copy `.env.backend.example` to `.env.backend`. Replace both placeholder secrets with different cryptographically random strings. The secrets are deliberately not stored in Git. PowerShell example:

```powershell
Copy-Item .env.backend.example .env.backend
# edit .env.backend; use two strong random secrets
docker compose --env-file .env.backend up -d --build
```

The frontend is exposed only on `127.0.0.1:8085`. PostgreSQL and FastAPI have NO host-published ports. Nginx proxies `/api/` to the backend.

## API

- `GET /api/health` — database health (no meet data)
- `GET /api/meets` — list (requires X-API-Key)
- `GET /api/meets/{uuid}` — latest state (requires X-API-Key)
- `PUT /api/meets/{uuid}` — JSON `{expected_revision: 0, snapshot: GlobalState}`
- `GET /api/meets/{uuid}/revisions` — revision metadata

Use a unique meet UUID and increment expected_revision. HTTP 409 means a newer server version exists: do not overwrite it. The client will preserve the browser copy.

## Backup and restore

A sidecar runs `pg_dump -Fc` every 24 hours and writes archives to a persistent `pg_backups` Docker volume. It retains ~30 days and never deletes meet revisions. Verify backups:

```bash
docker compose --env-file .env.backend logs backup --tail 30
docker compose --env-file .env.backend exec backup sh -c 'ls -lh /backups'
```

**Important:** Docker volume backups are not offsite backups. Before a real competition, configure regular encrypted copies to DigitalOcean Spaces, test a restoration to a separate database, monitor backup failures, and take a fresh export before meet day.

## Offline operation

The browser's existing Redux Persist cache preserves local changes during network outages when the app is already loaded. Import/export remains a separate recovery path. Automatic background synchronization, reconnect conflict UI, and durable service-worker caching are being integrated and need testing before claiming full offline operation. Do not run multiple concurrent scoring stations in production until event-level synchronization and conflict workflows are validated.

## Security

The pilot uses a single shared API key. Never commit it or put it in React build-time variables. The system must be behind HTTPS and appropriate network controls before any remote deployment. Replace the shared key with individual accounts, permissions, access logs, rate limiting, and HTTPS-only sessions for production.
