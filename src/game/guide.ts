// The Next Objective engine.
//
// A new player's first question is never "what systems exist" — it is "what do
// I do now". The game already knows the answer: it lives in state (a full room,
// a wounded hero, an unclaimed daily, an unmet unlock gate) but was scattered
// across eleven screens and a greyed-out pill in the tab bar.
//
// This module derives ONE directive from existing state. It adds no gameplay:
// every branch points at an action the player could already take. The ladder is
// ordered by what a stalled player most needs to hear, not by reward size —
// something wasting away (a full mine, a bleeding hero) beats something merely
// available.

import type { GameState, DerivedStats } from "./types";
import { ROOMS, RAIDS, DESCEND_MIN_GOLD } from "./config";
import {
  canDescend,
  dailyAvailable,
  dailyReward,
  formatNum,
  idleDwellers,
  objectiveLabel,
  objectiveProgress,
  roomCapacity,
  roomStoreCap,
  upgradeCost,
  warChestStoreCap,
} from "./engine";
import { nextUnlock } from "./unlocks";
import type { SectionId, Tab } from "../ui/nav";

/** How urgent the directive is — drives the card's colour and pulse. */
export type GuideTone = "urgent" | "reward" | "action" | "goal";

export interface Directive {
  /** Stable id so the card can animate only on a genuine change. */
  id: string;
  tone: GuideTone;
  /** Imperative, six words or fewer. This is the five-second read. */
  title: string;
  /** One sentence of why, in the game's voice. */
  detail: string;
  /** What the player gets. Always concrete — never "rewards". */
  reward: string;
  /** Button copy. */
  cta: string;
  /** Where the CTA goes. `act` instead means it resolves in place. */
  goTo?: { section: SectionId; tab: Tab };
  /** Named in-place action the host wires up (collect / claimDaily / heal…). */
  act?: "collectAll" | "healAll" | "claimDaily" | "claimRaid" | "openCrate" | "claimObjective";
  /** Payload for `act` when it needs one (objective id). */
  actArg?: string;
  /** Optional progress readout for goal-shaped directives. */
  progress?: { value: number; target: number; unit?: string };
}

const KINGDOM = { section: "kingdom" as SectionId, tab: "kingdom" as Tab };
const DEEP = { section: "kingdom" as SectionId, tab: "stronghold" as Tab };
const LEGION = { section: "legion" as SectionId, tab: "legion" as Tab };
const RAIDS_TO = { section: "battle" as SectionId, tab: "raids" as Tab };
const ARENA = { section: "battle" as SectionId, tab: "arena" as Tab };

/** Where the unlock hints point, so "Dig a War Room" lands on the right screen. */
const UNLOCK_DEST: Record<string, { section: SectionId; tab: Tab }> = {
  raids: DEEP,
  arena: RAIDS_TO,
  codex: RAIDS_TO,
  market: DEEP,
  duels: ARENA,
  worldboss: ARENA,
  realm: RAIDS_TO,
  exchange: DEEP,
};

/**
 * The single most useful thing the player could do right now.
 * Never returns null — there is always a next action, even at end-game.
 */
export function nextDirective(state: GameState, stats: DerivedStats, now: number): Directive {
  /* ---- 1. Urgent: something is actively going wrong ---------------------- */

  if (state.incident) {
    return {
      id: `incident:${state.incident.roomId}`,
      tone: "urgent",
      title: "Put out the fire",
      detail: `${state.incident.label} — that room produces nothing until it's handled.`,
      reward: "Production restored",
      cta: "Go to the Deep Works",
      goTo: DEEP,
    };
  }

  if (stats.woundedCount > 0 && state.salves > 0) {
    return {
      id: "heal",
      tone: "urgent",
      title: `Heal ${stats.woundedCount} wounded`,
      detail:
        stats.woundedCount === 1
          ? "A gladiator is down. Downed fighters can't work, raid, or earn."
          : "Downed gladiators can't work, raid, or earn. Salves fix that.",
      reward: `${stats.woundedCount} back on their feet`,
      cta: "Heal them all",
      act: "healAll",
    };
  }

  if (!stats.fed) {
    return {
      id: "starving",
      tone: "urgent",
      title: "Your legion is starving",
      detail: "Provisions ran dry, so every room is producing at a crawl. Staff the Granary.",
      reward: "Full production speed",
      cta: "Go to the Deep Works",
      goTo: DEEP,
    };
  }

  /* ---- 2. Free money sitting on the table -------------------------------- */

  const readyRooms = state.rooms.filter((r) => roomStoreCap(r) > 0 && r.stored >= 1).length;
  const vaultReady = warChestStoreCap(state) > 0 && state.warChest.stored >= 1;
  const fullRooms = state.rooms.filter(
    (r) => roomStoreCap(r) > 0 && r.stored >= roomStoreCap(r) * 0.98,
  ).length;

  if (fullRooms > 0) {
    return {
      id: "collect-full",
      tone: "urgent",
      title: fullRooms === 1 ? "A room is overflowing" : `${fullRooms} rooms are overflowing`,
      detail: "Full stores stop producing. Every second they sit is coin you aren't earning.",
      reward: "Everything they've stockpiled",
      cta: "Collect all",
      act: "collectAll",
    };
  }

  if (state.activeRaid && now >= state.activeRaid.endsAt) {
    const m = RAIDS.find((r) => r.id === state.activeRaid?.missionId);
    return {
      id: "claim-raid",
      tone: "reward",
      title: "Your squad is home",
      detail: `${m?.name ?? "The raid"} is finished — collect the spoils and the XP.`,
      reward: m ? `🪙 ${formatNum(m.goldReward)} + XP + loot` : "Gold, XP and loot",
      cta: "Claim the spoils",
      act: "claimRaid",
    };
  }

  if (dailyAvailable(state, now)) {
    const r = dailyReward(state, now);
    return {
      id: "daily",
      tone: "reward",
      title: "Claim the daily tribute",
      detail: `Day ${r.streak} of your streak. Miss a day and it resets to one.`,
      reward: `🪙 ${formatNum(r.gold)}${r.lunchboxes > 0 ? ` + ${r.lunchboxes} crate` : ""}`,
      cta: "Claim tribute",
      act: "claimDaily",
    };
  }

  const doneObj = state.objectives.find((o) => objectiveProgress(state, o) >= o.target);
  if (doneObj) {
    return {
      id: `obj-done:${doneObj.id}`,
      tone: "reward",
      title: "Objective complete",
      detail: `${objectiveLabel(doneObj)} — done. Take the crate.`,
      reward: `${doneObj.reward} crate${doneObj.reward > 1 ? "s" : ""}`,
      cta: "Claim reward",
      act: "claimObjective",
      actArg: doneObj.id,
    };
  }

  if (state.lunchboxes > 0) {
    return {
      id: "crate",
      tone: "reward",
      title: `Open ${state.lunchboxes > 1 ? `${state.lunchboxes} crates` : "your crate"}`,
      detail: "Crates hold gladiators, gear and gold. There's no reason to hoard them.",
      reward: "A hero, a relic or a purse",
      cta: "Open a crate",
      act: "openCrate",
    };
  }

  /* ---- 3. The first-session teaching ladder ------------------------------ */

  // Idle bodies + an empty work slot is the single most common new-player stall:
  // they buy gladiators, then wonder why gold isn't moving.
  const idle = idleDwellers(state);
  const openSlot = state.rooms.find((r) => {
    const cap = roomCapacity(r, state);
    return cap > 0 && r.workers.length < cap;
  });
  if (idle.length > 0 && openSlot) {
    const def = ROOMS[openSlot.type];
    return {
      id: `staff:${openSlot.id}`,
      tone: "action",
      title: `Put ${idle.length > 1 ? "them" : "them"} to work`,
      detail: `${idle.length} gladiator${idle.length > 1 ? "s are" : " is"} standing idle while the ${def.name} sits short-staffed.`,
      reward: def.produces ? `More ${def.produces} every second` : "More production",
      cta: `Staff the ${def.name}`,
      goTo: DEEP,
    };
  }

  if (readyRooms > 0 || vaultReady) {
    return {
      id: "collect",
      tone: "action",
      title: "Collect your production",
      detail: "Rooms have stockpiled goods. Tap the world, or take it all at once.",
      reward: "Gold, provisions and salves",
      cta: "Collect all",
      act: "collectAll",
    };
  }

  // A finished raid squad idle with a mission available.
  if (!state.activeRaid) {
    const affordable = RAIDS.filter((m) => stats.might >= m.minMight);
    const best = affordable[affordable.length - 1];
    if (best && idle.length > 0) {
      return {
        id: `raid:${best.id}`,
        tone: "action",
        title: "Send a raid out",
        detail: `${best.description}`,
        reward: `🪙 ${formatNum(best.goldReward)} + XP`,
        cta: `Raid: ${best.name}`,
        goTo: RAIDS_TO,
      };
    }
  }

  /* ---- 4. The next locked system ----------------------------------------- */

  const gate = nextUnlock(state, stats.might);
  if (gate) {
    const dest = UNLOCK_DEST[gate.id] ?? KINGDOM;
    return {
      id: `unlock:${gate.id}`,
      tone: "goal",
      title: gate.hint,
      detail: `Do this and the ${labelOf(gate.id)} opens up.`,
      reward: `Unlocks ${labelOf(gate.id)}`,
      cta: "Show me where",
      goTo: dest,
      progress: unlockProgress(state, stats, gate.id),
    };
  }

  /* ---- 5. Long-horizon goals --------------------------------------------- */

  if (canDescend(state)) {
    return {
      id: "descend",
      tone: "goal",
      title: "Descend deeper",
      detail: "You've taken all this stronghold has. Abandon it and bank permanent Renown.",
      reward: "Permanent output bonus, forever",
      cta: "Open the Deep Works",
      goTo: DEEP,
    };
  }

  const obj = state.objectives[0];
  if (obj) {
    const prog = objectiveProgress(state, obj);
    return {
      id: `obj:${obj.id}`,
      tone: "goal",
      title: objectiveLabel(obj),
      detail: "Your standing objective. Everything you do already counts toward it.",
      reward: `${obj.reward} crate${obj.reward > 1 ? "s" : ""}`,
      cta: "View the legion",
      goTo: LEGION,
      progress: { value: prog, target: obj.target },
    };
  }

  // Absolute fallback: grow the cheapest room. Always true, never a dead end.
  const cheapest = [...state.rooms]
    .filter((r) => r.type !== "warchest")
    .sort((a, b) => upgradeCost(a) - upgradeCost(b))[0];
  return {
    id: "upgrade",
    tone: "goal",
    title: "Grow the deep",
    detail: cheapest
      ? `Upgrade the ${ROOMS[cheapest.type].name} — more levels, more output, more capacity.`
      : "Dig another room and put more gladiators to work.",
    reward: cheapest ? `Higher output for 🪙 ${formatNum(upgradeCost(cheapest))}` : "More production",
    cta: "Open the Deep Works",
    goTo: DEEP,
    progress: { value: state.totalGoldEarned, target: DESCEND_MIN_GOLD, unit: "gold this run" },
  };
}

function labelOf(id: string): string {
  switch (id) {
    case "raids": return "Raids";
    case "arena": return "the Arena";
    case "codex": return "the Codex";
    case "market": return "the Bazaar";
    case "duels": return "Duels";
    case "worldboss": return "the World Boss";
    case "realm": return "Land";
    case "exchange": return "the Exchange";
    default: return id;
  }
}

/** Progress toward an unlock gate, where the gate is a countable threshold. */
function unlockProgress(
  state: GameState,
  stats: DerivedStats,
  id: string,
): Directive["progress"] {
  switch (id) {
    case "arena": return { value: state.totalRaids, target: 1, unit: "raids won" };
    case "market": return { value: state.totalGoldEarned, target: 5_000, unit: "total gold" };
    case "exchange": return { value: state.totalGoldEarned, target: 25_000, unit: "total gold" };
    case "duels": return { value: state.totalBossWins, target: 1, unit: "bosses felled" };
    case "worldboss": return { value: state.totalBossWins, target: 2, unit: "bosses felled" };
    case "realm": return { value: state.totalRaids, target: 3, unit: "raids won" };
    case "codex": return { value: state.gear.length, target: 1, unit: "relics found" };
    default: return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Per-building live status, for the map hotspots.                            */
/* -------------------------------------------------------------------------- */

export type HotspotStatus = "locked" | "ready" | "incident" | "upgrade" | "attention" | "idle";

export interface HotspotState {
  status: HotspotStatus;
  /** Short line shown on the hotspot label, e.g. "3 ready" or "Needs 5,000 gold". */
  note?: string;
  /** Count badge, when there is something to count. */
  count?: number;
}

/**
 * What each kingdom building should be showing right now. Keyed by the building
 * ids in three/kingdom.ts, which are the same as the legacy tab ids.
 */
export function hotspotStates(
  state: GameState,
  stats: DerivedStats,
  isUnlocked: (tab: string) => boolean,
  lockHint: (tab: string) => string,
): Record<string, HotspotState> {
  const out: Record<string, HotspotState> = {};

  const put = (id: string, s: HotspotState) => {
    out[id] = isUnlocked(id) ? s : { status: "locked", note: lockHint(id) };
  };

  // Deep Works — the production hub.
  const ready = state.rooms.filter((r) => roomStoreCap(r) > 0 && r.stored >= 1).length;
  const upgradable = state.rooms.filter(
    (r) => r.type !== "warchest" && state.gold >= upgradeCost(r),
  ).length;
  const idle = idleDwellers(state).length;
  const openSlots = state.rooms.reduce((n, r) => {
    const cap = roomCapacity(r, state);
    return n + (cap > 0 ? Math.max(0, cap - r.workers.length) : 0);
  }, 0);
  put(
    "stronghold",
    state.incident
      ? { status: "incident", note: state.incident.label }
      : ready > 0
        ? { status: "ready", note: `${ready} ready to collect`, count: ready }
        : idle > 0 && openSlots > 0
          ? { status: "attention", note: `${idle} idle · ${openSlots} open slot${openSlots > 1 ? "s" : ""}`, count: idle }
          : upgradable > 0
            ? { status: "upgrade", note: `${upgradable} upgrade${upgradable > 1 ? "s" : ""} affordable`, count: upgradable }
            : { status: "idle", note: `+${stats.goldPerSec.toFixed(1)} gold/s` },
  );

  // Barracks — your gladiators.
  put(
    "legion",
    stats.woundedCount > 0
      ? { status: "incident", note: `${stats.woundedCount} wounded`, count: stats.woundedCount }
      : state.lunchboxes > 0
        ? { status: "ready", note: `${state.lunchboxes} crate${state.lunchboxes > 1 ? "s" : ""} unopened`, count: state.lunchboxes }
        : { status: "idle", note: `${stats.population} gladiators · ${stats.idleCount} idle` },
  );

  // War Room — raids.
  const raidDone = state.activeRaid && Date.now() >= state.activeRaid.endsAt;
  put(
    "raids",
    raidDone
      ? { status: "ready", note: "Squad has returned" }
      : state.activeRaid
        ? { status: "idle", note: "Raid in progress" }
        : { status: "attention", note: "No raid running" },
  );

  // Colosseum — arena + world boss.
  put(
    "arena",
    state.worldBoss.lastReward
      ? { status: "ready", note: "Spoils waiting" }
      : state.pvp.attacksLeft > 0
        ? { status: "attention", note: `${state.pvp.attacksLeft} duels left today`, count: state.pvp.attacksLeft }
        : { status: "idle", note: `${Math.floor(stats.might)} might` },
  );

  // Bazaar — the economy.
  put(
    "market",
    state.mercenaryBoost > 0
      ? { status: "ready", note: "Mercenary boost active" }
      : { status: "idle", note: "Trade on-chain" },
  );

  // Grand Hall — the codex.
  put("codex", { status: "idle", note: `${state.gear.length} relics catalogued` });

  return out;
}
