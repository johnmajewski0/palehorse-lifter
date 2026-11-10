# Pale Horse Lifter — persistence design

## Current state (not yet synchronized)
The React app stores a `GlobalState` Redux object in browser-local storage via `redux-persist` (`src/store.ts`). Its structure is defined in `src/types/stateTypes.ts`: `versions`, `language`, `meet`, `registration`, and `lifting`. Existing `.openlifter` JSON export/import must continue to work.

## Proposed first backend milestone
- FastAPI provides authenticated meet CRUD endpoints and versioned snapshots.
- PostgreSQL stores immutable snapshot revisions: `meet_id`, `revision`, `snapshot_json` (JSONB), `schema_version`, `created_at`, and `actor_id`; a separate `meets` table tracks the current revision.
- Every write includes an expected revision. Use transactions and reject stale updates with HTTP 409; never silently overwrite another station's data.
- Preserve historical revisions and record actor + UTC time for corrections. Never delete historical meet data through routine operations.
- Continue browser-local persistence for short disconnections. Queued edits need deterministic replay and explicit user-visible conflict resolution; do not auto-sync arbitrary stale full-state snapshots over active data.
- Maintain downloadable `.openlifter` backup snapshots and test round-trip import/export.

## No backend enabled yet
This document proposes the design. There are currently no server-side data APIs, authentication, meet synchronization, or PostgreSQL containers in the running app. Do not assume the current Docker deployment supports multiple scoring stations.

## Before implementation
Confirm administrator/scorer roles; define whether attempts and weigh-ins need separate event-level operations; specify day-of-meet offline workflows; test real competition edge cases before production.
