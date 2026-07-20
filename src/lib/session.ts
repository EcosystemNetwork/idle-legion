// Proof-of-address session tokens for the authenticated backend endpoints.
//
// The cloud save is keyed by a real-world identity, which is inherently
// guessable — so the server now demands proof before it will read or write one
// (see functions/auth.ts and functions/cloud-save.ts). This module produces that
// proof: the player signs one short statement per session with the wallet they
// already logged in with (Magic or injected — both expose an ethers Signer), and
// we exchange the signature for a short-lived token.
//
// The signature prompt happens ONCE per ~12h, not per save: cloud pushes run on a
// 15s timer, and prompting on each would be unusable.

import type { Signer } from "ethers";

const BASE =
  (import.meta.env.VITE_INSFORGE_FN_URL as string | undefined) ||
  "https://ymtyw98w.function2.insforge.app";

const TOKEN_KEY = "idle-legion-session-token";
/** Must match functions/auth.ts exactly — the server rejects anything else. */
const STATEMENT = "Idle Legion — prove control of this address to sync your legion.";
/** Refresh a little before the server's TTL so a push never races an expiry. */
const REFRESH_MARGIN_MS = 10 * 60_000;

interface StoredToken {
  token: string;
  sub: string;
  exp: number;
}

function read(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (!t?.token || !t?.sub || typeof t.exp !== "number") return null;
    if (Date.now() > t.exp - REFRESH_MARGIN_MS) return null; // expired / about to
    return t;
  } catch {
    return null;
  }
}

function write(t: StoredToken) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  } catch {
    /* storage blocked — we'll just re-sign next time */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** The canonical authenticated key for an address — must equal the server's `sub`. */
export function walletKeyFor(address: string): string {
  return `wallet:${address.trim().toLowerCase()}`;
}

/** A cached, unexpired token for this address, if we already have one. */
export function cachedToken(address?: string | null): string | null {
  const t = read();
  if (!t) return null;
  if (address && t.sub !== walletKeyFor(address)) return null; // different account
  return t.token;
}

/**
 * Get a valid session token, signing once if needed. Returns null when we can't
 * (no signer, user rejected the prompt, backend down) — callers then fall back to
 * anonymous/local-only behaviour rather than failing the save.
 */
export async function ensureSession(
  signer: Signer | null | undefined,
  address: string | null | undefined,
): Promise<string | null> {
  if (!address) return null;
  const cached = cachedToken(address);
  if (cached) return cached;
  if (!signer) return null;

  try {
    // The statement binds BOTH a timestamp and the address, so the server can
    // reject stale replays and signatures presented for a different account.
    const message = `${STATEMENT}\nissued: ${Date.now()}\naddress: ${address.toLowerCase()}`;
    const signature = await signer.signMessage(message);
    const res = await fetch(`${BASE}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, message, signature }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as StoredToken;
    if (!data?.token) return null;
    write(data);
    return data.token;
  } catch {
    return null; // user declined the signature, or we're offline
  }
}
