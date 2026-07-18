import type {
  Aptitude,
  RaidMission,
  RoomDef,
  RoomType,
  Tier,
  TierDef,
} from "./types";

export const STORAGE_KEY = "idle-legion-v2";

export const APTITUDE_LABEL: Record<Aptitude, string> = {
  labor: "Labor",
  hunt: "Hunt",
  war: "War",
};

export const APTITUDE_ICON: Record<Aptitude, string> = {
  labor: "⛏️",
  hunt: "🏹",
  war: "⚔️",
};

/** Dweller tiers — recruit → champion. Each has an aptitude (SPECIAL-style). */
export const TIERS: Record<Tier, TierDef> = {
  recruit: {
    tier: "recruit",
    name: "Recruit",
    icon: "🪖",
    aptitude: "labor",
    output: 0.6,
    might: 1,
    recruitCost: 20,
  },
  spearman: {
    tier: "spearman",
    name: "Spearman",
    icon: "🗡️",
    aptitude: "war",
    output: 2.4,
    might: 6,
    recruitCost: 120,
  },
  archer: {
    tier: "archer",
    name: "Archer",
    icon: "🏹",
    aptitude: "hunt",
    output: 7,
    might: 14,
    recruitCost: 550,
  },
  cavalry: {
    tier: "cavalry",
    name: "Cavalry",
    icon: "🐎",
    aptitude: "labor",
    output: 22,
    might: 44,
    recruitCost: 2600,
  },
  champion: {
    tier: "champion",
    name: "Champion",
    icon: "👑",
    aptitude: "war",
    output: 70,
    might: 170,
    recruitCost: 13000,
  },
};

export const TIER_ORDER: Tier[] = [
  "recruit",
  "spearman",
  "archer",
  "cavalry",
  "champion",
];

/** Room blueprints dug into the mountain. */
export const ROOMS: Record<RoomType, RoomDef> = {
  hall: {
    type: "hall",
    name: "Great Hall",
    icon: "🏛️",
    aptitude: null,
    produces: null,
    capacityPerLevel: 0, // houses dwellers passively; no worker slots
    storePerLevel: 0,
    buildCost: 0,
    description: "Home of the legion. Upgrade to house more dwellers.",
    unique: true,
  },
  mine: {
    type: "mine",
    name: "Gold Mine",
    icon: "⛏️",
    aptitude: "labor",
    produces: "gold",
    capacityPerLevel: 2,
    storePerLevel: 240,
    buildCost: 120,
    description: "Labor dwellers dig gold from the deep veins.",
  },
  granary: {
    type: "granary",
    name: "Granary",
    icon: "🌾",
    aptitude: "hunt",
    produces: "provisions",
    capacityPerLevel: 2,
    storePerLevel: 160,
    buildCost: 200,
    description: "Hunters stock provisions. A hungry legion mines slower.",
  },
  forge: {
    type: "forge",
    name: "War Forge",
    icon: "🔨",
    aptitude: "war",
    produces: "might",
    capacityPerLevel: 2,
    storePerLevel: 0,
    buildCost: 450,
    description: "War dwellers forge arms — passive might for raids.",
  },
  warroom: {
    type: "warroom",
    name: "War Room",
    icon: "🗺️",
    aptitude: "war",
    produces: null,
    capacityPerLevel: 0,
    storePerLevel: 0,
    buildCost: 300,
    description: "Plan raids on the wastes beyond the mountain.",
    unique: true,
  },
  warchest: {
    type: "warchest",
    name: "Treasury Vault",
    icon: "🏦",
    aptitude: null,
    produces: null,
    capacityPerLevel: 0,
    storePerLevel: 0,
    buildCost: 0,
    description:
      "The on-chain vault. Fund it with any-chain assets — Universal Accounts settle USDT on Arbitrum and hire a Free Company.",
    unique: true,
  },
};

/** Rooms the player can dig (hall/warchest are pre-placed). */
export const BUILDABLE: RoomType[] = ["mine", "granary", "forge", "warroom"];

export const RAIDS: RaidMission[] = [
  {
    id: "outskirts",
    name: "Outskirts Patrol",
    icon: "🏕️",
    durationSec: 20,
    minMight: 6,
    goldReward: 90,
    description: "Scavenge the village edge for coin.",
  },
  {
    id: "trade_road",
    name: "Trade Road Ambush",
    icon: "🛤️",
    durationSec: 45,
    minMight: 45,
    goldReward: 380,
    description: "Light caravan, heavy coin.",
  },
  {
    id: "fort",
    name: "Hill Fort Siege",
    icon: "🏰",
    durationSec: 90,
    minMight: 160,
    goldReward: 1500,
    description: "Crack the walls, claim the keep.",
  },
  {
    id: "capital",
    name: "Rival Dynasty Raid",
    icon: "🔥",
    durationSec: 180,
    minMight: 550,
    goldReward: 6200,
    description: "All-in on the prize city.",
  },
];

/** Provisions upkeep per dweller per second. */
export const UPKEEP_PER_DWELLER = 0.05;
/** Production penalty when provisions are exhausted. */
export const STARVING_PENALTY = 0.5;
/** Aptitude-match production bonus. */
export const MATCH_BONUS = 0.25;

/** On-chain war chest: fund this much USD → permanent Free Company boost tier. */
export const MERCENARY_TIERS = [
  { minUsd: 0.1, boost: 0.15, label: "Scout Mercs (+15% output)" },
  { minUsd: 0.5, boost: 0.35, label: "Company (+35% output)" },
  { minUsd: 1, boost: 0.6, label: "Free Company (+60% output)" },
  { minUsd: 5, boost: 1.25, label: "War Host (+125% output)" },
];

const FIRST_NAMES = [
  "Marek", "Bram", "Sigrid", "Talia", "Osric", "Vale", "Doran", "Kest",
  "Yara", "Fenn", "Rurik", "Sable", "Corvin", "Mira", "Halden", "Nyx",
  "Ardo", "Petra", "Gwynn", "Roan", "Ilsa", "Brand", "Vex", "Torin",
];

let nameCursor = Math.floor(Math.random() * FIRST_NAMES.length);
export function randomName(): string {
  const n = FIRST_NAMES[nameCursor % FIRST_NAMES.length];
  nameCursor++;
  return n;
}

// ---------- Art (Kekius Maximus Roman-gladiator set) ----------
// BASE_URL keeps paths correct under the GitHub Pages /idle-legion/ prefix.
const B = import.meta.env.BASE_URL;

export const IMG = {
  hero: `${B}art/portrait-champion.jpg`,
  laurel: `${B}art/emblem-laurel.jpg`,
  cape: `${B}art/cape.jpg`,
  controller: `${B}art/controller.jpg`,
  gold: `${B}art/icon-gold.jpg`,
  provisions: `${B}art/icon-prov.jpg`,
  arena: `${B}art/scene-arena.jpg`,
  chest: `${B}art/room-warchest.jpg`,
};

export const TIER_PORTRAIT: Record<Tier, string> = {
  recruit: `${B}art/portrait-recruit.jpg`,
  spearman: `${B}art/portrait-spearman.jpg`,
  archer: `${B}art/portrait-archer.jpg`,
  cavalry: `${B}art/portrait-cavalry.jpg`,
  champion: `${B}art/portrait-champion.jpg`,
};

export const ROOM_ART: Record<RoomType, string> = {
  hall: `${B}art/room-hall.jpg`,
  mine: `${B}art/room-mine.jpg`,
  granary: `${B}art/room-granary.jpg`,
  forge: `${B}art/room-forge.jpg`,
  warroom: `${B}art/room-warroom.jpg`,
  warchest: `${B}art/room-warchest.jpg`,
};

export const RAID_ART: Record<string, string> = {
  outskirts: `${B}art/raid-outskirts.jpg`,
  trade_road: `${B}art/raid-trade.jpg`,
  fort: `${B}art/raid-fort.jpg`,
  capital: `${B}art/raid-capital.jpg`,
};
