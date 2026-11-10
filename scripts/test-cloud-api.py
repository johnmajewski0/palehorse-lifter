"""Small destructive-isolated API smoke test; creates a new UUID, never deletes it."""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

base = os.environ.get("PALEHORSE_BASE_URL", "http://127.0.0.1:8085").rstrip("/")
key = os.environ.get("PALEHORSE_API_KEY", "")
if not key:
    raise SystemExit("Set PALEHORSE_API_KEY in the current shell first.")

meet_id = str(uuid.uuid4())
state = {
    "versions": {"stateVersion": "0", "releaseVersion": "1.4"},
    "language": "en",
    "meet": {"name": "Pale Horse API Smoke Test", "date": "2026-11-09"},
    "registration": {"entries": []},
    "lifting": {"day": 1},
}

def request(method, path, data=None, authorized=True):
    headers = {"Content-Type": "application/json"}
    if authorized:
        headers["X-API-Key"] = key
    payload = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(base + path, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as result:
            return result.status, json.load(result)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))

status, _ = request("GET", "/api/meets", authorized=False)
assert status == 401, f"Unauthenticated read must be denied, got {status}"

path = "/api/meets/" + meet_id
status, payload = request("PUT", path, {"expected_revision": 0, "snapshot": state})
assert status == 200 and payload["revision"] == 1, (status, payload)

status, payload = request("GET", path)
assert status == 200 and payload["current_revision"] == 1, (status, payload)

status, payload = request("PUT", path, {"expected_revision": 0, "snapshot": state})
assert status == 409, (status, payload)

status, payload = request("GET", path + "/revisions")
assert status == 200 and len(payload) == 1, (status, payload)
print("PASS: authentication, first save, read, optimistic conflict, revision history")
print("Test meet UUID:", meet_id)
