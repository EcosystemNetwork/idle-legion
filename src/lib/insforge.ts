// Client bridge to the InsForge backend that powers the Scrying Mirror + Operator
// secret missions. Deliberately self-contained (no imports from the game state)
// so the operator feature is decoupled from the core engine: identity + mirror
// status live in localStorage, everything authoritative lives server-side.
//
// Endpoints are public edge functions (same pattern as telemetry `track`):
//   POST {FN_BASE}/claim-mirror     → mint a mirror (global cap enforced in Postgres)
//   POST {FN_BASE}/operator-feed    → the secret mission feed (gated on owning a mirror)
//   POST {FN_BASE}/complete-mission → validate + reward a mission (server-checked)

const FN_BASE =
  (import.meta.env.VITE_INSFORGE_FN_URL as string | undefined) ||
  "https://ymtyw98w.function2.insforge.app";

const OP_KEY = "idle-legion-operator";
const MIRROR_KEY = "idle-legion-mirror";

/** Stable per-device operator identity. One mirror may be minted per operator. */
export function operatorId(): string {
  try {
    let id = localStorage.getItem(OP_KEY);
    if (!id) {
      id = `op_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
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

// ---- fetch wrapper -----------------------------------------------------------

async function callFn<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${FN_BASE}/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorId: operatorId(), ...body }),
  });
  if (!res.ok) throw new Error(`insforge ${slug} → ${res.status}`);
  return (await res.json()) as T;
}

// ---- Scrying Mirror claim ----------------------------------------------------

export type ClaimStatus = "claimed" | "already" | "sold_out" | "error";
export interface ClaimResult {
  status: ClaimStatus;
  serial: number | null;
  remaining?: number;
  total?: number;
  message?: string;
}

/** Attempt the day-8 mirror claim. Caches the outcome so we never re-mint. */
export async function claimMirror(): Promise<ClaimResult> {
  const result = await callFn<ClaimResult>("claim-mirror", {});
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

export function operatorFeed(): Promise<FeedResult> {
  return callFn<FeedResult>("operator-feed", {});
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
export function completeMission(code: string, answer?: string): Promise<CompleteResult> {
  return callFn<CompleteResult>("complete-mission", { code, answer: answer ?? "" });
}
