# Pale Horse Lifter — recovery and validation runbook

## Pilot checklist

1. Copy `.env.backend.example` to `.env.backend`. Set new, unique database and API secrets. Keep it out of Git.
2. Launch: `docker compose --env-file .env.backend up -d --build`.
3. Verify: `docker compose --env-file .env.backend ps`, and browse `http://localhost:8085/api/health`; expected `{"status":"ok"}`.
4. Enter the API key into the **Meet Cloud Backup** panel. Create a named meet and enable sync.
5. Verify the cloud meet UUID and revision number are displayed. Save a separate `.openlifter` export.
6. To test conflict protection, use `scripts/test-cloud-api.py` with the API key in a shell environment; it uses an isolated test UUID and checks HTTP 409.
7. Confirm the backup service produced a `.dump` file: `docker compose --env-file .env.backend exec backup ls -lh /backups`.
8. TEST an isolated database restore before production; seeing a dump file is not sufficient.

## Offline drill (before a live competition)

1. Load the application online and allow the service worker to install. Confirm the home, meet setup, lifting, and results screens load.
2. Create a named test meet, enable cloud sync, and verify a saved revision.
3. Disconnect networking but leave the tab open. Change a harmless field. Confirm the panel reports an offline/retry state. Export `.openlifter`.
4. Reconnect. Confirm a newer revision is saved. Verify the server state by recovering the UUID in a **separate test browser profile**. Do not overwrite unsaved work.
5. Disconnect again and try refreshing offline. Only mark offline reload supported if the cached shell and required assets actually work.
6. Simulate a conflict from two profiles with the same UUID. Confirm HTTP 409 and a visible conflict alert; export both copies for manual resolution.

## Disaster recovery

PostgreSQL database volume: `pg_data`. Database archive volume: `pg_backups`. The backup task makes a compressed logical dump about every 24 hours. The backups are on the same Docker host and **are not disaster recovery by themselves**.

A qualified operator should copy backup dumps to an encrypted offsite location, monitor failures, and rehearse restoration to a **separate** PostgreSQL instance. Never restore onto a running meet database. Do not run `docker compose down -v` because that removes the database and backup volumes.

## Current operational limits

- Shared API key with no per-user attribution or role-based permissions
- Whole-meet revision sync only; competing stations will conflict instead of merging changes
- Browser data retained locally while offline, but durability depends on browser storage policies
- Service worker caches the app shell but must be tested on each target device/browser
- Automatic dump backups are local-volume-only and have no alerting or offsite replication

**Not cleared for production competition use until all checks pass.**
