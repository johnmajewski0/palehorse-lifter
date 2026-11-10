// Optional pilot sync. The browser remains the working copy during network loss.
// This service never silently replaces browser state with a remote snapshot.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "react-redux";
import { overwriteStore } from "../actions/globalActions";

interface MeetBackup {
  id: string;
  revision: number;
  signature: string;
}

const ACTIVE_KEY = "palehorse-cloud-meet";
const KEY_SESSION = "palehorse-api-key";
const SNAPSHOT_FIELDS = ["versions", "language", "meet", "registration", "lifting"];

const snapshotOf = (raw: any): any => {
  const output: any = {};
  SNAPSHOT_FIELDS.forEach((key) => {
    output[key] = raw[key];
  });
  return output;
};

const randomId = (): string => {
  return window.crypto.randomUUID();
};

const CloudSync = () => {
  const store = useStore();
  const [apiKey, setApiKey] = useState<string>(sessionStorage.getItem(KEY_SESSION) || "");
  const [enabled, setEnabled] = useState<boolean>(false);
  const [meetIdInput, setMeetIdInput] = useState<string>("");
  const [status, setStatus] = useState<string>("Cloud sync disabled; browser data is still saved locally.");
  const [conflict, setConflict] = useState<boolean>(false);
  const inFlight = useRef<boolean>(false);
  const lastSent = useRef<string>("");
  const [active, setActive] = useState<MeetBackup | null>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_KEY);
      return saved ? (JSON.parse(saved) as MeetBackup) : null;
    } catch (e) {
      return null;
    }
  });

  const currentName = (): string => {
    const state: any = store.getState();
    return state.meet && state.meet.name ? state.meet.name.trim() : "";
  };

  const signatureOf = (state: any): string => {
    return JSON.stringify([state.meet && state.meet.name, state.meet && state.meet.date]);
  };

  const disconnect = () => {
    setEnabled(false);
    setConflict(false);
    setStatus("Cloud sync paused. Your local browser data is retained.");
  };

  const enable = () => {
    if (!apiKey.trim()) {
      setStatus("Enter an API key before enabling cloud sync.");
      return;
    }
    if (!currentName()) {
      setStatus("Create or open a named meet before enabling cloud sync.");
      return;
    }
    sessionStorage.setItem(KEY_SESSION, apiKey.trim());
    const signature = signatureOf(store.getState());
    if (active && active.signature && active.signature !== signature) {
      setStatus("This is a different meet. Choose New cloud record before enabling sync.");
      return;
    }
    const selected = active
      ? { ...active, signature: signature }
      : { id: randomId(), revision: 0, signature: signature };
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(selected));
    setActive(selected);
    lastSent.current = "";
    setConflict(false);
    setEnabled(true);
    setStatus("Cloud sync enabled; checking server...");
  };

  const recover = async () => {
    const id = meetIdInput.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      setStatus("Enter a valid meet UUID.");
      return;
    }
    if (!apiKey.trim()) {
      setStatus("Enter the API key first.");
      return;
    }
    if (!window.confirm("Replace the current local meet with this server copy? Export local work first if needed.")) {
      return;
    }
    try {
      disconnect();
      const response = await fetch("/api/meets/" + id, {
        headers: { "X-API-Key": apiKey.trim() },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Server returned HTTP " + response.status);
      }
      const server = await response.json();
      if (!server.snapshot || !server.snapshot.meet || !server.snapshot.versions) {
        throw new Error("Invalid meet data received");
      }
      const selected = {
        id: server.id,
        revision: server.current_revision,
        signature: signatureOf(server.snapshot),
      };
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(selected));
      setActive(selected);
      lastSent.current = JSON.stringify(server.snapshot);
      sessionStorage.setItem(KEY_SESSION, apiKey.trim());
      store.dispatch(overwriteStore(server.snapshot) as any);
      setConflict(false);
      setEnabled(true);
      setStatus("Server copy recovered (revision " + selected.revision + ").");
    } catch (error) {
      setStatus("Recovery failed; existing browser data was not replaced.");
    }
  };

  useEffect(() => {
    if (!enabled || !active || conflict) {
      return;
    }
    // Periodically compare the current Redux store to the last acknowledged
    // snapshot. Redux Persist continues saving to localStorage independently.
    const check = async () => {
      if (inFlight.current) {
        return;
      }
      const payload = snapshotOf(store.getState());
      if (active.signature !== signatureOf(payload)) {
        setStatus("Meet identity changed. Cloud writes paused; create a new cloud record or recover the original meet.");
        setConflict(true);
        return;
      }
      if (!payload.meet || !payload.meet.name || !payload.meet.name.trim()) {
        return;
      }
      const body = JSON.stringify(payload);
      if (body === lastSent.current) {
        return;
      }
      inFlight.current = true;
      try {
        const response = await fetch("/api/meets/" + active.id, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey.trim(),
          },
          body: JSON.stringify({ expected_revision: active.revision, snapshot: payload }),
        });
        if (response.status === 409) {
          setConflict(true);
          setStatus("CONFLICT: another station saved a newer revision. Export your local meet before resolving.");
          return;
        }
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        const result = await response.json();
        const next = { ...active, revision: result.revision };
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(next));
        lastSent.current = body;
        setActive(next);
        setStatus("Cloud backup saved: revision " + next.revision);
      } catch (error) {
        setStatus("Offline or API unavailable: local changes retained; retrying.");
      } finally {
        inFlight.current = false;
      }
    };
    check();
    const interval = window.setInterval(check, 5000);
    return () => window.clearInterval(interval);
  }, [store, apiKey, enabled, active, conflict]);

  const newCloudMeet = () => {
    if (!window.confirm("Create a new cloud record for the CURRENT browser meet? Existing server records are preserved.")) {
      return;
    }
    const record = { id: randomId(), revision: 0, signature: signatureOf(store.getState()) };
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(record));
    setActive(record);
    lastSent.current = "";
    setConflict(false);
    setEnabled(false);
    setStatus("New cloud record ready. Enable sync when the correct meet is open.");
  };

  return (
    <details style={{ position: "fixed", right: 12, bottom: 12, zIndex: 1050, maxWidth: 350, background: "#101010", color: "white", border: "1px solid #777", padding: 10, borderRadius: 5, boxShadow: "0 2px 10px #555" }}>
      <summary style={{ cursor: "pointer" }}>Meet Cloud Backup {conflict ? "— CONFLICT" : enabled ? "— ON" : "— OFF"}</summary>
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 12 }}>{status}</p>
        <label htmlFor="cloud-key" style={{ display: "block" }}>API key (this browser tab session)</label>
        <input id="cloud-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
        <div style={{ fontSize: 12, marginBottom: 6 }}>Cloud meet ID: {active ? active.id : "Not assigned"}</div>
        <button type="button" onClick={enabled ? disconnect : enable}>{enabled ? "Pause sync" : "Enable sync"}</button>
        <button type="button" onClick={newCloudMeet} style={{ marginLeft: 6 }}>New cloud record</button>
        <hr style={{ borderColor: "#666" }} />
        <label htmlFor="cloud-recover" style={{ display: "block" }}>Recover a server meet by UUID</label>
        <input id="cloud-recover" value={meetIdInput} onChange={(e) => setMeetIdInput(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
        <button type="button" onClick={recover}>Load server copy</button>
        <p style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>While offline, keep the app open and use Save to File for extra protection. Never resolve a conflict by overwriting blindly.</p>
      </div>
    </details>
  );
};

export default CloudSync;
