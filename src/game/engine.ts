import {
  BARRACKS_BASE_CAP,
  BARRACKS_CAP_PER_LEVEL,
  BARRACKS_UPGRADE_BASE,
  MERCENARY_TIERS,
  RAIDS,
  STORAGE_KEY,
  UNITS,
  UNIT_ORDER,
} from "./config";
import type { DerivedStats, GameState, UnitId } from "./types";

export function createInitialState(now = Date.now()): GameState {
  return {
    gold: 25,
    prestige: 0,
    units: {
      recruit: 1,
      spearman: 0,
      archer: 0,
      cavalry: 0,
      champion: 0,
    },
    barracksLevel: 1,
    warChestUsd: 0,
    mercenaryBoost: 0,
    lastTick: now,
    activeRaid: null,
    totalRaids: 0,
    totalGoldEarned: 0,
    fundedOnchain: false,
    lastFundTxId: null,
  };
}

export function unitCost(id: UnitId, owned: number): number {
  const base = UNITS[id].baseCost;
  return Math.floor(base * Math.pow(1.15, owned));
}

export function barracksUpgradeCost(level: number): number {
  return Math.floor(BARRACKS_UPGRADE_BASE * Math.pow(1.65, level - 1));
}

export function deriveStats(state: GameState): DerivedStats {
  let rawGps = 0;
  let power = 0;
  for (const id of UNIT_ORDER) {
    const count = state.units[id];
    rawGps += UNITS[id].gps * count;
    power += UNITS[id].power * count;
  }
  const gps = rawGps * (1 + state.mercenaryBoost);
  const goldCap =
    BARRACKS_BASE_CAP + BARRACKS_CAP_PER_LEVEL * state.barracksLevel;
  return { gps, power, goldCap };
}

export function tick(state: GameState, now = Date.now()): GameState {
  const elapsed = Math.max(0, (now - state.lastTick) / 1000);
  if (elapsed <= 0) return state;

  const { gps, goldCap } = deriveStats(state);
  const room = Math.max(0, goldCap - state.gold);
  const earned = Math.min(room, gps * elapsed);

  let next: GameState = {
    ...state,
    gold: state.gold + earned,
    totalGoldEarned: state.totalGoldEarned + earned,
    lastTick: now,
  };

  // Auto-complete raid when timer ends (claimable via claimRaid)
  return next;
}

export function buyUnit(state: GameState, id: UnitId): GameState {
  const cost = unitCost(id, state.units[id]);
  if (state.gold < cost) throw new Error("Not enough gold");
  return {
    ...state,
    gold: state.gold - cost,
    units: { ...state.units, [id]: state.units[id] + 1 },
  };
}

export function upgradeBarracks(state: GameState): GameState {
  const cost = barracksUpgradeCost(state.barracksLevel);
  if (state.gold < cost) throw new Error("Not enough gold");
  return {
    ...state,
    gold: state.gold - cost,
    barracksLevel: state.barracksLevel + 1,
  };
}

export function startRaid(state: GameState, missionId: string, now = Date.now()): GameState {
  if (state.activeRaid) throw new Error("Raid already in progress");
  const mission = RAIDS.find((r) => r.id === missionId);
  if (!mission) throw new Error("Unknown mission");
  const { power } = deriveStats(state);
  if (power < mission.minPower) {
    throw new Error(`Need ${mission.minPower} power (you have ${Math.floor(power)})`);
  }
  return {
    ...state,
    activeRaid: {
      missionId,
      startedAt: now,
      endsAt: now + mission.durationSec * 1000,
    },
  };
}

export function claimRaid(state: GameState, now = Date.now()): GameState {
  if (!state.activeRaid) throw new Error("No active raid");
  if (now < state.activeRaid.endsAt) throw new Error("Raid still running");
  const mission = RAIDS.find((r) => r.id === state.activeRaid!.missionId);
  if (!mission) throw new Error("Unknown mission");
  const { goldCap } = deriveStats(state);
  const reward = mission.goldReward * (1 + state.mercenaryBoost * 0.5);
  const gold = Math.min(goldCap, state.gold + reward);
  return {
    ...state,
    gold,
    totalGoldEarned: state.totalGoldEarned + reward,
    totalRaids: state.totalRaids + 1,
    prestige: state.prestige + Math.floor(reward / 10),
    activeRaid: null,
  };
}

export function applyWarChestFunding(
  state: GameState,
  amountUsd: number,
  txId: string | null,
): GameState {
  const warChestUsd = state.warChestUsd + amountUsd;
  let boost = state.mercenaryBoost;
  for (const tier of MERCENARY_TIERS) {
    if (warChestUsd >= tier.minUsd) {
      boost = Math.max(boost, tier.boost);
    }
  }
  return {
    ...state,
    warChestUsd,
    mercenaryBoost: boost,
    fundedOnchain: true,
    lastFundTxId: txId ?? state.lastFundTxId,
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as GameState;
    return tick({ ...createInitialState(), ...parsed }, Date.now());
  } catch {
    return createInitialState();
  }
}

export function saveState(state: GameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function formatGold(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(n < 10 ? 1 : 0);
}
