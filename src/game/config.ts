import type {
  Aptitude,
  BossDef,
  GearDef,
  OnchainListing,
  RaidMission,
  Rarity,
  RoomDef,
  RoomType,
  Tier,
  TierDef,
} from "./types";
import { CATALOG_GEAR, CATALOG_LISTINGS } from "./assets";

export const STORAGE_KEY = "idle-legion-v5";

/** Salt for the save-integrity signature (deters casual localStorage edits). */
export const SAVE_SALT = "kekius-rose-from-the-mempool";

// ---------- Offline earnings (the "while you were away" hook) ----------
/** Only summarise absences longer than this (seconds). */
export const OFFLINE_MIN_SEC = 60;
/** Cap credited offline time — 8 hours of a good night's dig. */
export const OFFLINE_CAP_SEC = 8 * 3600;
/** Offline runs at reduced efficiency vs. an open, tended stronghold. */
export const OFFLINE_EFFICIENCY = 0.5;

// ---------- Prestige — "Descend deeper" ----------
/** Lifetime gold (this run) needed before the first descent is offered. */
export const DESCEND_MIN_GOLD = 25_000;
/** Renown = sqrt(runGold / divisor) + bossWins * perBoss. */
export const RENOWN_GOLD_DIVISOR = 4_000;
export const RENOWN_PER_BOSS = 2;
/** Each point of banked Renown adds this to the global output multiplier. */
export const RENOWN_BOOST_PER = 0.03; // +3% output per Renown

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
  quarters: {
    type: "quarters",
    name: "Master's Quarters",
    icon: "👑",
    aptitude: null,
    produces: null,
    capacityPerLevel: 0,
    storePerLevel: 0,
    buildCost: 0,
    description: "Home of the Master — your boss gladiator holds court here.",
    unique: true,
  },
  hall: {
    type: "hall",
    name: "Great Hall",
    icon: "🏛️",
    aptitude: null,
    produces: null,
    capacityPerLevel: 0, // houses dwellers passively; no worker slots
    storePerLevel: 0,
    buildCost: 0,
    description: "Heart of the deep — where off-duty gladiators sleep, eat, and cope. Upgrade to fit a bigger legion.",
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
    description: "Labor-hands chip sestertii from the deep veins. Some still glow with pre-Rug value.",
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
    description: "Hunters stock grain & hopium. A fed legion mines hard; a starving one posts through it at half-speed.",
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
    description: "War-hands beat scrap into arms — raw might, the number that decides if a raid comes home rich or in a bag.",
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
    description: "Plan raids on the Wastes — a dusty map, red string, and one guy insisting the top is in.",
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
      "The one chamber that still touches the old Chains. The Universal Account reaches any Chain — no bridge — and lands USDT on Arbitrum to hire a Free Company.",
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
    description: "Scavenge the village edge for loose coin. Even recruits GMI here.",
  },
  {
    id: "trade_road",
    name: "Trade Road Ambush",
    icon: "🛤️",
    durationSec: 45,
    minMight: 45,
    goldReward: 380,
    description: "Light caravan down the old trade road, carrying heavy bags. Hit it.",
  },
  {
    id: "fort",
    name: "Hill Fort Siege",
    icon: "🏰",
    durationSec: 90,
    minMight: 160,
    goldReward: 1500,
    description: "Crack a warlord's walls, empty his cold storage. Needs real might.",
  },
  {
    id: "capital",
    name: "Rival Dynasty Raid",
    icon: "🔥",
    durationSec: 180,
    minMight: 550,
    goldReward: 6200,
    description: "All-in on a whale's prize city. This is the send — diamond hands only.",
  },
];

/** Provisions upkeep per dweller per second. */
export const UPKEEP_PER_DWELLER = 0.05;
/** Production penalty when provisions are exhausted. */
export const STARVING_PENALTY = 0.5;
/** Aptitude-match production bonus. */
export const MATCH_BONUS = 0.25;

// ---------- XP & leveling (the dopamine loop) ----------
/** XP a working dweller earns every second on the job (bars visibly creep). */
export const PASSIVE_XP_PER_SEC = 0.6;
/** XP burst when you collect a room the dweller worked. */
export const XP_COLLECT = 8;
/** XP each raider earns on a successful raid. */
export const XP_RAID = 40;
/** XP the arena squad earns per fight — and the bonus when the boss drops. */
export const XP_FIGHT = 14;
export const XP_FIGHT_KILL = 60;
/** XP needed to go from level L to L+1. */
export function xpForLevel(level: number): number {
  return level * 100;
}
/** Every Nth level is a milestone — bigger celebration + a lunchbox. */
export const MILESTONE_EVERY = 5;
/** Output/might each level adds (surfaced in the hero sheet so it's felt). */
export const OUTPUT_PER_LEVEL = 0.12;
export const MIGHT_PER_LEVEL = 0.1;

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

export const KEKIUS_MODEL = `${B}art/kekius-boss.glb`;

// Cohesive art kit (sliced from Rex's sheets) — the Gladiator Frog Empire look.
export const KIT = {
  mapIso: `${B}art/kit/map-iso.png`,
  wheel: `${B}art/kit/map-wheel.png`,
  res: {
    gold: `${B}art/kit/res-gold.png`,
    provisions: `${B}art/kit/res-provisions.png`,
    stamina: `${B}art/kit/res-stamina.png`,
    crystal: `${B}art/kit/res-crystal.png`,
    lunchbox: `${B}art/kit/res-lunchbox.png`,
  },
  bld: {
    warhall: `${B}art/kit/bld-warhall.png`,
    colosseum: `${B}art/kit/bld-colosseum.png`,
    hunt: `${B}art/kit/bld-hunt.png`,
    treasury: `${B}art/kit/bld-treasury.png`,
    mine: `${B}art/kit/bld-mine.png`,
    throne: `${B}art/kit/bld-throne.png`,
    forge: `${B}art/kit/bld-forge.png`,
    granary: `${B}art/kit/bld-granary.png`,
    garden: `${B}art/kit/bld-garden.png`,
    alchemy: `${B}art/kit/bld-alchemy.png`,
  },
  prof: {
    mining: `${B}art/kit/prof-mining.png`,
    hunting: `${B}art/kit/prof-hunting.png`,
    war: `${B}art/kit/prof-war.png`,
    foraging: `${B}art/kit/prof-foraging.png`,
  },
  tex: {
    floor: `${B}art/kit/tex-floor.png`,
    wall: `${B}art/kit/tex-wall.png`,
    wood: `${B}art/kit/tex-wood.png`,
  },
};

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
  quarters: `${B}art/boss-kekius.jpg`,
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

export const CRATE_IMG = `${B}art/crate.jpg`;
export const CRATE_RARE_IMG = `${B}art/crate-rare.jpg`;

// ---------- Rarity ----------
export const RARITY_META: Record<
  Rarity,
  { name: string; color: string; stars: number; weight: number }
> = {
  common: { name: "Common", color: "#9aa6b2", stars: 1, weight: 44 },
  uncommon: { name: "Uncommon", color: "#5fe38a", stars: 2, weight: 30 },
  rare: { name: "Rare", color: "#4aa8ff", stars: 3, weight: 16 },
  epic: { name: "Epic", color: "#b072ff", stars: 4, weight: 8 },
  legendary: { name: "Legendary", color: "#ffc233", stars: 5, weight: 2 },
};

// ---------- Equipment catalog (Crypto Dynasty gear) ----------
/** Hand-authored core gear. The classified art set (CATALOG_GEAR) is appended below. */
const CORE_GEAR: GearDef[] = [
  // weapons
  { id: "w_dagger", name: "Rusted Dagger", slot: "weapon", rarity: "common", img: `${B}art/gear-w-dagger.jpg`, might: 4, output: 0 },
  { id: "w_trident", name: "Retiarius Trident", slot: "weapon", rarity: "rare", img: `${B}art/gear-w-trident.jpg`, might: 12, output: 0 },
  { id: "w_crossed", name: "Twin Gladii", slot: "weapon", rarity: "epic", img: `${B}art/gear-w-crossed.jpg`, might: 20, output: 1 },
  { id: "w_blades", name: "Emberforged Blades", slot: "weapon", rarity: "legendary", img: `${B}art/gear-w-blades.jpg`, might: 36, output: 2 },
  // armor
  { id: "a_leather", name: "Tattered Leather", slot: "armor", rarity: "common", img: `${B}art/gear-a-leather.jpg`, might: 3, output: 1 },
  { id: "a_cuirass", name: "Legionary Cuirass", slot: "armor", rarity: "uncommon", img: `${B}art/gear-a-cuirass.jpg`, might: 6, output: 1 },
  { id: "a_manicae", name: "Manicae Guards", slot: "armor", rarity: "uncommon", img: `${B}art/gear-a-manicae.jpg`, might: 5, output: 2 },
  { id: "a_dima", name: "Dimachaerus Plate", slot: "armor", rarity: "rare", img: `${B}art/gear-a-dimachaerus.jpg`, might: 10, output: 2 },
  { id: "a_ornate", name: "Imperial Cuirass", slot: "armor", rarity: "epic", img: `${B}art/gear-a-ornate.jpg`, might: 16, output: 3 },
  { id: "a_kekius", name: "Kekius Maximus Aegis", slot: "armor", rarity: "legendary", img: `${B}art/gear-a-kekius.jpg`, might: 28, output: 4 },
  // mounts
  { id: "m_mule", name: "Pack Mule", slot: "mount", rarity: "uncommon", img: `${B}art/gear-m-mule.jpg`, might: 4, output: 3 },
];

/** Full gear pool: hand-authored core + the classified art set (weapons/armor/accessories/mounts). */
export const GEAR_CATALOG: GearDef[] = [...CORE_GEAR, ...CATALOG_GEAR];

export const GEAR_BY_ID: Record<string, GearDef> = Object.fromEntries(
  GEAR_CATALOG.map((g) => [g.id, g]),
);

// ---------- Arena bosses (Crypto Dynasty World Boss) ----------
export const BOSSES: BossDef[] = [
  { id: "caged", name: "The Caged Beast", img: `${B}art/boss-caged.jpg`, baseHp: 600, reward: 800 },
  { id: "chariot", name: "Rival Dynasty Charioteer", img: `${B}art/boss-chariot.jpg`, baseHp: 2600, reward: 3400 },
  { id: "kekius", name: "Kekius the Tyrant — the dark timeline", img: `${B}art/boss-kekius.jpg`, baseHp: 9000, reward: 14000, model: KEKIUS_MODEL },
];

export const FIGHT_COOLDOWN_MS = 6000;

// ---------- On-chain marketplace (settled via Universal Accounts → Arbitrum USDT) ----------
/** Hand-authored featured listings; the classified art set (CATALOG_LISTINGS) is appended. */
const CORE_LISTINGS: OnchainListing[] = [
  { id: "l_champ", kind: "hero", label: "Kekius Reborn", sub: "Legendary Champion gladiator", img: `${B}art/portrait-champion.jpg`, priceUsd: 0.3, rarity: "legendary", tier: "champion" },
  { id: "l_cav", kind: "hero", label: "Steppe Raider", sub: "Epic Cavalry gladiator", img: `${B}art/portrait-cavalry.jpg`, priceUsd: 0.1, rarity: "epic", tier: "cavalry" },
  { id: "l_blades", kind: "gear", label: "Emberforged Blades", sub: "Legendary weapon · +36 ⚔", img: `${B}art/gear-w-blades.jpg`, priceUsd: 0.2, rarity: "legendary", defId: "w_blades" },
  { id: "l_aegis", kind: "gear", label: "Kekius Maximus Aegis", sub: "Legendary armor · +28 ⚔", img: `${B}art/gear-a-kekius.jpg`, priceUsd: 0.25, rarity: "legendary", defId: "a_kekius" },
  { id: "l_company", kind: "boost", label: "Free Company Contract", sub: "Permanent boost to every room", img: `${B}art/controller.jpg`, priceUsd: 0.5, rarity: "epic" },
];

/** Featured listings + every epic/legendary piece from the classified art set. */
export const ONCHAIN_LISTINGS: OnchainListing[] = [...CORE_LISTINGS, ...CATALOG_LISTINGS];

/** Gold a piece of gear fetches when sold back to the market. */
export const GEAR_SELL_VALUE: Record<Rarity, number> = {
  common: 30,
  uncommon: 80,
  rare: 220,
  epic: 520,
  legendary: 1200,
};
