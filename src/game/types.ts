export type UnitId = "recruit" | "spearman" | "archer" | "cavalry" | "champion";

export interface UnitDef {
  id: UnitId;
  name: string;
  icon: string;
  baseCost: number;
  gps: number; // gold per second per unit
  power: number;
  description: string;
}

export interface RaidMission {
  id: string;
  name: string;
  icon: string;
  durationSec: number;
  minPower: number;
  goldReward: number;
  description: string;
}

export interface ActiveRaid {
  missionId: string;
  startedAt: number;
  endsAt: number;
}

export interface GameState {
  gold: number;
  prestige: number;
  units: Record<UnitId, number>;
  barracksLevel: number;
  warChestUsd: number;
  mercenaryBoost: number; // permanent GPS multiplier from on-chain funding
  lastTick: number;
  activeRaid: ActiveRaid | null;
  totalRaids: number;
  totalGoldEarned: number;
  fundedOnchain: boolean;
  lastFundTxId: string | null;
}

export interface DerivedStats {
  gps: number;
  power: number;
  goldCap: number;
}
