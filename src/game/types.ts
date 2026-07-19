// Idle Legion — Stronghold model (Fallout-Shelter cutaway × Crypto Dynasty)

/** Aptitude = the SPECIAL-style stat that makes a dweller good at a job. */
export type Aptitude = "labor" | "hunt" | "war";

/** Dweller tiers — a legion's ranks, from fodder to named heroes. */
export type Tier = "recruit" | "spearman" | "archer" | "cavalry" | "champion";

export interface TierDef {
  tier: Tier;
  name: string;
  icon: string;
  aptitude: Aptitude;
  output: number; // base resource/sec when working a room
  might: number; // raid strength
  recruitCost: number; // gold to recruit one
}

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type GearSlot = "weapon" | "armor" | "mount";

/** Catalog definition of a piece of equipment. */
export interface GearDef {
  id: string;
  name: string;
  slot: GearSlot;
  rarity: Rarity;
  img: string;
  might: number; // added to hero might
  output: number; // added to hero room output/sec
}

/** An owned instance of gear. */
export interface GearItem {
  id: string; // unique instance id
  defId: string; // -> GearDef
}

export interface Equipped {
  weapon: string | null; // gear item id
  armor: string | null;
  mount: string | null;
}

export interface Dweller {
  id: string;
  tier: Tier;
  name: string;
  aptitude: Aptitude;
  level: number;
  xp: number;
  roomId: string | null; // assigned room, or null = idle in the Hall
  equipped: Equipped;
}

/** Room types dug into the mountain. */
export type RoomType =
  | "quarters" // Master's Quarters — home of the boss (3D showcase)
  | "hall" // Great Hall — houses idle dwellers, grows population
  | "mine" // Gold Mine — produces gold (labor)
  | "granary" // Granary — produces provisions (hunt)
  | "forge" // Forge — raises legion might (war)
  | "warroom" // War Room — launches raids
  | "warchest"; // Treasury Vault — on-chain War Chest funding room

export interface RoomDef {
  type: RoomType;
  name: string;
  icon: string;
  aptitude: Aptitude | null; // preferred worker aptitude (+25% match bonus)
  produces: "gold" | "provisions" | "might" | null;
  capacityPerLevel: number; // worker slots granted per room level
  storePerLevel: number; // uncollected storage cap per level
  buildCost: number;
  description: string;
  unique?: boolean; // only one may exist (hall, warroom, warchest)
}

export interface Room {
  id: string;
  type: RoomType;
  level: number;
  workers: string[]; // dweller ids assigned here
  stored: number; // accrued, uncollected resource
  lastTick: number;
}

export interface RaidMission {
  id: string;
  name: string;
  icon: string;
  durationSec: number;
  minMight: number;
  goldReward: number;
  description: string;
}

export interface ActiveRaid {
  missionId: string;
  squad: string[]; // dweller ids out on the raid
  startedAt: number;
  endsAt: number;
}

export type IncidentKind = "raiders" | "cavein" | "vermin";

export interface Incident {
  kind: IncidentKind;
  roomId: string;
  label: string;
  endsAt: number; // auto-resolves (dwellers fight it off) by this time
}

export type ObjectiveKind = "gold" | "raids" | "legion" | "might" | "boss";

export interface Objective {
  id: string;
  kind: ObjectiveKind;
  target: number;
  reward: number; // lunchboxes granted
}

export interface BossDef {
  id: string;
  name: string;
  img: string;
  baseHp: number;
  reward: number; // gold on defeat
}

export interface ArenaState {
  bossIndex: number;
  bossHp: number;
  rank: number; // lower is better; starts high
  wins: number;
  lastFightAt: number;
}

/** A gladiator for sale at the surface slave market. */
export interface MarketOffer {
  id: string;
  name: string;
  tier: Tier;
  price: number;
}

export interface GameState {
  gold: number;
  provisions: number;
  rooms: Room[];
  dwellers: Dweller[];
  market: MarketOffer[]; // slave-market stock at the gate
  gear: GearItem[]; // all owned gear instances (equipped + inventory)
  lunchboxes: number; // unopened loot crates
  objectives: Objective[];
  arena: ArenaState;
  activeRaid: ActiveRaid | null;
  incident: Incident | null;
  // On-chain war chest → permanent mercenary production multiplier
  warChestUsd: number;
  mercenaryBoost: number;
  fundedOnchain: boolean;
  lastFundTxId: string | null;
  totalRaids: number;
  totalGoldEarned: number;
  totalBossWins: number;
  lastTick: number;
}

export interface DerivedStats {
  might: number; // total legion might (from dwellers + forge)
  goldPerSec: number; // live gold production across staffed mines
  provisionsPerSec: number; // net provisions (granary output − population upkeep)
  population: number;
  idleCount: number;
  fed: boolean; // provisions > 0 → full output; else penalty
}
