// Client bridge to the real, shared multiplayer arena (World Boss + PvP ladder).
//
// The engine keeps a fully-playable *simulated* World Boss + duel ladder so the
// game works offline. When the InsForge backend is reachable, these calls swap
// the simulated rivals/opponents for REAL players sharing one boss + one ladder:
//   world-boss  → one authoritative boss row; everyone's damage is durable
//   duel-ladder → other players' last-synced snapshots become your opponents
//
// Same edge-function pattern as lib/insforge.ts. Every call fails soft (returns
// null) so a missing/unreachable backend silently falls back to the local sim.

const FN_BASE =
  (import.meta.env.VITE_INSFORGE_FN_URL as string | undefined) ||
  "https://ymtyw98w.function2.insforge.app";

/** True when a backend URL is configured — gates the "LIVE" UI affordances. */
export const ARENA_ONLINE = Boolean(FN_BASE);

const ARENA_ID_KEY = "idle-legion-arena-id";

/**
 * The identity these endpoints run on — a high-entropy random id, NOT the cloud
 * save's `playerKey`.
 *
 * SECURITY: `playerKey()` is `email:<address>` for a signed-in player, so it is
 * *guessable*. These endpoints are public and trust the key in the body, which
 * meant anyone who knew a player's email could claim their World Boss rewards
 * (`op:"claim"`) or overwrite their ladder row (name, power, rating) — a
 * targeted-griefing and reward-theft hole. Keying the arena on an unguessable
 * secret removes the attack outright: there is no name an attacker can guess.
 *
 * The ladder never returns raw keys (opponents are exposed as salted-hash
 * handles), so this id is never published.
 *
 * Trade-off: the arena identity is per-device, so a second browser is a new
 * legion on the ladder. That is honest for a competitive board and strictly
 * better than a guessable one. Cross-device arena identity needs real
 * authentication — see the cloud-save note; it is the same underlying fix.
 */
export function arenaId(): string {
  try {
    let id = localStorage.getItem(ARENA_ID_KEY);
    if (!id) {
      const buf = new Uint8Array(16);
      (globalThis.crypto ?? ({} as Crypto)).getRandomValues?.(buf);
      const rand = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
      id = `arena_${rand || Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
      localStorage.setItem(ARENA_ID_KEY, id);
    }
    return id;
  } catch {
    return "arena_ephemeral";
  }
}

async function callFn<T>(slug: string, body: Record<string, unknown>): Promise<T | null> {
  if (!FN_BASE) return null;
  try {
    const res = await fetch(`${FN_BASE}/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerKey: arenaId(), ...body }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // offline / blocked → caller falls back to the local sim
  }
}

// ---- World Boss ----

export interface WbLeaderRow {
  name: string;
  contributed: number;
  isYou: boolean;
}
export interface WbResolved {
  week: number;
  rank: number;
  field: number;
  tier: number;
}
export interface WbReward {
  gold: number;
  legion: number;
  lunchboxes: number;
  cycles: number;
}
export interface WbState {
  boss: { tier: number; hp: number; maxHp: number; endsAt: number; week: number };
  leaderboard: WbLeaderRow[];
  you: { contributed: number; rank: number | null };
  pendingReward: WbReward;
  resolved: WbResolved | null;
}

export function fetchWorldBoss(name: string): Promise<WbState | null> {
  return callFn<WbState>("world-boss", { op: "state", name });
}

export function strikeWorldBoss(name: string, damage: number): Promise<WbState | null> {
  return callFn<WbState>("world-boss", { op: "hit", name, damage });
}

/** Redeem this player's server-recorded rewards; the server marks them claimed. */
export function claimWorldBossRewards(): Promise<{ reward: WbReward } | null> {
  return callFn<{ reward: WbReward }>("world-boss", { op: "claim" });
}

// ---- PvP ladder ----

export interface LadderOpponent {
  /**
   * Opaque, salted-hash handle for this opponent. It used to be the raw
   * player_key — which for a signed-in player is literally `email:<address>`,
   * so the ladder was publicly leaking email addresses (and handing out the
   * exact key needed to read/overwrite that player's cloud save).
   */
  oppId: string;
  name: string;
  rating: number;
  power: number;
  combatClass: "melee" | "ranged" | "charge";
  wins: number;
  losses: number;
}
export interface LadderSync {
  opponents: LadderOpponent[];
  rank: number;
  field: number;
}

export function syncLadder(input: {
  name: string;
  rating: number;
  power: number;
  combatClass: string;
  wins: number;
  losses: number;
}): Promise<LadderSync | null> {
  return callFn<LadderSync>("duel-ladder", { op: "sync", ...input });
}
