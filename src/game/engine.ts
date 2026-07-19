import {
  APTITUDE_LABEL,
  BANK_FEE_SCHEDULE,
  BANK_YIELD_PER_SEC,
  BOSSES,
  CLASS_ADVANTAGE,
  CLASS_BEATS,
  CLASS_DISADVANTAGE,
  DEX_FEE,
  DEX_SEED_GOLD,
  DEX_SEED_LEGION,
  GEN0_SUMMONS,
  LAND_CLAIM_BASE_LEGION,
  LAND_MIN_MIGHT,
  LAND_SLOTS,
  LAND_UPGRADE_BASE_GOLD,
  LAND_YIELD,
  PVP_DAILY_ATTACKS,
  PVP_K,
  PVP_OPP_COUNT,
  PVP_RANK_NAMES,
  PVP_START_RATING,
  PVP_WIN_GOLD,
  PVP_WIN_LEGION,
  SUMMON_BASE_GOLD,
  SUMMON_BASE_LEGION,
  SUMMON_COOLDOWN_BASE_MS,
  SUMMON_COOLDOWN_GROWTH_MS,
  SUMMON_GOLD_PER_GEN,
  SUMMON_LEGION_PER_SUMMON,
  SUMMON_MUTATE_UP,
  SUMMON_RECESSIVE_SURFACE,
  MAX_RECESSIVE,
  WB_BASE_HP,
  WB_HP_GROWTH,
  WB_HIT_COOLDOWN_MS,
  WB_NAMES,
  WB_PARTICIPATION,
  WB_RANK_REWARDS,
  WB_RIVAL_COUNT,
  WB_RIVAL_NAMES,
  WB_STAMINA_PER_HIT,
  WB_WEEK_MS,
  DAILY_GOLD_BASE,
  DAILY_GOLD_PER_STREAK,
  DAILY_GRACE_DAYS,
  DAILY_LUNCHBOX_EVERY,
  FIGHT_COOLDOWN_MS,
  FUSION_LEVELS,
  GEAR_BY_ID,
  GEAR_CATALOG,
  GEAR_MAX_LEVEL,
  GEAR_SELL_VALUE,
  GEAR_UPGRADE_BASE,
  GEAR_UPGRADE_PER_LEVEL,
  HP_PER_LEVEL,
  MATCH_BONUS,
  MAX_STAMINA,
  MERCENARY_TIERS,
  RAIDS,
  RARITY_META,
  REVIVE_SALVE_MULT,
  ROOMS,
  SALVES_PER_FULL_HEAL,
  STAMINA_PER_FIGHT,
  STAMINA_PER_RAID,
  STAMINA_REGEN_IDLE,
  STAMINA_REGEN_WORKING,
  STARVING_PENALTY,
  STORAGE_KEY,
  TIERS,
  TIER_ORDER,
  UPKEEP_PER_DWELLER,
  DESCEND_MIN_GOLD,
  OFFLINE_CAP_SEC,
  OFFLINE_EFFICIENCY,
  OFFLINE_MIN_SEC,
  RENOWN_BOOST_PER,
  RENOWN_GOLD_DIVISOR,
  RENOWN_PER_BOSS,
  SAVE_SALT,
  MILESTONE_EVERY,
  MIGHT_PER_LEVEL,
  OUTPUT_PER_LEVEL,
  PASSIVE_XP_PER_SEC,
  WARCHEST_STORE_PER_USD,
  WARCHEST_YIELD_PER_USD,
  XP_COLLECT,
  XP_FIGHT,
  XP_FIGHT_KILL,
  XP_RAID,
  xpForLevel,
  randomName,
} from "./config";
import type {
  CombatClass,
  Dweller,
  DerivedStats,
  GameState,
  GearDef,
  GearItem,
  GearSlot,
  IncidentKind,
  LevelUpEvent,
  MarketOffer,
  Objective,
  ObjectiveKind,
  RaidLogEntry,
  RaidMission,
  RaidReport,
  Rarity,
  Room,
  RoomType,
  Tier,
} from "./types";

let idCounter = 0;
function uid(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`;
}

/** Max HP for a dweller — tier base scaled by level (survivability grind). */
export function dwellerMaxHp(d: Dweller): number {
  return Math.round(TIERS[d.tier].hp * (1 + HP_PER_LEVEL * (d.level - 1)));
}

/** 0..1 health fraction, for the red HP bar. */
export function hpFrac(d: Dweller): number {
  const max = dwellerMaxHp(d);
  return max > 0 ? Math.max(0, Math.min(1, d.hp / max)) : 0;
}

/** 0..1 stamina fraction, for the energy bar. */
export function staminaFrac(d: Dweller): number {
  return Math.max(0, Math.min(1, d.stamina / MAX_STAMINA));
}

/** Combat class of a dweller (from its tier). */
export function dwellerClass(d: Dweller): CombatClass {
  return TIERS[d.tier].combatClass;
}

export function makeDweller(tier: Tier): Dweller {
  const def = TIERS[tier];
  const base: Dweller = {
    id: uid("d"),
    tier,
    name: randomName(),
    aptitude: def.aptitude,
    level: 1,
    xp: 0,
    hp: 0,
    stamina: MAX_STAMINA,
    roomId: null,
    equipped: { weapon: null, armor: null, mount: null },
  };
  base.hp = dwellerMaxHp(base);
  return base;
}

function makeRoom(type: RoomType, level = 1): Room {
  return { id: uid("r"), type, level, workers: [], stored: 0, lastTick: Date.now() };
}

export function createInitialState(now = Date.now()): GameState {
  const dwellers = [
    makeDweller("recruit"),
    makeDweller("recruit"),
    makeDweller("spearman"),
  ];
  const quarters = makeRoom("quarters");
  const hall = makeRoom("hall");
  const mine = makeRoom("mine");
  const warchest = makeRoom("warchest");
  // Staff the starter mine with the two recruits so gold flows immediately.
  mine.workers = [dwellers[0].id, dwellers[1].id];
  dwellers[0].roomId = mine.id;
  dwellers[1].roomId = mine.id;

  // Everyone starts with a boss gladiator — the Master — living in his Quarters.
  const master = makeDweller("champion");
  master.name = "Kekius Maximus";
  master.roomId = quarters.id;
  dwellers.push(master);

  return {
    gold: 80,
    provisions: 120,
    salves: 30, // a small starter kit so the first wounds can be mended
    rooms: [quarters, hall, mine, warchest],
    dwellers,
    market: rollMarket(),
    gear: [],
    lunchboxes: 2, // starter crates to try the gacha
    objectives: defaultObjectives(),
    arena: { bossIndex: 0, bossHp: BOSSES[0].baseHp, rank: 999, wins: 0, lastFightAt: 0 },
    activeRaid: null,
    incident: null,
    squad: [],
    warChestUsd: 0,
    mercenaryBoost: 0,
    warChest: { stored: 0, totalYielded: 0, lastTick: now },
    fundedOnchain: false,
    lastFundTxId: null,
    renown: 0,
    descents: 0,
    daily: { lastClaimDay: 0, streak: 0 },
    offlineSummary: null,
    raidReport: null,
    levelUps: [],
    totalRaids: 0,
    totalGoldEarned: 0,
    totalBossWins: 0,
    totalGearUpgrades: 0,
    totalHeals: 0,
    lastTick: now,
  };
}

// ---------- objectives ----------

const OBJ_BASE: Record<ObjectiveKind, number> = {
  gold: 500,
  raids: 1,
  legion: 4,
  might: 60,
  boss: 1,
  upgrade: 2,
  heal: 3,
};

function makeObjective(kind: ObjectiveKind, mult: number): Objective {
  return {
    id: uid("o"),
    kind,
    target: Math.ceil(OBJ_BASE[kind] * mult),
    reward: 1,
  };
}

function defaultObjectives(): Objective[] {
  return [
    makeObjective("gold", 1),
    makeObjective("raids", 1),
    makeObjective("legion", 1),
    makeObjective("upgrade", 1),
  ];
}

export function objectiveProgress(state: GameState, o: Objective): number {
  switch (o.kind) {
    case "gold": return Math.floor(state.totalGoldEarned);
    case "raids": return state.totalRaids;
    case "legion": return state.dwellers.length;
    case "might": return Math.floor(deriveStats(state).might);
    case "boss": return state.totalBossWins;
    case "upgrade": return state.totalGearUpgrades;
    case "heal": return state.totalHeals;
  }
}

export function objectiveLabel(o: Objective): string {
  switch (o.kind) {
    case "gold": return `Earn ${formatNum(o.target)} total gold`;
    case "raids": return `Win ${o.target} raid${o.target > 1 ? "s" : ""}`;
    case "legion": return `Field a legion of ${o.target}`;
    case "might": return `Reach ${o.target} might`;
    case "boss": return `Defeat ${o.target} arena boss${o.target > 1 ? "es" : ""}`;
    case "upgrade": return `Upgrade gear ${o.target} time${o.target > 1 ? "s" : ""}`;
    case "heal": return `Heal ${o.target} wound${o.target > 1 ? "s" : ""}`;
  }
}

const OBJ_ROTATION: ObjectiveKind[] = ["gold", "raids", "legion", "might", "boss", "upgrade", "heal"];

export function claimObjective(state: GameState, objId: string): GameState {
  const o = state.objectives.find((x) => x.id === objId);
  if (!o) return state;
  if (objectiveProgress(state, o) < o.target) throw new Error("Objective not complete yet.");
  // advance: replace with a harder objective of a rotating kind
  const nextKind = OBJ_ROTATION[(OBJ_ROTATION.indexOf(o.kind) + 1) % OBJ_ROTATION.length];
  const mult = 1 + 0.6 * (o.reward + state.totalBossWins + 1);
  return {
    ...state,
    lunchboxes: state.lunchboxes + o.reward,
    objectives: state.objectives.map((x) =>
      x.id === objId ? makeObjective(nextKind, mult) : x,
    ),
  };
}

// ---------- lookups ----------

export function dwellerById(state: GameState, id: string): Dweller | undefined {
  return state.dwellers.find((d) => d.id === id);
}

export function roomById(state: GameState, id: string): Room | undefined {
  return state.rooms.find((r) => r.id === id);
}

export function isOnRaid(state: GameState, id: string): boolean {
  return state.activeRaid?.squad.includes(id) ?? false;
}

export function roomCapacity(room: Room): number {
  return ROOMS[room.type].capacityPerLevel * room.level;
}

export function roomStoreCap(room: Room): number {
  return ROOMS[room.type].storePerLevel * room.level;
}

/** Great Hall housing: base 3 + 3 per hall level. Lvl1 → 6. */
export function maxPopulation(state: GameState): number {
  const hall = state.rooms.find((r) => r.type === "hall");
  const lvl = hall?.level ?? 1;
  return 3 + 3 * lvl;
}

export function equippedGearDefs(state: GameState, d: Dweller): GearDef[] {
  const ids = [d.equipped.weapon, d.equipped.armor, d.equipped.mount].filter(
    Boolean,
  ) as string[];
  const out: GearDef[] = [];
  for (const id of ids) {
    const item = state.gear.find((g) => g.id === id);
    if (item && GEAR_BY_ID[item.defId]) out.push(GEAR_BY_ID[item.defId]);
  }
  return out;
}

/** Upgrade level of a gear instance (0 = base). */
export function gearLevel(item: GearItem): number {
  return item.level ?? 0;
}

/** Might/output a gear instance provides, scaled by its upgrade level. */
export function gearItemStats(item: GearItem): { might: number; output: number } {
  const def = GEAR_BY_ID[item.defId];
  if (!def) return { might: 0, output: 0 };
  const mult = 1 + GEAR_UPGRADE_PER_LEVEL * gearLevel(item);
  return {
    might: def.might * mult,
    output: def.output * mult,
  };
}

function gearBonus(state: GameState, d: Dweller): { might: number; output: number } {
  let might = 0;
  let output = 0;
  const ids = [d.equipped.weapon, d.equipped.armor, d.equipped.mount].filter(Boolean) as string[];
  for (const id of ids) {
    const item = state.gear.find((g) => g.id === id);
    if (!item) continue;
    const s = gearItemStats(item);
    might += s.might;
    output += s.output;
  }
  return { might, output };
}

export function dwellerOutput(d: Dweller, state: GameState): number {
  const base = TIERS[d.tier].output * (1 + OUTPUT_PER_LEVEL * (d.level - 1));
  return base + gearBonus(state, d).output;
}

export function dwellerMight(d: Dweller, state: GameState): number {
  const base = TIERS[d.tier].might * (1 + MIGHT_PER_LEVEL * (d.level - 1));
  return base + gearBonus(state, d).might;
}

/** Fraction of the way to the next level (0..1) — drives every XP bar. */
export function xpProgress(d: Dweller): number {
  return Math.max(0, Math.min(1, d.xp / xpForLevel(d.level)));
}

/** Unequipped gear (in the armory, not on any hero). */
export function inventoryGear(state: GameState): GearItem[] {
  const equippedIds = new Set<string>();
  for (const d of state.dwellers) {
    if (d.equipped.weapon) equippedIds.add(d.equipped.weapon);
    if (d.equipped.armor) equippedIds.add(d.equipped.armor);
    if (d.equipped.mount) equippedIds.add(d.equipped.mount);
  }
  return state.gear.filter((g) => !equippedIds.has(g.id));
}

export function gearDefOf(item: GearItem): GearDef {
  return GEAR_BY_ID[item.defId];
}

export function aptitudeMatches(room: Room, d: Dweller): boolean {
  const apt = ROOMS[room.type].aptitude;
  return apt != null && d.aptitude === apt;
}

/** Permanent, run-spanning production multiplier earned by descending (prestige). */
export function renownBoost(state: GameState): number {
  return state.renown * RENOWN_BOOST_PER;
}

/** Global output multiplier: on-chain Free Company + prestige Renown, stacked. */
export function globalBoost(state: GameState): number {
  return state.mercenaryBoost + renownBoost(state);
}

/** Gold/sec the on-chain Treasury Vault yields from staked USD (DFK-style real yield). */
export function warChestYield(state: GameState): number {
  if (state.warChestUsd <= 0) return 0;
  return state.warChestUsd * WARCHEST_YIELD_PER_USD * (1 + globalBoost(state));
}

/** Storage cap for the Treasury Vault yield pool (scales with staked USD). */
export function warChestStoreCap(state: GameState): number {
  return state.warChestUsd * WARCHEST_STORE_PER_USD;
}

/** Live per-second output of a room (gold / provisions / might / salves), boosts applied. */
export function roomRate(state: GameState, room: Room, fed: boolean): number {
  const def = ROOMS[room.type];
  if (!def.produces) return 0;
  // The vault yields from staked USD, not from workers.
  if (room.type === "warchest") return warChestYield(state);
  if (state.incident?.roomId === room.id) return 0; // room offline during incident
  let rate = 0;
  for (const wid of room.workers) {
    const d = dwellerById(state, wid);
    if (!d) continue;
    let o = dwellerOutput(d, state);
    if (def.aptitude && d.aptitude === def.aptitude) o *= 1 + MATCH_BONUS;
    rate += o;
  }
  rate *= 1 + globalBoost(state);
  // Starving hurts mining & forging, but NOT hunting/healing (so the legion can recover).
  if (!fed && def.produces !== "provisions" && def.produces !== "salves") rate *= STARVING_PENALTY;
  return rate;
}

/**
 * Fix #1 — the War Forge is real. Every point of might the Forge beats out arms
 * whoever the legion sends topside. This is the arsenal the squad carries into a
 * raid or the arena; it is added to squad power in `squadPower` below.
 */
export function forgeMight(state: GameState): number {
  const fed = state.provisions > 0;
  let m = 0;
  for (const room of state.rooms) {
    if (ROOMS[room.type].produces === "might") m += roomRate(state, room, fed);
  }
  return m;
}

export function deriveStats(state: GameState): DerivedStats {
  const fed = state.provisions > 0;
  const population = state.dwellers.length;
  const idleCount = state.dwellers.filter(
    (d) => d.roomId == null && !isOnRaid(state, d.id) && !d.downed,
  ).length;

  let goldPerSec = 0;
  let provGross = 0;
  let salvesPerSec = 0;
  let forgeMight = 0;
  for (const room of state.rooms) {
    const def = ROOMS[room.type];
    if (def.produces === "gold") goldPerSec += roomRate(state, room, fed);
    else if (def.produces === "provisions") provGross += roomRate(state, room, fed);
    else if (def.produces === "salves") salvesPerSec += roomRate(state, room, fed);
    else if (def.produces === "might") forgeMight += roomRate(state, room, fed);
  }

  let might = forgeMight;
  let woundedCount = 0;
  for (const d of state.dwellers) {
    might += dwellerMight(d, state);
    if (d.downed || d.hp < dwellerMaxHp(d)) woundedCount++;
  }

  const provisionsPerSec = provGross - population * UPKEEP_PER_DWELLER;

  return { might, goldPerSec, provisionsPerSec, salvesPerSec, population, idleCount, woundedCount, fed };
}

// ---------- tick ----------

/** Damage per second an unresolved incident inflicts on the room's workers. */
const INCIDENT_DPS = 4;

export function tick(state: GameState, now = Date.now()): GameState {
  const elapsed = Math.max(0, (now - state.lastTick) / 1000);
  if (elapsed <= 0) return state;

  const fed = state.provisions > 0;
  let next: GameState = { ...state };

  // Accrue collectable resources into each room's storage.
  next.rooms = state.rooms.map((room) => {
    const cap = roomStoreCap(room);
    if (cap <= 0) return { ...room, lastTick: now };
    const rate = roomRate(state, room, fed);
    const stored = Math.min(cap, room.stored + rate * elapsed);
    return { ...room, stored, lastTick: now };
  });

  // The on-chain Treasury Vault yields gold from staked USD into its own pool.
  {
    const cap = warChestStoreCap(state);
    const yieldRate = warChestYield(state);
    if (cap > 0 && yieldRate > 0) {
      const stored = Math.min(cap, state.warChest.stored + yieldRate * elapsed);
      next.warChest = { ...state.warChest, stored, lastTick: now };
    } else {
      next.warChest = { ...state.warChest, lastTick: now };
    }
  }

  // Population eats. Upkeep drains the provisions pool continuously.
  const upkeep = state.dwellers.length * UPKEEP_PER_DWELLER * elapsed;
  next.provisions = Math.max(0, state.provisions - upkeep);

  // Great Hall slowly grows the legion when fed and under housing cap.
  const hall = next.rooms.find((r) => r.type === "hall");
  if (hall && fed && next.dwellers.length < maxPopulation(next)) {
    const growth = 0.04 * hall.level * elapsed;
    const acc = hall.stored + growth;
    if (acc >= 1) {
      next.dwellers = [...next.dwellers, makeDweller("recruit")];
      next.rooms = next.rooms.map((r) =>
        r.id === hall.id ? { ...r, stored: acc - 1 } : r,
      );
    } else {
      next.rooms = next.rooms.map((r) =>
        r.id === hall.id ? { ...r, stored: acc } : r,
      );
    }
  }

  // Incidents auto-resolve — the legion fights them off.
  if (next.incident && now >= next.incident.endsAt) {
    next.incident = null;
  }

  // Working dwellers earn XP just for being on the job — every bar creeps,
  // and the occasional idle level-up keeps the loop alive between clicks.
  // (Incident-frozen rooms don't pay out.)
  const workingIds: string[] = [];
  for (const room of next.rooms) {
    if (roomCapacity(room) <= 0) continue;
    if (next.incident?.roomId === room.id) continue;
    workingIds.push(...room.workers);
  }
  if (workingIds.length > 0) {
    next = applyXp(next, workingIds, PASSIVE_XP_PER_SEC * elapsed);
  }

  // Stamina regen (rest in the Hall recovers fastest) + incident wounds.
  // A worker in a burning room bleeds; drop them when they fall so the room
  // stops paying out and the player feels the loss.
  const incidentRoomId = next.incident?.roomId ?? null;
  const onRaidIds = new Set(next.activeRaid?.squad ?? []);
  const downedNow: string[] = [];
  next.dwellers = next.dwellers.map((d) => {
    let stamina = d.stamina;
    let hp = d.hp;
    let downed = d.downed;
    // regen: no recovery while marching on a raid
    if (!onRaidIds.has(d.id)) {
      const regen = d.roomId == null ? STAMINA_REGEN_IDLE : STAMINA_REGEN_WORKING;
      stamina = Math.min(MAX_STAMINA, stamina + regen * elapsed);
    }
    // incident wounds workers in the stricken room
    if (incidentRoomId && d.roomId === incidentRoomId && !downed) {
      hp = Math.max(0, hp - INCIDENT_DPS * elapsed);
      if (hp <= 0) {
        downed = true;
        downedNow.push(d.id);
      }
    }
    return stamina === d.stamina && hp === d.hp && downed === d.downed
      ? d
      : { ...d, stamina, hp, downed };
  });
  // Pull the downed out of their rooms (and clear their assignment).
  if (downedNow.length) {
    const downSet = new Set(downedNow);
    next.rooms = next.rooms.map((r) => ({
      ...r,
      workers: r.workers.filter((w) => !downSet.has(w)),
    }));
    next.dwellers = next.dwellers.map((d) =>
      downSet.has(d.id) ? { ...d, roomId: null } : d,
    );
  }

  next.lastTick = now;
  return next;
}

// ---------- actions ----------

export function recruitCost(state: GameState): number {
  return Math.floor(TIERS.recruit.recruitCost * Math.pow(1.14, state.dwellers.length));
}

export function recruitDweller(state: GameState): GameState {
  if (state.dwellers.length >= maxPopulation(state)) {
    throw new Error("Great Hall is full — upgrade it to house more legion.");
  }
  const cost = recruitCost(state);
  if (state.gold < cost) throw new Error("Not enough gold to recruit.");
  return {
    ...state,
    gold: state.gold - cost,
    dwellers: [...state.dwellers, makeDweller("recruit")],
  };
}

// ---------- slave market (the surface gate) ----------

export const MARKET_SIZE = 3;

function rollMarketTier(): Tier {
  const r = Math.random();
  if (r < 0.44) return "recruit";
  if (r < 0.72) return "spearman";
  if (r < 0.9) return "archer";
  if (r < 0.98) return "cavalry";
  return "champion";
}

function slavePrice(tier: Tier): number {
  return Math.floor(TIERS[tier].recruitCost * (1.3 + Math.random() * 0.6));
}

function makeOffer(): MarketOffer {
  const tier = rollMarketTier();
  return { id: uid("m"), name: randomName(), tier, price: slavePrice(tier) };
}

export function rollMarket(n = MARKET_SIZE): MarketOffer[] {
  return Array.from({ length: n }, makeOffer);
}

export function marketRerollCost(state: GameState): number {
  return 40 + state.dwellers.length * 15;
}

export function buySlave(state: GameState, offerId: string): GameState {
  const offer = state.market.find((o) => o.id === offerId);
  if (!offer) throw new Error("That gladiator is no longer at market.");
  if (state.dwellers.length >= maxPopulation(state)) {
    throw new Error("Great Hall is full — upgrade it to house more legion.");
  }
  if (state.gold < offer.price) throw new Error("Not enough gold to buy this gladiator.");
  const bought = makeDweller(offer.tier);
  bought.name = offer.name; // keep the gladiator's name from the block
  return {
    ...state,
    gold: state.gold - offer.price,
    dwellers: [...state.dwellers, bought],
    market: state.market.map((o) => (o.id === offerId ? makeOffer() : o)),
  };
}

export function rerollMarket(state: GameState): GameState {
  const cost = marketRerollCost(state);
  if (state.gold < cost) throw new Error("Not enough gold to bring in new stock.");
  return { ...state, gold: state.gold - cost, market: rollMarket() };
}

// ---------- marketplace: grant (on-chain buy) + sell ----------

/** Premium on-chain purchase — a champion/epic gladiator joins (bypasses hall cap). */
export function grantGladiator(state: GameState, tier: Tier): GameState {
  const d = makeDweller(tier);
  d.onchain = true; // real money is permanent — this hero survives a Descend
  return { ...state, dwellers: [...state.dwellers, d] };
}

export function grantGearItem(state: GameState, defId: string): GameState {
  if (!GEAR_BY_ID[defId]) return state;
  return { ...state, gear: [...state.gear, { id: uid("g"), defId, onchain: true }] };
}

export function heroSellValue(d: Dweller): number {
  return Math.floor(TIERS[d.tier].recruitCost * 0.4 * (1 + 0.12 * (d.level - 1)));
}

export function gearSellValue(defId: string): number {
  const def = GEAR_BY_ID[defId];
  return def ? GEAR_SELL_VALUE[def.rarity] : 0;
}

export function sellHero(state: GameState, id: string): GameState {
  const d = dwellerById(state, id);
  if (!d) return state;
  if (state.dwellers.length <= 1) throw new Error("Keep at least one gladiator in the legion.");
  const gold = heroSellValue(d);
  return {
    ...state,
    gold: state.gold + gold,
    totalGoldEarned: state.totalGoldEarned + gold,
    dwellers: state.dwellers.filter((x) => x.id !== id),
  };
}

export function sellGearItem(state: GameState, gearItemId: string): GameState {
  const item = state.gear.find((g) => g.id === gearItemId);
  if (!item) return state;
  const gold = gearSellValue(item.defId);
  const dwellers = state.dwellers.map((x) => {
    const eq = { ...x.equipped };
    (["weapon", "armor", "mount"] as GearSlot[]).forEach((sl) => {
      if (eq[sl] === gearItemId) eq[sl] = null;
    });
    return { ...x, equipped: eq };
  });
  return {
    ...state,
    gold: state.gold + gold,
    totalGoldEarned: state.totalGoldEarned + gold,
    gear: state.gear.filter((g) => g.id !== gearItemId),
    dwellers,
  };
}

// ---------- gear upgrade & fusion (Crypto-Dynasty gear economy) ----------

/** Gold to take a gear instance from its current level to the next. */
export function gearUpgradeCost(item: GearItem): number {
  const def = GEAR_BY_ID[item.defId];
  if (!def) return 0;
  const base = GEAR_UPGRADE_BASE[def.rarity];
  return Math.floor(base * Math.pow(1.55, gearLevel(item)));
}

export function gearAtMaxLevel(item: GearItem): boolean {
  return gearLevel(item) >= GEAR_MAX_LEVEL;
}

/** Pour gold into a piece to raise its level (and its might/output). */
export function upgradeGear(state: GameState, gearItemId: string): GameState {
  const item = state.gear.find((g) => g.id === gearItemId);
  if (!item) throw new Error("No such gear.");
  if (gearAtMaxLevel(item)) throw new Error("This piece is already at max forge level.");
  const cost = gearUpgradeCost(item);
  if (state.gold < cost) throw new Error("Not enough gold to forge this higher.");
  return {
    ...state,
    gold: state.gold - cost,
    totalGearUpgrades: state.totalGearUpgrades + 1,
    gear: state.gear.map((g) =>
      g.id === gearItemId ? { ...g, level: gearLevel(g) + 1 } : g,
    ),
  };
}

/** Unequipped duplicates (same blueprint) that could be fused into `item`. */
export function fusionCandidates(state: GameState, gearItemId: string): GearItem[] {
  const item = state.gear.find((g) => g.id === gearItemId);
  if (!item) return [];
  const equipped = new Set<string>();
  for (const d of state.dwellers) {
    if (d.equipped.weapon) equipped.add(d.equipped.weapon);
    if (d.equipped.armor) equipped.add(d.equipped.armor);
    if (d.equipped.mount) equipped.add(d.equipped.mount);
  }
  return state.gear.filter(
    (g) => g.id !== gearItemId && g.defId === item.defId && !equipped.has(g.id),
  );
}

/** Consume a duplicate to jump a piece several forge levels at once. */
export function fuseGear(state: GameState, targetId: string, sacrificeId: string): GameState {
  const target = state.gear.find((g) => g.id === targetId);
  const sacrifice = state.gear.find((g) => g.id === sacrificeId);
  if (!target || !sacrifice) throw new Error("Bad fusion.");
  if (target.id === sacrifice.id || target.defId !== sacrifice.defId) {
    throw new Error("Fusion needs a duplicate of the same piece.");
  }
  if (gearAtMaxLevel(target)) throw new Error("This piece is already at max forge level.");
  const newLevel = Math.min(GEAR_MAX_LEVEL, gearLevel(target) + FUSION_LEVELS);
  return {
    ...state,
    totalGearUpgrades: state.totalGearUpgrades + 1,
    gear: state.gear
      .filter((g) => g.id !== sacrificeId)
      .map((g) => (g.id === targetId ? { ...g, level: newLevel } : g)),
  };
}

export function buildCost(type: RoomType): number {
  return ROOMS[type].buildCost;
}

export function buildRoom(state: GameState, type: RoomType): GameState {
  const def = ROOMS[type];
  if (def.unique && state.rooms.some((r) => r.type === type)) {
    throw new Error(`${def.name} already built.`);
  }
  if (state.gold < def.buildCost) throw new Error("Not enough gold to dig this room.");
  return {
    ...state,
    gold: state.gold - def.buildCost,
    rooms: [...state.rooms, makeRoom(type)],
  };
}

export function upgradeCost(room: Room): number {
  const base = ROOMS[room.type].buildCost > 0 ? ROOMS[room.type].buildCost : 150;
  return Math.floor(base * Math.pow(1.6, room.level));
}

export function upgradeRoom(state: GameState, roomId: string): GameState {
  const room = roomById(state, roomId);
  if (!room) throw new Error("No such room.");
  const cost = upgradeCost(room);
  if (state.gold < cost) throw new Error("Not enough gold to upgrade.");
  return {
    ...state,
    gold: state.gold - cost,
    rooms: state.rooms.map((r) =>
      r.id === roomId ? { ...r, level: r.level + 1 } : r,
    ),
  };
}

export function assignDweller(
  state: GameState,
  dwellerId: string,
  roomId: string,
): GameState {
  const d = dwellerById(state, dwellerId);
  const room = roomById(state, roomId);
  if (!d || !room) throw new Error("Bad assignment.");
  if (isOnRaid(state, dwellerId)) throw new Error("That dweller is out on a raid.");
  if (d.downed) throw new Error("That gladiator is down — heal them in the Infirmary first.");
  if (roomCapacity(room) <= 0) throw new Error("This room takes no workers.");
  if (room.workers.length >= roomCapacity(room) && d.roomId !== roomId) {
    throw new Error(`${ROOMS[room.type].name} is fully staffed.`);
  }
  const rooms = state.rooms.map((r) => ({
    ...r,
    workers: r.workers.filter((w) => w !== dwellerId),
  }));
  const target = rooms.find((r) => r.id === roomId)!;
  target.workers = [...target.workers, dwellerId];
  const dwellers = state.dwellers.map((x) =>
    x.id === dwellerId ? { ...x, roomId } : x,
  );
  return { ...state, rooms, dwellers };
}

export function unassignDweller(state: GameState, dwellerId: string): GameState {
  return {
    ...state,
    rooms: state.rooms.map((r) => ({
      ...r,
      workers: r.workers.filter((w) => w !== dwellerId),
    })),
    dwellers: state.dwellers.map((x) =>
      x.id === dwellerId ? { ...x, roomId: null } : x,
    ),
  };
}

/** Fill a room from the best-matching idle dwellers. */
export function autoStaff(state: GameState, roomId: string): GameState {
  const room = roomById(state, roomId);
  if (!room) return state;
  const cap = roomCapacity(room);
  const apt = ROOMS[room.type].aptitude;
  let next = state;
  let cur = roomById(next, roomId)!;
  while (cur.workers.length < cap) {
    const idle = next.dwellers
      .filter((d) => d.roomId == null && !isOnRaid(next, d.id) && !d.downed)
      .sort((a, b) => {
        const am = apt && a.aptitude === apt ? 1 : 0;
        const bm = apt && b.aptitude === apt ? 1 : 0;
        if (am !== bm) return bm - am;
        return dwellerOutput(b, next) - dwellerOutput(a, next);
      });
    if (idle.length === 0) break;
    next = assignDweller(next, idle[0].id, roomId);
    cur = roomById(next, roomId)!;
  }
  return next;
}

/**
 * Grant XP to a set of dwellers and surface every level-up as a celebration
 * event. Crossing a milestone level (every {@link MILESTONE_EVERY}) pays a
 * lunchbox — the concrete payoff that makes the bar worth watching. Returns the
 * whole next state (dwellers + queued events + milestone crates), so callers
 * pipe their state through this instead of hand-patching `dwellers`.
 */
export function applyXp(state: GameState, ids: string[], amount: number): GameState {
  if (amount <= 0 || ids.length === 0) return state;
  const idSet = new Set(ids);
  const events: LevelUpEvent[] = [];
  let bonusBoxes = 0;

  const dwellers = state.dwellers.map((d) => {
    if (!idSet.has(d.id)) return d;
    const from = d.level;
    let level = d.level;
    let xp = d.xp + amount;
    let need = xpForLevel(level);
    let milestone = false;
    let reward = 0;
    while (xp >= need) {
      xp -= need;
      level += 1;
      if (level % MILESTONE_EVERY === 0) {
        milestone = true;
        reward += 1;
      }
      need = xpForLevel(level);
    }
    if (level > from) {
      events.push({
        id: uid("lv"),
        dwellerId: d.id,
        name: d.name,
        tier: d.tier,
        from,
        to: level,
        milestone,
        reward,
      });
      bonusBoxes += reward;
    }
    return { ...d, level, xp };
  });

  return {
    ...state,
    dwellers,
    lunchboxes: state.lunchboxes + bonusBoxes,
    // cap the queue so a big batch can't flood the celebration layer
    levelUps: [...state.levelUps, ...events].slice(-16),
  };
}

/** Clear the pending level-up celebrations once the UI has played them. */
export function clearLevelUps(state: GameState): GameState {
  return state.levelUps.length ? { ...state, levelUps: [] } : state;
}

/** Collect the on-chain Treasury Vault's yielded gold into your purse. */
export function collectWarChest(state: GameState): GameState {
  const amount = Math.floor(state.warChest.stored);
  if (amount <= 0) return state;
  return {
    ...state,
    gold: state.gold + amount,
    totalGoldEarned: state.totalGoldEarned + amount,
    warChest: {
      ...state.warChest,
      stored: state.warChest.stored - amount,
      totalYielded: state.warChest.totalYielded + amount,
    },
  };
}

export function collectRoom(state: GameState, roomId: string): GameState {
  const room = roomById(state, roomId);
  if (!room) return state;
  const def = ROOMS[room.type];
  // The Treasury Vault collects from the staked-USD yield pool, not room storage.
  if (room.type === "warchest") return collectWarChest(state);
  const amount = Math.floor(room.stored);
  if (amount <= 0) return state;
  const patch: Partial<GameState> = {};
  if (def.produces === "gold") {
    patch.gold = state.gold + amount;
    patch.totalGoldEarned = state.totalGoldEarned + amount;
  } else if (def.produces === "provisions") {
    patch.provisions = state.provisions + amount;
  } else if (def.produces === "salves") {
    patch.salves = state.salves + amount;
  }
  const collected: GameState = {
    ...state,
    ...patch,
    rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, stored: 0 } : r)),
  };
  return applyXp(collected, room.workers, XP_COLLECT);
}

export function collectAll(state: GameState): GameState {
  let next = state;
  for (const r of state.rooms) {
    if (roomStoreCap(r) > 0 && r.stored >= 1) next = collectRoom(next, r.id);
  }
  if (next.warChest.stored >= 1) next = collectWarChest(next);
  return next;
}

// ---------- healing (salves mend wounds; downed need a costly revive) ----------

/** Dwellers that are hurt (below full HP) or outright downed. */
export function woundedDwellers(state: GameState): Dweller[] {
  return state.dwellers.filter((d) => d.downed || d.hp < dwellerMaxHp(d));
}

/** Salves needed to fully mend a dweller (reviving the downed costs a premium). */
export function healSalveCost(d: Dweller): number {
  const max = dwellerMaxHp(d);
  const missing = Math.max(0, max - d.hp);
  const frac = max > 0 ? missing / max : 0;
  let cost = frac * SALVES_PER_FULL_HEAL;
  if (d.downed) cost = Math.max(cost, SALVES_PER_FULL_HEAL) * REVIVE_SALVE_MULT;
  return Math.max(1, Math.ceil(cost));
}

/** Mend one dweller to full, spending salves. Throws if the stores are short. */
export function healDweller(state: GameState, id: string): GameState {
  const d = dwellerById(state, id);
  if (!d) return state;
  const max = dwellerMaxHp(d);
  if (!d.downed && d.hp >= max) return state; // already healthy
  const cost = healSalveCost(d);
  if (state.salves < cost) throw new Error(`Not enough salves — need ${cost}. Staff the Infirmary.`);
  return {
    ...state,
    salves: state.salves - cost,
    totalHeals: state.totalHeals + 1,
    dwellers: state.dwellers.map((x) =>
      x.id === id ? { ...x, hp: max, downed: false } : x,
    ),
  };
}

/** Mend as many wounded as the salve stores allow, cheapest first. */
export function healAll(state: GameState): GameState {
  let next = state;
  const queue = woundedDwellers(next).sort((a, b) => healSalveCost(a) - healSalveCost(b));
  for (const d of queue) {
    if (next.salves < healSalveCost(d)) continue;
    next = healDweller(next, d.id);
  }
  return next;
}

const INCIDENT_LABELS: Record<IncidentKind, string> = {
  raiders: "Paper-hand raiders broke in!",
  cavein: "Cave-in! (network congestion)",
  vermin: "MEV-rats infesting the deep!",
};

/** Rush a room: instantly fill its storage, but risk an incident. */
export function rushRoom(state: GameState, roomId: string): GameState {
  const room = roomById(state, roomId);
  if (!room) return state;
  if (roomStoreCap(room) <= 0) throw new Error("Nothing to rush in this room.");
  if (state.incident) throw new Error("Deal with the current incident first.");

  // Risk scales with how full the room already is (like Fallout Shelter).
  const fillFrac = room.stored / roomStoreCap(room);
  const risk = Math.min(0.6, 0.15 + fillFrac * 0.5);
  const failed = Math.random() < risk;

  if (failed) {
    const kinds: IncidentKind[] = ["raiders", "cavein", "vermin"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    return {
      ...state,
      incident: {
        kind,
        roomId,
        label: INCIDENT_LABELS[kind],
        endsAt: Date.now() + 12000,
      },
    };
  }

  return {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === roomId ? { ...r, stored: roomStoreCap(r) } : r,
    ),
  };
}

// ---------- squad selection (Fix #4) ----------

/** Dwellers currently available to fight (idle, not out on a raid, not downed). */
export function idleDwellers(state: GameState): Dweller[] {
  return state.dwellers.filter((d) => d.roomId == null && !isOnRaid(state, d.id) && !d.downed);
}

/**
 * The squad you actually send. If you've hand-picked members (and any are
 * available) only those go; otherwise the whole idle bench marches — so the
 * one-tap "send everyone" flow still works, but picking a squad is a real
 * decision: roster depth vs. concentrated power.
 */
export function effectiveSquad(state: GameState): Dweller[] {
  const idle = idleDwellers(state);
  const chosen = idle.filter((d) => state.squad.includes(d.id));
  return chosen.length ? chosen : idle;
}

/** Squad might = each fighter's might + the whole Forge arsenal (Fix #1). */
export function squadPower(state: GameState, squad: Dweller[]): number {
  const base = squad.reduce((s, d) => s + dwellerMight(d, state), 0);
  return base + (squad.length ? forgeMight(state) : 0);
}

/** One fighter's class multiplier against an enemy class (the RPS triangle). */
export function classMultiplierVs(cls: CombatClass, enemy: CombatClass): number {
  if (CLASS_BEATS[cls] === enemy) return CLASS_ADVANTAGE; // we counter them
  if (CLASS_BEATS[enemy] === cls) return CLASS_DISADVANTAGE; // they counter us
  return 1;
}

/**
 * Squad-wide damage multiplier vs. an enemy class, weighted by each fighter's
 * might — so stacking the countering class actually swings the fight. Returns 1
 * for an empty squad.
 */
export function squadClassEdge(state: GameState, squad: Dweller[], enemy: CombatClass): number {
  let weight = 0;
  let acc = 0;
  for (const d of squad) {
    const w = Math.max(1, dwellerMight(d, state));
    acc += w * classMultiplierVs(dwellerClass(d), enemy);
    weight += w;
  }
  return weight > 0 ? acc / weight : 1;
}

export function toggleSquad(state: GameState, dwellerId: string): GameState {
  const inSquad = state.squad.includes(dwellerId);
  return {
    ...state,
    squad: inSquad
      ? state.squad.filter((id) => id !== dwellerId)
      : [...state.squad, dwellerId],
  };
}

/** Hand-pick the entire idle bench (explicit "send all"). */
export function selectAllIdle(state: GameState): GameState {
  return { ...state, squad: idleDwellers(state).map((d) => d.id) };
}

export function clearSquad(state: GameState): GameState {
  return { ...state, squad: [] };
}

// ---------- raids ----------

export function startRaid(
  state: GameState,
  missionId: string,
  now = Date.now(),
): GameState {
  if (state.activeRaid) throw new Error("A raid is already under way.");
  const mission = RAIDS.find((m) => m.id === missionId);
  if (!mission) throw new Error("Unknown mission.");
  const hasWarRoom = state.rooms.some((r) => r.type === "warroom");
  if (!hasWarRoom) throw new Error("Dig a War Room to plan raids.");

  const roster = effectiveSquad(state).filter((d) => d.stamina >= STAMINA_PER_RAID);
  const squad = roster.map((d) => d.id);
  if (squad.length === 0) {
    throw new Error("No rested dwellers to send — they need stamina to march (rest in the Hall).");
  }
  const might = squadPower(state, roster);
  if (might < mission.minMight) {
    throw new Error(
      `Squad might ${Math.floor(might)} < ${mission.minMight}. Forge more might or send stronger dwellers.`,
    );
  }
  const squadSet = new Set(squad);
  return {
    ...state,
    // Marching burns stamina — the DFK-style energy gate on questing.
    dwellers: state.dwellers.map((d) =>
      squadSet.has(d.id) ? { ...d, stamina: Math.max(0, d.stamina - STAMINA_PER_RAID) } : d,
    ),
    // Once they march, clear the picks that are now committed so the next raid
    // starts from a clean bench selection.
    squad: state.squad.filter((id) => !squad.includes(id)),
    activeRaid: {
      missionId,
      squad,
      startedAt: now,
      endsAt: now + mission.durationSec * 1000,
    },
  };
}

const RAID_FLAVOR: Record<CombatClass, string[]> = {
  melee: ["shield-wall bruisers", "a warlord's oathsworn", "pit-scarred brawlers"],
  ranged: ["slingers on the ridge", "crossbow ambushers", "a screen of skirmishers"],
  charge: ["outrider lancers", "a chariot picket", "steppe raiders at the gallop"],
};

/** Build the timestamped after-action feed — the Fallout-Shelter exploration log. */
function buildRaidLog(
  mission: RaidMission,
  edge: number,
  gold: number,
  wounded: string[],
  downed: string[],
  killed: string[],
): RaidLogEntry[] {
  const dur = mission.durationSec;
  const at = (frac: number) => Math.max(1, Math.round(dur * frac));
  const foe = RAID_FLAVOR[mission.enemyClass][Math.floor(Math.random() * RAID_FLAVOR[mission.enemyClass].length)];
  const log: RaidLogEntry[] = [];
  log.push({ t: at(0.05), icon: mission.icon, text: `The squad marches out to ${mission.name}.`, tone: "flavor" });
  log.push({ t: at(0.3), icon: "👁️", text: `Scouts spot ${foe} holding the approach.`, tone: "flavor" });
  if (edge >= 1.15) {
    log.push({ t: at(0.45), icon: "⚔️", text: `Perfect matchup — the legion hits their flank and they break.`, tone: "fight" });
  } else if (edge <= 0.9) {
    log.push({ t: at(0.45), icon: "⚔️", text: `Bad matchup — ${foe} counter the squad's charge and it turns bloody.`, tone: "fight" });
  } else {
    log.push({ t: at(0.45), icon: "⚔️", text: `Blades out. A hard, even scrap against ${foe}.`, tone: "fight" });
  }
  const midGold = Math.round(gold * 0.45);
  log.push({ t: at(0.62), icon: "🪙", text: `Cracked a strongbox — ${formatNum(midGold)} sestertii and rising.`, tone: "loot" });
  for (const n of wounded) log.push({ t: at(0.7 + Math.random() * 0.15), icon: "🩸", text: `${n} takes a wound but holds the line.`, tone: "wound" });
  for (const n of downed) log.push({ t: at(0.75 + Math.random() * 0.12), icon: "🚑", text: `${n} goes down — dragged out unconscious.`, tone: "wound" });
  for (const n of killed) log.push({ t: at(0.8 + Math.random() * 0.1), icon: "💀", text: `${n} does not come home. Pour one out.`, tone: "wound" });
  log.push({ t: at(0.95), icon: "🎁", text: `Loot hauled back: ${formatNum(gold)} gold and a sealed lunchbox.`, tone: "loot" });
  return log.sort((a, b) => a.t - b.t);
}

export function claimRaid(state: GameState, now = Date.now()): GameState {
  if (!state.activeRaid) throw new Error("No raid to claim.");
  if (now < state.activeRaid.endsAt) throw new Error("The squad is still marching.");
  const mission = RAIDS.find((m) => m.id === state.activeRaid!.missionId);
  if (!mission) throw new Error("Unknown mission.");

  const squadIds = state.activeRaid.squad;
  const fighters = squadIds
    .map((id) => dwellerById(state, id))
    .filter(Boolean) as Dweller[];

  // Class matchup drives both loot and how bloody it gets.
  const edge = squadClassEdge(state, fighters, mission.enemyClass);
  const might = Math.max(1, squadPower(state, fighters));
  const margin = Math.max(1, might / Math.max(1, mission.minMight));

  const reward = Math.floor(mission.goldReward * (1 + state.mercenaryBoost * 0.5) * edge);

  // Resolve each fighter's fate: unhurt / wounded / downed / killed.
  const wounded: string[] = [];
  const downed: string[] = [];
  const killed: string[] = [];
  const hpPatch = new Map<string, { hp: number; downed: boolean }>();
  for (const d of fighters) {
    const max = dwellerMaxHp(d);
    // more danger & worse matchup → more damage; strong margin & class edge soak it
    const sev = (mission.danger * (0.6 + Math.random() * 0.8)) / edge / Math.sqrt(margin);
    const dmg = Math.min(max, sev * max);
    const hp = Math.max(0, d.hp - dmg);
    if (hp <= 0) {
      const deathChance = Math.min(0.3, (mission.danger * 0.35) / margin);
      if (Math.random() < deathChance) {
        killed.push(d.name);
      } else {
        downed.push(d.name);
        hpPatch.set(d.id, { hp: 0, downed: true });
      }
    } else {
      if (dmg > max * 0.08) wounded.push(d.name);
      hpPatch.set(d.id, { hp, downed: false });
    }
  }

  const killedSet = new Set(fighters.filter((d) => killed.includes(d.name)).map((d) => d.id));
  const survivorIds = squadIds.filter((id) => !killedSet.has(id));

  const log = buildRaidLog(mission, edge, reward, wounded, downed, killed);
  const report: RaidReport = {
    missionId: mission.id,
    missionName: mission.name,
    gold: reward,
    xp: XP_RAID,
    classEdge: edge,
    wounded,
    downed,
    killed,
    log,
  };

  const claimed: GameState = {
    ...state,
    gold: state.gold + reward,
    totalGoldEarned: state.totalGoldEarned + reward,
    totalRaids: state.totalRaids + 1,
    lunchboxes: state.lunchboxes + 1, // raids drop a lunchbox
    activeRaid: null,
    raidReport: report,
    dwellers: state.dwellers
      .filter((d) => !killedSet.has(d.id))
      .map((d) => {
        const p = hpPatch.get(d.id);
        return p ? { ...d, hp: p.hp, downed: p.downed } : d;
      }),
  };
  return applyXp(claimed, survivorIds, XP_RAID);
}

export function clearRaidReport(state: GameState): GameState {
  return state.raidReport ? { ...state, raidReport: null } : state;
}

export function raidSquadMight(state: GameState): number {
  return squadPower(state, effectiveSquad(state));
}

// ---------- on-chain war chest ----------

export function applyWarChestFunding(
  state: GameState,
  amountUsd: number,
  txId: string | null,
): GameState {
  const warChestUsd = state.warChestUsd + amountUsd;
  let boost = state.mercenaryBoost;
  for (const tier of MERCENARY_TIERS) {
    if (warChestUsd >= tier.minUsd) boost = Math.max(boost, tier.boost);
  }
  return {
    ...state,
    warChestUsd,
    mercenaryBoost: boost,
    fundedOnchain: true,
    lastFundTxId: txId ?? state.lastFundTxId,
  };
}

// ---------- prestige: Descend deeper (Fix #2) ----------

/** Renown this run would bank right now if the legion descended. */
export function pendingRenown(state: GameState): number {
  const fromGold = Math.floor(Math.sqrt(state.totalGoldEarned / RENOWN_GOLD_DIVISOR));
  const fromBoss = state.totalBossWins * RENOWN_PER_BOSS;
  return Math.max(0, fromGold + fromBoss);
}

/** Can the legion abandon this stronghold and dig a deeper one? */
export function canDescend(state: GameState): boolean {
  return state.totalGoldEarned >= DESCEND_MIN_GOLD && pendingRenown(state) >= 1;
}

/**
 * Abandon the current stronghold and dig deeper. The run resets — rooms,
 * gladiators, gold, gear, raids, arena — but banked **Renown** (and everything
 * you paid *real* money for on-chain) carries over. More Renown = a permanent
 * head start on every future run. This is the idle-game endgame loop.
 */
export function descend(state: GameState, now = Date.now()): GameState {
  const gain = pendingRenown(state);
  if (!canDescend(state)) {
    throw new Error("Not deep enough yet — earn more gold (and beat bosses) before you descend.");
  }
  const fresh = createInitialState(now);

  // Anything bought with real, cross-chain money is a permanent asset — it comes
  // down into the new stronghold. Reset its transient state (fresh, un-downed,
  // unassigned) but keep the hero/gear itself.
  const keptDwellers = state.dwellers
    .filter((d) => d.onchain)
    .map((d) => ({ ...d, hp: dwellerMaxHp(d), stamina: MAX_STAMINA, downed: false, roomId: null }));
  const keptGear = state.gear.filter((g) => g.onchain);
  // Drop any equip links whose hero/gear didn't survive the descent.
  const keptDwellerIds = new Set(keptDwellers.map((d) => d.id));
  const keptGearIds = new Set(keptGear.map((g) => g.id));
  const dwellers = [...fresh.dwellers, ...keptDwellers].map((d) =>
    keptDwellerIds.has(d.id)
      ? {
          ...d,
          equipped: {
            weapon: d.equipped.weapon && keptGearIds.has(d.equipped.weapon) ? d.equipped.weapon : null,
            armor: d.equipped.armor && keptGearIds.has(d.equipped.armor) ? d.equipped.armor : null,
            mount: d.equipped.mount && keptGearIds.has(d.equipped.mount) ? d.equipped.mount : null,
          },
        }
      : d,
  );

  return {
    ...fresh,
    dwellers,
    gear: keptGear,
    renown: state.renown + gain,
    descents: state.descents + 1,
    // On-chain purchases are permanent — the player paid real, cross-chain money.
    warChestUsd: state.warChestUsd,
    mercenaryBoost: state.mercenaryBoost,
    warChest: { stored: 0, totalYielded: state.warChest.totalYielded, lastTick: now },
    fundedOnchain: state.fundedOnchain,
    lastFundTxId: state.lastFundTxId,
    // The login streak is a real-world habit — it shouldn't reset on a descent.
    daily: state.daily,
  };
}

// ---------- daily-login reward (retention ritual) ----------

/** Epoch-day index (local) for a timestamp. */
function dayIndex(now: number): number {
  return Math.floor(now / 86_400_000);
}

/** Is a daily reward available to claim right now? */
export function dailyAvailable(state: GameState, now = Date.now()): boolean {
  return dayIndex(now) > state.daily.lastClaimDay;
}

/** What the next daily claim would pay (streak-scaled). */
export function dailyReward(state: GameState, now = Date.now()): { gold: number; lunchboxes: number; streak: number } {
  const today = dayIndex(now);
  const gap = today - state.daily.lastClaimDay;
  const streak = state.daily.lastClaimDay > 0 && gap <= DAILY_GRACE_DAYS + 1 ? state.daily.streak + 1 : 1;
  const gold = DAILY_GOLD_BASE + DAILY_GOLD_PER_STREAK * (streak - 1);
  const lunchboxes = streak % DAILY_LUNCHBOX_EVERY === 0 ? 1 : 0;
  return { gold, lunchboxes, streak };
}

/** Claim the daily reward — bumps the streak, pays gold and (every few days) a crate. */
export function claimDaily(state: GameState, now = Date.now()): GameState {
  if (!dailyAvailable(state, now)) throw new Error("Come back tomorrow for the next daily reward.");
  const { gold, lunchboxes, streak } = dailyReward(state, now);
  return {
    ...state,
    gold: state.gold + gold,
    totalGoldEarned: state.totalGoldEarned + gold,
    lunchboxes: state.lunchboxes + lunchboxes,
    daily: { lastClaimDay: dayIndex(now), streak },
  };
}

/**
 * Grant an arbitrary reward bundle — the shared payout path for the day-69
 * streak jackpot and for completed Operator (Scrying Mirror) missions. Additive
 * and pure; gear/champions reuse the existing grant helpers.
 */
export function grantBundle(
  state: GameState,
  b: { gold?: number; lunchboxes?: number; gear?: string[]; champions?: number },
): GameState {
  let next: GameState = {
    ...state,
    gold: state.gold + (b.gold ?? 0),
    totalGoldEarned: state.totalGoldEarned + (b.gold ?? 0),
    lunchboxes: state.lunchboxes + (b.lunchboxes ?? 0),
  };
  for (const defId of b.gear ?? []) next = grantGearItem(next, defId);
  for (let i = 0; i < (b.champions ?? 0); i++) {
    next = { ...next, dwellers: [...next.dwellers, makeDweller("champion")] };
  }
  return next;
}

// ---------- equipment ----------

export function equipGear(state: GameState, dwellerId: string, gearItemId: string): GameState {
  const d = dwellerById(state, dwellerId);
  const item = state.gear.find((g) => g.id === gearItemId);
  if (!d || !item) throw new Error("Bad equip.");
  const def = GEAR_BY_ID[item.defId];
  const dwellers = state.dwellers.map((x) => {
    const eq = { ...x.equipped };
    // this item can only be worn by one hero — strip it off anyone else
    (["weapon", "armor", "mount"] as GearSlot[]).forEach((sl) => {
      if (eq[sl] === gearItemId) eq[sl] = null;
    });
    if (x.id === dwellerId) eq[def.slot] = gearItemId;
    return { ...x, equipped: eq };
  });
  return { ...state, dwellers };
}

export function unequipGear(state: GameState, dwellerId: string, slot: GearSlot): GameState {
  return {
    ...state,
    dwellers: state.dwellers.map((x) =>
      x.id === dwellerId ? { ...x, equipped: { ...x.equipped, [slot]: null } } : x,
    ),
  };
}

// ---------- lunchboxes (gacha) ----------

export type Pull =
  | { kind: "gold"; gold: number }
  | { kind: "gear"; item: GearItem; def: GearDef; rarity: Rarity }
  | { kind: "hero"; dweller: Dweller };

function rollRarity(): Rarity {
  const entries = Object.entries(RARITY_META) as [Rarity, { weight: number }][];
  const total = entries.reduce((s, [, m]) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const [rar, m] of entries) {
    r -= m.weight;
    if (r <= 0) return rar;
  }
  return "common";
}

export function openLunchbox(state: GameState): { state: GameState; pull: Pull } {
  if (state.lunchboxes <= 0) throw new Error("No lunchboxes to open.");
  const s: GameState = { ...state, lunchboxes: state.lunchboxes - 1 };
  const roll = Math.random();

  if (roll < 0.4) {
    const g = Math.floor((100 + Math.random() * 400) * (1 + state.totalBossWins * 0.5));
    return {
      state: { ...s, gold: s.gold + g, totalGoldEarned: s.totalGoldEarned + g },
      pull: { kind: "gold", gold: g },
    };
  }

  if (roll < 0.75) {
    const rar = rollRarity();
    const pool = GEAR_CATALOG.filter((g) => g.rarity === rar);
    const from = pool.length ? pool : GEAR_CATALOG;
    const def = from[Math.floor(Math.random() * from.length)];
    const item: GearItem = { id: uid("g"), defId: def.id };
    return {
      state: { ...s, gear: [...s.gear, item] },
      pull: { kind: "gear", item, def, rarity: def.rarity },
    };
  }

  const rr = Math.random();
  const tier: Tier =
    rr < 0.5 ? "recruit" : rr < 0.78 ? "spearman" : rr < 0.92 ? "archer" : rr < 0.985 ? "cavalry" : "champion";
  const dweller = makeDweller(tier);
  return { state: { ...s, dwellers: [...s.dwellers, dweller] }, pull: { kind: "hero", dweller } };
}

// ---------- arena (World Boss) ----------

export type FightResult = {
  damage: number;
  killed: boolean;
  reward: number;
  bossName: string;
  classEdge: number; // squad's class multiplier vs. the boss
  downed: string[]; // fighters the boss knocked out this swing
};

export function arenaSquad(state: GameState): Dweller[] {
  // rested, un-downed idle heroes — the ones actually able to swing
  return effectiveSquad(state).filter((d) => d.stamina >= STAMINA_PER_FIGHT);
}

export function arenaSquadPower(state: GameState): number {
  return squadPower(state, arenaSquad(state));
}

/** Squad's class multiplier vs. the current boss (shown in the Arena UI). */
export function arenaClassEdge(state: GameState): number {
  return squadClassEdge(state, arenaSquad(state), currentBoss(state).enemyClass);
}

export function currentBoss(state: GameState) {
  return BOSSES[Math.min(state.arena.bossIndex, BOSSES.length - 1)];
}

export function fightBoss(state: GameState, now = Date.now()): { state: GameState; result: FightResult } {
  if (now - state.arena.lastFightAt < FIGHT_COOLDOWN_MS) {
    throw new Error("The legion is regrouping — wait for the cooldown.");
  }
  const squad = arenaSquad(state);
  if (squad.length === 0) throw new Error("No rested heroes to send — they need stamina (rest in the Hall).");
  const power = arenaSquadPower(state);
  if (power <= 0) throw new Error("Your squad has no might.");

  const boss = currentBoss(state);
  // Class matchup swings the whole hit (melee ▶ ranged ▶ charge ▶ melee).
  const edge = squadClassEdge(state, squad, boss.enemyClass);
  const dmg = Math.floor(power * (0.8 + Math.random() * 0.6) * edge);
  const hp = state.arena.bossHp - dmg;
  let arena = { ...state.arena, lastFightAt: now };
  let s: GameState = state;
  let killed = false;
  let goldGain: number;

  if (hp <= 0) {
    killed = true;
    goldGain = boss.reward;
    const isLast = state.arena.bossIndex >= BOSSES.length - 1;
    const nextIndex = isLast ? state.arena.bossIndex : state.arena.bossIndex + 1;
    const nextBoss = BOSSES[nextIndex];
    const newHp = isLast
      ? Math.floor(nextBoss.baseHp * (1 + 0.5 * (state.arena.wins + 1)))
      : nextBoss.baseHp;
    arena = {
      ...arena,
      bossIndex: nextIndex,
      bossHp: newHp,
      wins: state.arena.wins + 1,
      rank: Math.max(1, state.arena.rank - 25),
    };
    s = { ...s, lunchboxes: s.lunchboxes + 1, totalBossWins: s.totalBossWins + 1 };
  } else {
    arena = { ...arena, bossHp: hp };
    goldGain = Math.floor(boss.reward * 0.02);
  }

  // The boss bites back: every swing costs stamina and draws blood. A fighter
  // whose class is countered soaks more — a downing carries them off until healed.
  const squadIds = new Set(squad.map((d) => d.id));
  const downed: string[] = [];
  const dwellers = s.dwellers.map((d) => {
    if (!squadIds.has(d.id)) return d;
    const max = dwellerMaxHp(d);
    const counter = classMultiplierVs(dwellerClass(d), boss.enemyClass);
    // being countered (counter<1) means you take MORE; countering them takes less
    const bite = boss.bite * (0.5 + Math.random() * 0.7) * (counter < 1 ? 1.4 : counter > 1 ? 0.7 : 1);
    const nextHp = Math.max(0, d.hp - bite * max);
    const stamina = Math.max(0, d.stamina - STAMINA_PER_FIGHT);
    if (nextHp <= 0) {
      downed.push(d.name);
      return { ...d, hp: 0, downed: true, stamina, roomId: null };
    }
    return { ...d, hp: nextHp, stamina };
  });
  // pull any downed fighters out of rooms (belt-and-suspenders; arena squad is idle)
  const downNames = new Set(downed);
  const downIds = new Set(dwellers.filter((d) => d.downed && downNames.has(d.name)).map((d) => d.id));
  const rooms = downIds.size
    ? s.rooms.map((r) => ({ ...r, workers: r.workers.filter((w) => !downIds.has(w)) }))
    : s.rooms;

  s = { ...s, arena, rooms, dwellers, gold: s.gold + goldGain, totalGoldEarned: s.totalGoldEarned + goldGain };
  // The squad bloods itself in the arena — every swing is XP, a kill is a windfall.
  s = applyXp(s, squad.map((d) => d.id), killed ? XP_FIGHT_KILL : XP_FIGHT);
  return { state: s, result: { damage: dmg, killed, reward: goldGain, bossName: boss.name, classEdge: edge, downed } };
}

// ---------- offline earnings (Fix #3) ----------

/**
 * Credit production for time the tab was closed. Unlike online storage (capped
 * per room), offline pays a direct lump at reduced efficiency up to a time cap —
 * the standard idle-game "welcome back" hook. We advance `lastTick` to now so a
 * following `tick()` can't double-count the same gap.
 */
export function applyOffline(state: GameState, now: number): GameState {
  const elapsed = Math.max(0, (now - state.lastTick) / 1000);
  // Short gap (or a rewound clock) → just tick normally, no report.
  if (elapsed < OFFLINE_MIN_SEC) return tick(state, now);

  const capped = Math.min(elapsed, OFFLINE_CAP_SEC);
  const stats = deriveStats(state);
  const gold = Math.floor(Math.max(0, stats.goldPerSec) * capped * OFFLINE_EFFICIENCY);
  const provisions = Math.floor(stats.provisionsPerSec * capped * OFFLINE_EFFICIENCY);
  const salves = Math.floor(Math.max(0, stats.salvesPerSec) * capped * OFFLINE_EFFICIENCY);

  // The Great Hall keeps raising recruits while you're away (if fed & housed).
  const hall = state.rooms.find((r) => r.type === "hall");
  let recruits = 0;
  if (hall && stats.fed) {
    const space = Math.max(0, maxPopulation(state) - state.dwellers.length);
    recruits = Math.min(space, Math.floor(0.04 * hall.level * capped * OFFLINE_EFFICIENCY));
  }
  // Everyone rests up while the tab is closed — stamina back to full.
  const dwellers = state.dwellers.map((d) => ({ ...d, stamina: MAX_STAMINA }));
  for (let i = 0; i < recruits; i++) dwellers.push(makeDweller("recruit"));

  // The vault keeps yielding while you're away (offline efficiency applies).
  const vaultGold = Math.floor(warChestYield(state) * capped * OFFLINE_EFFICIENCY);
  const warChest = {
    ...state.warChest,
    stored: Math.min(warChestStoreCap(state), state.warChest.stored + vaultGold),
    lastTick: now,
  };

  return {
    ...state,
    gold: state.gold + gold,
    totalGoldEarned: state.totalGoldEarned + gold,
    provisions: Math.max(0, state.provisions + provisions),
    salves: state.salves + salves,
    dwellers,
    warChest,
    // any incident would have been fought off long ago
    incident: state.incident && now >= state.incident.endsAt ? null : state.incident,
    offlineSummary: { seconds: Math.floor(capped), gold, provisions, salves, recruits },
    lastTick: now,
  };
}

export function clearOfflineSummary(state: GameState): GameState {
  return state.offlineSummary ? { ...state, offlineSummary: null } : state;
}

// ---------- persistence ----------

/** Small non-crypto hash (FNV-1a) — raises the bar on casual save edits. */
function signSave(json: string): string {
  let h = 0x811c9dc5;
  const s = json + SAVE_SALT;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();

    const outer = JSON.parse(raw) as { sig?: string; data?: string };
    let parsed: GameState;
    if (outer && typeof outer.data === "string" && typeof outer.sig === "string") {
      // Signed save — reject if the integrity signature doesn't match (Fix #5).
      if (signSave(outer.data) !== outer.sig) return createInitialState();
      parsed = JSON.parse(outer.data) as GameState;
    } else {
      // Legacy unsigned save — accept once; it re-saves signed on next write.
      parsed = outer as unknown as GameState;
    }

    if (!parsed || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.dwellers)) {
      return createInitialState();
    }
    // Merge over a fresh state so new fields (squad/renown/warChest/…) always exist.
    const base = createInitialState();
    const merged: GameState = {
      ...base,
      ...parsed,
      // Backfill new dweller stats (hp/stamina) on saves from before they existed.
      dwellers: parsed.dwellers.map((d) => {
        const withDefaults = {
          ...d,
          stamina: typeof d.stamina === "number" ? d.stamina : MAX_STAMINA,
          hp: typeof d.hp === "number" ? d.hp : 0,
        };
        const max = dwellerMaxHp(withDefaults);
        return {
          ...withDefaults,
          hp: withDefaults.hp > 0 ? Math.min(withDefaults.hp, max) : max,
        };
      }),
      warChest: parsed.warChest ?? base.warChest,
      daily: parsed.daily ?? base.daily,
      squad: Array.isArray(parsed.squad) ? parsed.squad : [],
      offlineSummary: null,
      raidReport: null,
      levelUps: [],
    };
    return applyOffline(merged, Date.now());
  } catch {
    return createInitialState();
  }
}

export function saveState(state: GameState) {
  try {
    // Never persist one-time UI events (offline report / raid report / level-ups).
    const data = JSON.stringify({ ...state, offlineSummary: null, raidReport: null, levelUps: [] });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sig: signSave(data), data }));
  } catch {
    // storage full / unavailable — ignore
  }
}

// ---------- formatting ----------

export function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1_000).toFixed(2)}k`;
  return Math.floor(n).toString();
}

export function tierName(tier: Tier): string {
  return TIERS[tier].name;
}

export function aptitudeName(a: Dweller["aptitude"]): string {
  return APTITUDE_LABEL[a];
}

export { TIER_ORDER };
