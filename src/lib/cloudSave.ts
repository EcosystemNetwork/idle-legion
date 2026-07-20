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
import { cachedToken } from "./session";
import type { GameState } from "../game/types";

const BASE =
  (import.meta.env.VITE_INSFORGE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
// Scoped PER player key. A single global marker meant that after signing in we
// compared the account's cloud stamp against a stamp written for the anonymous
// device save — so a 10-minute anonymous session could look "newer" than a
// 50-hour account and overwrite it.
const SAVED_AT_PREFIX = "idle-legion-cloud-savedat";
const savedAtKey = (key: string) => `${SAVED_AT_PREFIX}:${key}`;

export interface Identity {
  email?: string | null;
  walletAddress?: string | null;
}

let identity: Identity = {};

/** Update the identity used to derive the player key on subsequent calls. */
export function setCloudIdentity(next: Identity) {
  identity = { ...identity, ...next };
}

/**
 * The stable key this player's save is stored under.
 *
 * SECURITY: this deliberately keys on the WALLET ADDRESS, not the email.
 * `email:<address>` was guessable, and the endpoint runs with the admin key —
 * so knowing someone's email was enough to read their save (with PII) or
 * overwrite it. The address is the only identity the server can actually verify
 * (the player signs a statement with it; see lib/session.ts), so the key must be
 * exactly what a verified token asserts (`wallet:<addr>`) for the check to work.
 *
 * Anonymous players keep an unguessable random `device:` key — nothing to guess,
 * so no proof is required and offline play needs no wallet.
 */
export function playerKey(): string {
  const wallet = identity.walletAddress?.trim().toLowerCase();
  if (wallet) return `wallet:${wallet}`;
  return `device:${operatorId()}`;
}

/** True when the current key is one the server will demand a token for. */
export function needsAuth(): boolean {
  return playerKey().startsWith("wallet:");
}

/**
 * savedAt (ms) this device last synced FOR THE CURRENT PLAYER KEY, or 0 if it
 * has never synced that key (which is what makes a fresh device adopt the cloud).
 */
export function localSavedAt(): number {
  try {
    return Number(localStorage.getItem(savedAtKey(playerKey()))) || 0;
  } catch {
    return 0;
  }
}

/** Record the savedAt we're now in sync with (after a push or an adopt). */
export function markCloudSynced(savedAt: number) {
  try {
    localStorage.setItem(savedAtKey(playerKey()), String(savedAt));
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
      // The last push of a session fires from pagehide/visibilitychange. Without
      // keepalive the browser cancels it as the tab goes away, so the tail of a
      // session was regularly lost.
      keepalive: true,
      body: JSON.stringify({
        op,
        playerKey: playerKey(),
        // Proof of address ownership. Only required for `wallet:` keys; the
        // server rejects those without it (see functions/cloud-save.ts).
        token: cachedToken(identity.walletAddress) ?? undefined,
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
  // Mark the sync OPTIMISTICALLY, before the round-trip. A push fired from
  // pagehide often lands on the server while the tab dies before its response
  // resolves — leaving this device believing it had never synced, so the very
  // save it had just written came back as "fresher cloud state" on the next
  // boot and was re-adopted (which re-ran offline catch-up and re-showed the
  // welcome-back report). Marking up front is safe: the marker only suppresses
  // adopting a save at or below this stamp, and a genuinely newer save from
  // another device carries a later one.
  const prev = localSavedAt();
  markCloudSynced(savedAt);
  const r = await call<{ ok: boolean; savedAt?: number }>("save", {
    state: sanitize(state),
    savedAt,
  });
  // Definitively rejected (stale/invalid/unauthorised) → the cloud holds
  // something we did not write, so restore the old marker and let the next
  // reconcile consider adopting it.
  if (r && !r.ok) markCloudSynced(r.savedAt ?? prev);
}
