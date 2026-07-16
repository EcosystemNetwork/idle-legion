import type { RaidMission, UnitDef, UnitId } from "./types";

export const UNITS: Record<UnitId, UnitDef> = {
  recruit: {
    id: "recruit",
    name: "Recruit",
    icon: "🪖",
    baseCost: 15,
    gps: 0.5,
    power: 1,
    description: "Cheap fodder. Every legion starts somewhere.",
  },
  spearman: {
    id: "spearman",
    name: "Spearman",
    icon: "🗡️",
    baseCost: 100,
    gps: 3,
    power: 5,
    description: "Front line. Holds the gate.",
  },
  archer: {
    id: "archer",
    name: "Archer",
    icon: "🏹",
    baseCost: 500,
    gps: 12,
    power: 12,
    description: "Rains steel. Softens the charge.",
  },
  cavalry: {
    id: "cavalry",
    name: "Cavalry",
    icon: "🐎",
    baseCost: 2500,
    gps: 50,
    power: 40,
    description: "Fast strike. Breaks flanks.",
  },
  champion: {
    id: "champion",
    name: "Champion",
    icon: "👑",
    baseCost: 12000,
    gps: 200,
    power: 150,
    description: "Named killers. Expensive. Worth it.",
  },
};

export const UNIT_ORDER: UnitId[] = [
  "recruit",
  "spearman",
  "archer",
  "cavalry",
  "champion",
];

export const RAIDS: RaidMission[] = [
  {
    id: "outskirts",
    name: "Outskirts Patrol",
    icon: "🏕️",
    durationSec: 20,
    minPower: 5,
    goldReward: 40,
    description: "Scavenge the village edge.",
  },
  {
    id: "trade_road",
    name: "Trade Road Ambush",
    icon: "🛤️",
    durationSec: 45,
    minPower: 40,
    goldReward: 180,
    description: "Light caravan, heavy coin.",
  },
  {
    id: "fort",
    name: "Hill Fort Siege",
    icon: "🏰",
    durationSec: 90,
    minPower: 150,
    goldReward: 700,
    description: "Crack the walls. Claim the keep.",
  },
  {
    id: "capital",
    name: "Capital Raid",
    icon: "🔥",
    durationSec: 180,
    minPower: 500,
    goldReward: 2800,
    description: "All-in on the prize city.",
  },
];

export const BARRACKS_BASE_CAP = 500;
export const BARRACKS_CAP_PER_LEVEL = 750;
export const BARRACKS_UPGRADE_BASE = 250;

/** On-chain war chest: fund this much USD → permanent mercenary boost tier */
export const MERCENARY_TIERS = [
  { minUsd: 0.1, boost: 0.15, label: "Scout Mercs (+15% GPS)" },
  { minUsd: 0.5, boost: 0.35, label: "Company (+35% GPS)" },
  { minUsd: 1, boost: 0.6, label: "Free Company (+60% GPS)" },
  { minUsd: 5, boost: 1.25, label: "War Host (+125% GPS)" },
];

export const STORAGE_KEY = "idle-legion-v1";
