"""Versioned OpenLifter state snapshots.

An authenticated pilot API, not yet a multi-user scoring engine. A request's
expected_revision is checked while holding a PostgreSQL row lock.
"""
import hmac
import json
import os
from contextlib import asynccontextmanager
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator

DATABASE_URL = os.environ["DATABASE_URL"]
API_KEY = os.environ["PALEHORSE_API_KEY"]
if len(API_KEY) < 24 or API_KEY.lower() in {"changeme", "change-me", "dev"} or API_KEY.startswith("REPLACE_"):
    raise RuntimeError("PALEHORSE_API_KEY must be a unique secret with at least 24 characters")

DDL = """
CREATE TABLE IF NOT EXISTS meets (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    current_revision BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meet_revisions (
    meet_id UUID NOT NULL REFERENCES meets(id),
    revision BIGINT NOT NULL,
    snapshot JSONB NOT NULL,
    state_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (meet_id, revision)
);
"""

@asynccontextmanager
async def lifespan(app: FastAPI):
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute(DDL, prepare=False)
    yield

app = FastAPI(title="Pale Horse Lifter API", version="0.1.0", lifespan=lifespan)

def authorize(x_api_key: str | None = Header(default=None)):
    if not x_api_key or not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

class SnapshotWrite(BaseModel):
    expected_revision: int = Field(ge=0)
    snapshot: dict
    @field_validator("snapshot")
    @classmethod
    def validate_state(cls, value: dict):
        required = ("versions", "language", "meet", "registration", "lifting")
        if any(not isinstance(value.get(key), (dict if key != "language" else str)) for key in required):
            raise ValueError("Not a valid OpenLifter state")
        if not isinstance(value["meet"].get("name"), str) or not value["meet"]["name"].strip():
            raise ValueError("The meet must have a name before cloud sync")
        if len(json.dumps(value)) > 8_000_000:
            raise ValueError("Meet snapshot is too large")
        return value

@app.get("/api/health")
def health():
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}

@app.get("/api/meets", dependencies=[Depends(authorize)])
def list_meets():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT id, name, current_revision, updated_at FROM meets ORDER BY updated_at DESC LIMIT 200"
        ).fetchall()

@app.get("/api/meets/{meet_id}", dependencies=[Depends(authorize)])
def get_meet(meet_id: UUID):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        record = conn.execute(
            """SELECT m.id, m.name, m.current_revision, r.snapshot
               FROM meets m JOIN meet_revisions r
                 ON m.id=r.meet_id AND m.current_revision=r.revision
               WHERE m.id=%s""", (meet_id,)
        ).fetchone()
    if not record:
        raise HTTPException(status_code=404, detail="Meet not found")
    return record

@app.put("/api/meets/{meet_id}", dependencies=[Depends(authorize)])
def save_meet(meet_id: UUID, write: SnapshotWrite):
    snapshot = write.snapshot
    name = snapshot["meet"]["name"].strip()
    state_version = str(snapshot["versions"].get("stateVersion", "unknown"))
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.transaction():
            # Avoid duplicate initial inserts; guard the next mutation with FOR UPDATE.
            conn.execute(
                "INSERT INTO meets(id,name) VALUES (%s,%s) ON CONFLICT(id) DO NOTHING",
                (meet_id, name),
            )
            row = conn.execute(
                "SELECT current_revision FROM meets WHERE id=%s FOR UPDATE", (meet_id,)
            ).fetchone()
            current = row["current_revision"]
            if current != write.expected_revision:
                raise HTTPException(status_code=409, detail={
                    "message": "Revision conflict: load or export both copies before resolving",
                    "server_revision": current,
                })
            next_revision = current + 1
            conn.execute(
                """INSERT INTO meet_revisions(meet_id,revision,snapshot,state_version)
                   VALUES (%s,%s,%s::jsonb,%s)""",
                (meet_id, next_revision, json.dumps(snapshot), state_version),
            )
            conn.execute(
                """UPDATE meets SET name=%s,current_revision=%s,updated_at=now()
                   WHERE id=%s""", (name, next_revision, meet_id)
            )
    return {"id": meet_id, "revision": next_revision}

@app.get("/api/meets/{meet_id}/revisions", dependencies=[Depends(authorize)])
def revisions(meet_id: UUID):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        return conn.execute(
            """SELECT revision,state_version,created_at
               FROM meet_revisions WHERE meet_id=%s ORDER BY revision DESC LIMIT 500""",
            (meet_id,),
        ).fetchall()
