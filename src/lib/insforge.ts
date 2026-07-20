// Client bridge to the InsForge backend that powers the Scrying Mirror + Operator
// secret missions. Deliberately self-contained (no imports from the game state)
// so the operator feature is decoupled from the core engine: identity + mirror
// status live in localStorage, everything authoritative lives server-side.
//
// Endpoints are public edge functions (same pattern as telemetry `track`):
//   POST {FN_BASE}/claim-mirror     → mint a mirror (global cap enforced in Postgres)
//   POST {FN_BASE}/operator-feed    → the secret mission feed (gated on owning a mirror)
//   POST {FN_BASE}/complete-mission → validate + reward a mission (server-checked)

import { cachedToken } from "./session";

const FN_BASE =
  (import.meta.env.VITE_INSFORGE_FN_URL as string | undefined) ||
  "https://ymtyw98w.function2.insforge.app";

const OP_KEY = "idle-legion-operator";
const MIRROR_KEY = "idle-legion-mirror";

/**
 * Stable per-device operator identity. One mirror may be minted per operator.
 *
 * SECURITY: this doubles as the anonymous cloud-save key (`device:<id>`), which
 * the server accepts without a token precisely because it is assumed to be an
 * unguessable secret — and those rows carry email/wallet PII. It used to be
 * `Math.random()`, whose PRNG state is recoverable from a handful of outputs, so
 * the assumption didn't hold. Now it's CSPRNG, like `arenaId()`.
 *
 * Ids already in localStorage are kept as-is: rotating them would orphan every
 * existing cloud save and mirror claim. Only new devices get the strong id.
 */
export function operatorId(): string {
  try {
    let id = localStorage.getItem(OP_KEY);
    if (!id) {
      const buf = new Uint8Array(16);
      (globalThis.crypto ?? ({} as Crypto)).getRandomValues?.(buf);
      const rand = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
      id = `op_${rand || Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
      localStorage.setItem(OP_KEY, id);
    }
    return id;
  } catch {
    return "op_ephemeral";
  }
}

// ---- local mirror cache (so UI reads status synchronously, no re-mint) --------

export interface MirrorStatus {
  serial: number | null; // the mirror's number (null = don't hold one)
  soldOut: boolean; // the global supply ran out before we claimed
}

export function getCachedMirror(): MirrorStatus {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (raw) return JSON.parse(raw) as MirrorStatus;
  } catch {
    /* ignore */
  }
  return { serial: null, soldOut: false };
}

function cacheMirror(s: MirrorStatus) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function isOperator(): boolean {
  return getCachedMirror().serial != null;
}

/** Persist a serial discovered via cross-device ownership sync (operator-feed). */
export function rememberMirror(serial: number) {
  cacheMirror({ serial, soldOut: false });
}

// ---- fetch wrapper -----------------------------------------------------------

async function callFn<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  // The session token is what makes `identity` mean anything server-side — an
  // identity without it is ignored (and, for a mirror claim, refused). It's
  // already minted at wallet-connect for the cloud save, so this costs no extra
  // signature prompt.
  const res = await fetch(`${FN_BASE}/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorId: operatorId(), token: cachedToken() ?? "", ...body }),
  });
  // The functions signal permanent, non-retryable outcomes with a 4xx that still
  // carries a JSON `status` (e.g. complete-mission's 403 not_operator / 404
  // unknown_mission). Throwing on those collapsed them into the caller's generic
  // "couldn't reach the deep — try again", telling the player to retry something
  // that will never succeed. Pass the body through; only fail on 5xx/garbage.
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (body && typeof (body as { status?: unknown }).status === "string") return body as T;
    throw new Error(`insforge ${slug} → ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---- Scrying Mirror claim ----------------------------------------------------

export type ClaimStatus =
  | "claimed"
  | "already"
  | "sold_out"
  | "rate_limited"
  | "needs_identity"
  | "error";
export interface ClaimResult {
  status: ClaimStatus;
  serial: number | null;
  remaining?: number;
  total?: number;
  message?: string;
}

/**
 * Attempt the day-8 mirror claim. Requires a verified `identity` (wallet address
 * or Magic email) — the launch-grade anti-sybil gate; one mirror per account.
 * Caches the outcome so we never re-mint.
 */
export async function claimMirror(identity?: string): Promise<ClaimResult> {
  const result = await callFn<ClaimResult>("claim-mirror", { identity: identity ?? "" });
  if (result.status === "claimed" || result.status === "already") {
    cacheMirror({ serial: result.serial, soldOut: false });
  } else if (result.status === "sold_out") {
    cacheMirror({ serial: null, soldOut: true });
  }
  return result;
}

// ---- Operator secret-mission board ------------------------------------------

export type MissionKind = "vision" | "cipher";
export interface OperatorMission {
  id: string;
  code: string;
  kind: MissionKind;
  title: string;
  brief: string;
  rewardGold: number;
  rewardBoxes: number;
  rewardGear: string | null;
  completed: boolean;
}
export interface FeedResult {
  operator: boolean; // false → caller doesn't hold a mirror
  serial?: number;
  missions: OperatorMission[];
}

export function operatorFeed(identity?: string): Promise<FeedResult> {
  return callFn<FeedResult>("operator-feed", { identity: identity ?? "" });
}

export type CompleteStatus =
  | "complete"
  | "already_done"
  | "wrong"
  | "not_operator"
  | "unknown_mission";
export interface MissionReward {
  gold: number;
  boxes: number;
  gear: string | null;
}
export interface CompleteResult {
  status: CompleteStatus;
  reward?: MissionReward;
}

/** Complete a mission. Ciphers require the right `answer` (checked server-side). */
export function completeMission(
  code: string,
  answer?: string,
  identity?: string,
): Promise<CompleteResult> {
  return callFn<CompleteResult>("complete-mission", {
    code,
    answer: answer ?? "",
    identity: identity ?? "",
  });
}
