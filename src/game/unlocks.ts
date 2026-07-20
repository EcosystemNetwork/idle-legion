// Progressive feature unlocks.
//
// The game now carries ~20 systems. Showing all of them at once is the single
// biggest onboarding risk: a new player can't tell which loop matters first.
// So each surface stays hidden until the player has met the loop that teaches
// it — dig → staff → raid → fight → trade → compete → deep economy.
//
// Unlocks are derived from state (no extra persistence to keep in sync), and
// anyone who has prestiged keeps everything permanently — a Descend resets the
// run's counters but should never re-hide systems the player already learned.

import type { GameState } from "./types";
import { LAND_MIN_MIGHT } from "./config";

export interface TabUnlock {
  unlocked: boolean;
  /** What the player must do next, shown on the locked teaser. */
  hint: string;
}

/** Ordered by intended discovery — the first locked entry is the "next goal". */
export const UNLOCK_ORDER = [
  "kingdom",
  "stronghold",
  "legion",
  "raids",
  "arena",
  "codex",
  "market",
  "duels",
  "worldboss",
  "realm",
  "exchange",
] as const;

export function tabUnlock(state: GameState, might: number, id: string): TabUnlock {
  // Veterans keep every system across runs.
  const veteran = state.descents > 0;
  const yes = { unlocked: true, hint: "" };
  const gate = (cond: boolean, hint: string): TabUnlock =>
    veteran || cond ? yes : { unlocked: false, hint };

  switch (id) {
    // --- core loop: always available ---
    case "kingdom":
    case "stronghold":
    case "legion":
      return yes;

    // --- send the legion out ---
    case "raids":
      return gate(
        state.rooms.some((r) => r.type === "warroom"),
        "Dig a War Room in the Stronghold",
      );
    case "arena":
      return gate(state.totalRaids >= 1, "Complete your first raid");

    // --- loot & trade ---
    case "codex":
      return gate(state.gear.length > 0, "Find your first piece of gear");
    case "market":
      return gate(state.totalGoldEarned >= 5_000, "Earn 5,000 total gold");

    // --- competition (needs a real squad first) ---
    case "duels":
      return gate(state.totalBossWins >= 1, "Defeat an Arena boss");
    case "worldboss":
      return gate(state.totalBossWins >= 2, "Defeat 2 Arena bosses");

    // --- deep economy (late) ---
    case "realm":
      // Might alone can't gate this: every player starts with the Champion
      // "Kekius Maximus" (170 might), which would open Land on turn one. Pair the
      // real in-game claim requirement with a sign of actual play.
      return gate(
        might >= LAND_MIN_MIGHT && state.totalRaids >= 3,
        `Reach ${LAND_MIN_MIGHT} might and complete 3 raids`,
      );
    case "exchange":
      return gate(state.totalGoldEarned >= 25_000, "Earn 25,000 total gold");

    // Operator is gated by owning a Scrying Mirror, handled separately.
    default:
      return yes;
  }
}

/** The next thing to work toward, or null when everything is open. */
export function nextUnlock(
  state: GameState,
  might: number,
): { id: string; hint: string } | null {
  for (const id of UNLOCK_ORDER) {
    const u = tabUnlock(state, might, id);
    if (!u.unlocked) return { id, hint: u.hint };
  }
  return null;
}
