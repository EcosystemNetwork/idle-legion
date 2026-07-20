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

import { playerKey } from "./cloudSave";

const FN_BASE =
  (import.meta.env.VITE_INSFORGE_FN_URL as string | undefined) ||
  "https://ymtyw98w.function2.insforge.app";

/** True when a backend URL is configured — gates the "LIVE" UI affordances. */
export const ARENA_ONLINE = Boolean(FN_BASE);

async function callFn<T>(slug: string, body: Record<string, unknown>): Promise<T | null> {
  if (!FN_BASE) return null;
  try {
    const res = await fetch(`${FN_BASE}/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerKey: playerKey(), ...body }),
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
  playerKey: string;
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
