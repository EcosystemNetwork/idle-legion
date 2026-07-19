// Cloud-backed persistence for a player's game state.
//
// localStorage stays the authoritative, synchronous fast path (see engine
// save/loadState). This module mirrors that save to the InsForge `cloud-save`
// edge function so progress survives a cleared cache and roams across devices
// for a signed-in player.
//
// Player key precedence — the most portable identity available wins:
//   email  →  wallet address  →  device id (operatorId)
// A signed-in player keeps one save across browsers; an anonymous player keeps a
// per-device save. On sign-in the local save is pushed up under the
// authenticated key, so anonymous progress carries over to the account.
//
// Ordering is last-write-wins by a client wall-clock `savedAt` (ms). We track
// the savedAt of our own last successful push in localStorage; a cloud save is
// only adopted when it is strictly newer than that, so the device that wrote it
// never re-adopts its own save, but a fresher save from elsewhere is picked up.

import { operatorId } from "./insforge";
import type { GameState } from "../game/types";

const BASE =
  (import.meta.env.VITE_INSFORGE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const SAVED_AT_KEY = "idle-legion-cloud-savedat";

export interface Identity {
  email?: string | null;
  walletAddress?: string | null;
}

let identity: Identity = {};

/** Update the identity used to derive the player key on subsequent calls. */
export function setCloudIdentity(next: Identity) {
  identity = { ...identity, ...next };
}

/** The stable key this player's save is stored under (see precedence above). */
export function playerKey(): string {
  const email = identity.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const wallet = identity.walletAddress?.trim().toLowerCase();
  if (wallet) return `wallet:${wallet}`;
  return `device:${operatorId()}`;
}

/** savedAt (ms) of this device's last successful push, or 0 if it never pushed. */
export function localSavedAt(): number {
  try {
    return Number(localStorage.getItem(SAVED_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Record the savedAt we're now in sync with (after a push or an adopt). */
export function markCloudSynced(savedAt: number) {
  try {
    localStorage.setItem(SAVED_AT_KEY, String(savedAt));
  } catch {
    /* ignore */
  }
}

// Strip the transient, one-shot UI fields the same way engine.saveState does —
// these should never be persisted (offline/raid reports, pending level-ups).
function sanitize(state: GameState): GameState {
  return { ...state, offlineSummary: null, raidReport: null, levelUps: [] };
}

async function call<T>(op: string, extra: Record<string, unknown>): Promise<T | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/functions/cloud-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op,
        playerKey: playerKey(),
        email: identity.email ?? null,
        walletAddress: identity.walletAddress ?? null,
        ...extra,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface CloudSave {
  state: GameState;
  savedAt: number;
}

/**
 * Fetch the cloud save for the current player key. Returns null when there is
 * none, the backend is unreachable, or the response is malformed. The caller
 * decides whether it's newer than local (via localSavedAt) before adopting.
 */
export async function loadCloud(): Promise<CloudSave | null> {
  const r = await call<{ found: boolean; state: GameState | null; savedAt: number | null }>(
    "load",
    {},
  );
  if (!r || !r.found || !r.state) return null;
  return { state: r.state, savedAt: r.savedAt ?? 0 };
}

/**
 * Push the local state up under the current player key. Best-effort: a failure
 * just leaves the cloud copy stale until the next push. On success we record the
 * savedAt so this device knows it's in sync.
 */
export async function saveCloud(state: GameState): Promise<void> {
  if (!BASE) return;
  const savedAt = Date.now();
  const r = await call<{ ok: boolean; savedAt?: number }>("save", {
    state: sanitize(state),
    savedAt,
  });
  if (r?.ok) markCloudSynced(savedAt);
}
