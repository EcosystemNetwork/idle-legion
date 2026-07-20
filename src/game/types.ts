// Idle Legion — Stronghold model (Fallout-Shelter cutaway × Crypto Dynasty)

/** Aptitude = the SPECIAL-style stat that makes a dweller good at a job. */
export type Aptitude = "labor" | "hunt" | "war";

/**
 * Combat class — a rock-paper-scissors triangle (Crypto Dynasty style):
 * melee ▶ ranged ▶ charge ▶ melee. Every fighter and every enemy has one, so
 * squad composition vs. the enemy's class is a real decision, not just a sum.
 */
export type CombatClass = "melee" | "ranged" | "charge";

/** Dweller tiers — a legion's ranks, from fodder to named heroes. */
export type Tier = "recruit" | "spearman" | "archer" | "cavalry" | "champion";

export interface TierDef {
  tier: Tier;
  name: string;
  icon: string;
  aptitude: Aptitude;
  combatClass: CombatClass; // rock-paper-scissors role in the arena/raids
  output: number; // base resource/sec when working a room
  might: number; // raid strength
  hp: number; // base health (scales with level)
  recruitCost: number; // gold to recruit one
}

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type GearSlot = "weapon" | "armor" | "mount";

/**
 * A single expressed/carried trait pair — the atom of the summoning genome.
 * Dominant traits are what the hero *is*; recessives are carried silently and
 * can surface in children (DeFi-Kingdoms "gene sniping").
 */
export interface Gene {
  aptitude: Aptitude;
  combatClass: CombatClass;
}

/** Dual-genome: one expressed dominant gene + up to 3 carried recessives. */
export interface Genome {
  dominant: Gene;
  recessive: Gene[];
}

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
  level?: number; // upgrade level (0 = base). Each level scales might/output.
  onchain?: boolean; // bought on-chain → survives a Descend (real money is permanent)
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
  hp: number; // current health; 0 = downed (see `downed`)
  stamina: number; // current stamina; raids/arena spend it, rest regens it
  downed?: boolean; // incapacitated (hp hit 0) — can't work or fight until healed
  onchain?: boolean; // acquired on-chain → survives a Descend
  // ----- genetics & summoning (DeFi-Kingdoms lineage) -----
  gen?: number; // generation (0 = founder minted, not summoned)
  summonsLeft?: number; // remaining times this hero can be summoned with
  summonReadyAt?: number; // fatigue: earliest ms this hero can summon again
  genome?: Genome; // dominant + recessive genes passed to children
  roomId: string | null; // assigned room, or null = idle in the Hall
  equipped: Equipped;
}

/** Room types dug into the mountain. */
export type RoomType =
  | "quarters" // Master's Quarters — home of the boss (3D showcase)
  | "hall" // Great Hall — houses idle dwellers, grows population
  | "mine" // Gold Mine — produces gold (labor)
  | "granary" // Granary — produces provisions (hunt)
  | "infirmary" // Infirmary — produces salves (heals wounded/downed legion)
  | "forge" // Forge — raises legion might (war)
  | "warroom" // War Room — launches raids
  | "portal" // Summoning Portal — breed two heroes into a new-blood gladiator
  | "warchest"; // Treasury Vault — on-chain War Chest funding room (yields gold)

/** Everything a room can pump out. `salves` heal the wounded (Fallout-Shelter medbay). */
export type Produces = "gold" | "provisions" | "might" | "salves" | null;

export interface RoomDef {
  type: RoomType;
  name: string;
  icon: string;
  aptitude: Aptitude | null; // preferred worker aptitude (+25% match bonus)
  produces: Produces;
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
  /** When this room was last rushed — gates the rush cooldown. */
  rushAt?: number;
}

export interface RaidMission {
  id: string;
  name: string;
  icon: string;
  durationSec: number;
  minMight: number;
  goldReward: number;
  enemyClass: CombatClass; // what the Wastes throw at you — class-counter it for a bonus
  danger: number; // 0..1 wound severity — how bloody this raid gets
  description: string;
}

/** One line in a raid's after-action report — the Fallout-Shelter exploration log. */
export interface RaidLogEntry {
  t: number; // seconds into the raid this happened
  icon: string;
  text: string;
  tone: "loot" | "fight" | "wound" | "flavor"; // drives the colour in the feed
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

export type ObjectiveKind =
  | "gold"
  | "raids"
  | "legion"
  | "might"
  | "boss"
  | "upgrade" // upgrade gear N times
  | "heal"; // heal N wounds

export interface Objective {
  id: string;
  kind: ObjectiveKind;
  target: number;
  reward: number; // lunchboxes granted
  /**
   * How many times this slot has been completed. Drives the difficulty ramp —
   * without it the target never escalated, so once your lifetime counters passed
   * the fixed goal every claim handed out a free crate.
   */
  tier: number;
}

export interface BossDef {
  id: string;
  name: string;
  img: string;
  baseHp: number;
  reward: number; // gold on defeat
  enemyClass: CombatClass; // counter it with the right squad classes for bonus damage
  bite: number; // 0..1 how hard the boss hits back — wounds your squad each fight
  /** Optional animated 3D model (GLB). When set, the Arena renders it live. */
  model?: string;
}

/** A listing on the on-chain Bazaar (settled via Universal Accounts → Arbitrum USDT). */
export interface OnchainListing {
  id: string;
  kind: "hero" | "gear" | "boost";
  label: string;
  sub: string;
  img: string;
  priceUsd: number;
  rarity: Rarity;
  tier?: Tier;
  defId?: string;
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

/** A gladiator crossed one or more levels — the UI turns this into a celebration. */
export interface LevelUpEvent {
  id: string; // unique event id (React key)
  dwellerId: string;
  name: string;
  tier: Tier;
  from: number; // level before
  to: number; // level after
  milestone: boolean; // crossed a milestone level (every 5)
  reward: number; // lunchboxes granted by milestone(s) in this jump
}

/** Summary of what the legion produced while the tab was closed. */
export interface OfflineSummary {
  seconds: number; // time away (capped)
  gold: number;
  provisions: number; // net (can be negative if the legion starved)
  salves: number; // net salves the Infirmary stocked
  recruits: number; // dwellers the Great Hall raised while away
}

/** Daily-login streak reward — the "come back tomorrow" retention hook. */
export interface DailyState {
  lastClaimDay: number; // epoch-day index of the last claim (0 = never)
  streak: number; // consecutive days claimed
  /** Wall-clock ms of the last claim — enforces a real gap, not just a day flip. */
  lastClaimAt?: number;
}

/** The on-chain Treasury Vault: staked USD keeps yielding gold, run after run. */
export interface WarChestState {
  stored: number; // accrued, uncollected yield gold
  totalYielded: number; // lifetime yield (for the vault readout)
  lastTick: number;
}

/** The after-action report from the most recent raid (shown once, on claim). */
export interface RaidReport {
  missionId: string;
  missionName: string;
  gold: number;
  xp: number;
  classEdge: number; // squad's class multiplier vs. the raid's enemy class
  wounded: string[]; // names of fighters who came back bloodied
  downed: string[]; // names of fighters carried home unconscious
  killed: string[]; // names of fighters who did NOT come home
  log: RaidLogEntry[];
}

// ---------- DEX / multi-token economy (DeFi-Kingdoms style) ----------

/** Constant-product AMM pool: gold ⇄ $LEGION (k = poolGold × poolLegion). */
export interface DexState {
  poolGold: number;
  poolLegion: number;
}

/** The Bank: stake $LEGION for real-yield emissions with a withdrawal-fee decay. */
export interface BankState {
  staked: number; // $LEGION staked
  stakedAt: number; // ms of the last stake (drives the withdrawal-fee decay)
  accrued: number; // unclaimed $LEGION yield
  lastTick: number;
}

// ---------- Land / territories (scarce yield-bearing parcels) ----------

export type LandKind = "gold" | "provisions" | "salves" | "legion" | "might";

export interface LandPlot {
  id: string;
  kind: LandKind;
  level: number;
}

// ---------- Shared World Boss (simulated co-op raid + leaderboard) ----------

/** A rival legion contributing damage to the shared boss (seeded, client-sim). */
export interface WorldBossRival {
  name: string;
  power: number; // damage per second this legion pours in
  contributed: number; // running total this cycle
}

export interface WorldBossState {
  tier: number; // escalates each defeat
  hp: number;
  maxHp: number;
  endsAt: number; // weekly cycle deadline
  contributed: number; // the player's damage this cycle
  lastHitAt: number; // cooldown gate on the player's strikes
  rivals: WorldBossRival[];
  week: number; // cycle counter
  lastReward: WorldBossReward | null; // pending payout banner for the UI
}

export interface WorldBossReward {
  rank: number;
  field: number; // how many legions were on the board
  gold: number;
  legion: number;
  lunchboxes: number;
  bossName: string;
}

// ---------- PvP ladder (simulated ranked duels) ----------

export interface PvpState {
  rating: number; // ELO-ish; drives rank + opponent strength
  wins: number;
  losses: number;
  streak: number;
  attacksLeft: number; // daily energy on duels
  lastReset: number; // epoch-day of the last attack refill
  lastResult: DuelResult | null; // pending duel outcome for the UI
}

export interface DuelResult {
  won: boolean;
  oppName: string;
  ratingDelta: number;
  gold: number;
  legion: number;
  classEdge: number;
  yourPower: number;
  oppPower: number;
}

export interface GameState {
  gold: number;
  provisions: number;
  salves: number; // healing stock — spent to mend wounded/downed legion
  legion: number; // $LEGION — the ecosystem token (DEX / bank / summon / land)
  dex: DexState;
  bank: BankState;
  land: LandPlot[];
  worldBoss: WorldBossState;
  pvp: PvpState;
  rooms: Room[];
  dwellers: Dweller[];
  market: MarketOffer[]; // slave-market stock at the gate
  gear: GearItem[]; // all owned gear instances (equipped + inventory)
  lunchboxes: number; // unopened loot crates
  objectives: Objective[];
  arena: ArenaState;
  activeRaid: ActiveRaid | null;
  incident: Incident | null;
  squad: string[]; // dweller ids hand-picked for raids/arena (empty = send all idle)
  // On-chain war chest → permanent mercenary production multiplier + yield vault
  warChestUsd: number;
  mercenaryBoost: number;
  warChest: WarChestState; // the staked-USD gold yield vault
  fundedOnchain: boolean;
  lastFundTxId: string | null;
  // Prestige — "Descend deeper": bank Renown for a permanent, run-spanning boost
  renown: number; // banked prestige currency (survives descents)
  descents: number; // times the legion has abandoned a stronghold to dig deeper
  daily: DailyState; // login-streak reward
  offlineSummary: OfflineSummary | null; // pending "while you were away" report
  raidReport: RaidReport | null; // pending after-action report for the UI
  levelUps: LevelUpEvent[]; // pending level-up celebrations for the UI to drain
  totalRaids: number;
  totalGoldEarned: number;
  totalBossWins: number;
  totalGearUpgrades: number; // lifetime gear upgrades (objective tracking)
  totalHeals: number; // lifetime wounds healed (objective tracking)
  lastTick: number;
}

export interface DerivedStats {
  might: number; // total legion might (from dwellers + forge + land)
  goldPerSec: number; // live gold production across staffed mines + vault + land
  provisionsPerSec: number; // net provisions (granary output − population upkeep)
  salvesPerSec: number; // net salves (infirmary + land)
  legionPerSec: number; // $LEGION produced by land + bank yield
  population: number;
  idleCount: number;
  woundedCount: number; // dwellers below full health (incl. downed)
  fed: boolean; // provisions > 0 → full output; else penalty
}
