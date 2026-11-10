# Pale Horse Lifter: phase 1

This branch is a black-and-white, containerized frontend foundation for the existing OpenLifter application. The original scoring logic is unchanged.

## Local Docker build

```bash
docker compose build
docker compose up -d
curl http://127.0.0.1:8085/healthz
```

Browse to http://localhost:8085 on the Docker host.

The compose port is **bound to localhost** deliberately: use a TLS reverse proxy before exposing it to the internet. For DigitalOcean deploy behind Caddy, Nginx Proxy Manager or another HTTPS gateway.

## Storage is not yet server-side

OpenLifter currently uses Redux Persist in the browser. Docker and this Nginx container do NOT provide meet synchronization, a database, or centralized backups. Do not rely on the container deployment alone for multi-station competition operations. A subsequent phase will introduce a durable API and PostgreSQL with versioned writes, backups, and tested offline behavior.

## Source and license

Retain OpenLifter's copyright, license, and attribution. This fork is licensed AGPL-3.0-or-later. Modified versions served to users over a network must meet the AGPL's corresponding-source obligations.

## Emblem

The uploaded Pale Horse Barbell emblem will be integrated in a separate asset commit; this foundation uses accessible typographic branding until the emblem is copied to the repository.
