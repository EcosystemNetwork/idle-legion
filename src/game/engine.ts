import {
  APTITUDE_LABEL,
  BOSSES,
  FIGHT_COOLDOWN_MS,
  GEAR_BY_ID,
  GEAR_CATALOG,
  GEAR_SELL_VALUE,
  MATCH_BONUS,
  MERCENARY_TIERS,
  RAIDS,
  RARITY_META,
  ROOMS,
  STARVING_PENALTY,
  STORAGE_KEY,
  TIERS,
  TIER_ORDER,
  UPKEEP_PER_DWELLER,
  randomName,
} from "./config";
import type {
  Dweller,
  DerivedStats,
  GameState,
  GearDef,
  GearItem,
  GearSlot,
  IncidentKind,
  MarketOffer,
  Objective,
  ObjectiveKind,
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

export function makeDweller(tier: Tier): Dweller {
  const def = TIERS[tier];
  return {
    id: uid("d"),
    tier,
    name: randomName(),
    aptitude: def.aptitude,
    level: 1,
    xp: 0,
    roomId: null,
    equipped: { weapon: null, armor: null, mount: null },
  };
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
  const hall = makeRoom("hall");
  const mine = makeRoom("mine");
  const warchest = makeRoom("warchest");
  // Staff the starter mine with the two recruits so gold flows immediately.
  mine.workers = [dwellers[0].id, dwellers[1].id];
  dwellers[0].roomId = mine.id;
  dwellers[1].roomId = mine.id;

  return {
    gold: 80,
    provisions: 120,
    rooms: [hall, mine, warchest],
    dwellers,
    market: rollMarket(),
    gear: [],
    lunchboxes: 2, // starter crates to try the gacha
    objectives: defaultObjectives(),
    arena: { bossIndex: 0, bossHp: BOSSES[0].baseHp, rank: 999, wins: 0, lastFightAt: 0 },
    activeRaid: null,
    incident: null,
    warChestUsd: 0,
    mercenaryBoost: 0,
    fundedOnchain: false,
    lastFundTxId: null,
    totalRaids: 0,
    totalGoldEarned: 0,
    totalBossWins: 0,
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
  ];
}

export function objectiveProgress(state: GameState, o: Objective): number {
  switch (o.kind) {
    case "gold": return Math.floor(state.totalGoldEarned);
    case "raids": return state.totalRaids;
    case "legion": return state.dwellers.length;
    case "might": return Math.floor(deriveStats(state).might);
    case "boss": return state.totalBossWins;
  }
}

export function objectiveLabel(o: Objective): string {
  switch (o.kind) {
    case "gold": return `Earn ${formatNum(o.target)} total gold`;
    case "raids": return `Win ${o.target} raid${o.target > 1 ? "s" : ""}`;
    case "legion": return `Field a legion of ${o.target}`;
    case "might": return `Reach ${o.target} might`;
    case "boss": return `Defeat ${o.target} arena boss${o.target > 1 ? "es" : ""}`;
  }
}

export function claimObjective(state: GameState, objId: string): GameState {
  const o = state.objectives.find((x) => x.id === objId);
  if (!o) return state;
  if (objectiveProgress(state, o) < o.target) throw new Error("Objective not complete yet.");
  // advance: replace with a harder objective of a rotating kind
  const kinds: ObjectiveKind[] = ["gold", "raids", "legion", "might", "boss"];
  const nextKind = kinds[(kinds.indexOf(o.kind) + 1) % kinds.length];
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

function gearBonus(state: GameState, d: Dweller): { might: number; output: number } {
  let might = 0;
  let output = 0;
  for (const g of equippedGearDefs(state, d)) {
    might += g.might;
    output += g.output;
  }
  return { might, output };
}

export function dwellerOutput(d: Dweller, state: GameState): number {
  const base = TIERS[d.tier].output * (1 + 0.12 * (d.level - 1));
  return base + gearBonus(state, d).output;
}

export function dwellerMight(d: Dweller, state: GameState): number {
  const base = TIERS[d.tier].might * (1 + 0.1 * (d.level - 1));
  return base + gearBonus(state, d).might;
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

/** Live per-second output of a room (gold / provisions / might), boosts applied. */
export function roomRate(state: GameState, room: Room, fed: boolean): number {
  const def = ROOMS[room.type];
  if (!def.produces) return 0;
  if (state.incident?.roomId === room.id) return 0; // room offline during incident
  let rate = 0;
  for (const wid of room.workers) {
    const d = dwellerById(state, wid);
    if (!d) continue;
    let o = dwellerOutput(d, state);
    if (def.aptitude && d.aptitude === def.aptitude) o *= 1 + MATCH_BONUS;
    rate += o;
  }
  rate *= 1 + state.mercenaryBoost;
  // Starving hurts mining & forging, but NOT hunting (so the vault can recover).
  if (!fed && def.produces !== "provisions") rate *= STARVING_PENALTY;
  return rate;
}

export function deriveStats(state: GameState): DerivedStats {
  const fed = state.provisions > 0;
  const population = state.dwellers.length;
  const idleCount = state.dwellers.filter(
    (d) => d.roomId == null && !isOnRaid(state, d.id),
  ).length;

  let goldPerSec = 0;
  let provGross = 0;
  let forgeMight = 0;
  for (const room of state.rooms) {
    const def = ROOMS[room.type];
    if (def.produces === "gold") goldPerSec += roomRate(state, room, fed);
    else if (def.produces === "provisions") provGross += roomRate(state, room, fed);
    else if (def.produces === "might") forgeMight += roomRate(state, room, fed);
  }

  let might = forgeMight;
  for (const d of state.dwellers) might += dwellerMight(d, state);

  const provisionsPerSec = provGross - population * UPKEEP_PER_DWELLER;

  return { might, goldPerSec, provisionsPerSec, population, idleCount, fed };
}

// ---------- tick ----------

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
  return { ...state, dwellers: [...state.dwellers, makeDweller(tier)] };
}

export function grantGearItem(state: GameState, defId: string): GameState {
  if (!GEAR_BY_ID[defId]) return state;
  return { ...state, gear: [...state.gear, { id: uid("g"), defId }] };
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
      .filter((d) => d.roomId == null && !isOnRaid(next, d.id))
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

function grantXp(state: GameState, ids: string[], amount: number): Dweller[] {
  return state.dwellers.map((d) => {
    if (!ids.includes(d.id)) return d;
    let level = d.level;
    let xp = d.xp + amount;
    let need = level * 100;
    while (xp >= need) {
      xp -= need;
      level += 1;
      need = level * 100;
    }
    return { ...d, level, xp };
  });
}

export function collectRoom(state: GameState, roomId: string): GameState {
  const room = roomById(state, roomId);
  if (!room) return state;
  const def = ROOMS[room.type];
  const amount = Math.floor(room.stored);
  if (amount <= 0) return state;
  const patch: Partial<GameState> = {};
  if (def.produces === "gold") {
    patch.gold = state.gold + amount;
    patch.totalGoldEarned = state.totalGoldEarned + amount;
  } else if (def.produces === "provisions") {
    patch.provisions = state.provisions + amount;
  }
  return {
    ...state,
    ...patch,
    rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, stored: 0 } : r)),
    dwellers: grantXp(state, room.workers, 8),
  };
}

export function collectAll(state: GameState): GameState {
  let next = state;
  for (const r of state.rooms) {
    if (roomStoreCap(r) > 0 && r.stored >= 1) next = collectRoom(next, r.id);
  }
  return next;
}

const INCIDENT_LABELS: Record<IncidentKind, string> = {
  raiders: "Raiders broke in!",
  cavein: "Cave-in!",
  vermin: "Cave vermin infestation!",
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

  // Squad = all idle dwellers (pulled off the Hall bench).
  const squad = state.dwellers
    .filter((d) => d.roomId == null && !isOnRaid(state, d.id))
    .map((d) => d.id);
  if (squad.length === 0) {
    throw new Error("No idle dwellers to send — unassign some legion first.");
  }
  const might = squad.reduce((sum, id) => {
    const d = dwellerById(state, id);
    return sum + (d ? dwellerMight(d, state) : 0);
  }, 0);
  if (might < mission.minMight) {
    throw new Error(
      `Squad might ${Math.floor(might)} < ${mission.minMight}. Send stronger dwellers.`,
    );
  }
  return {
    ...state,
    activeRaid: {
      missionId,
      squad,
      startedAt: now,
      endsAt: now + mission.durationSec * 1000,
    },
  };
}

export function claimRaid(state: GameState, now = Date.now()): GameState {
  if (!state.activeRaid) throw new Error("No raid to claim.");
  if (now < state.activeRaid.endsAt) throw new Error("The squad is still marching.");
  const mission = RAIDS.find((m) => m.id === state.activeRaid!.missionId);
  if (!mission) throw new Error("Unknown mission.");
  const reward = Math.floor(mission.goldReward * (1 + state.mercenaryBoost * 0.5));
  return {
    ...state,
    gold: state.gold + reward,
    totalGoldEarned: state.totalGoldEarned + reward,
    totalRaids: state.totalRaids + 1,
    lunchboxes: state.lunchboxes + 1, // raids drop a lunchbox
    dwellers: grantXp(state, state.activeRaid.squad, 40),
    activeRaid: null,
  };
}

export function raidSquadMight(state: GameState): number {
  return state.dwellers
    .filter((d) => d.roomId == null && !isOnRaid(state, d.id))
    .reduce((sum, d) => sum + dwellerMight(d, state), 0);
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

export type FightResult = { damage: number; killed: boolean; reward: number; bossName: string };

export function arenaSquad(state: GameState): Dweller[] {
  return state.dwellers.filter((d) => d.roomId == null && !isOnRaid(state, d.id));
}

export function arenaSquadPower(state: GameState): number {
  return arenaSquad(state).reduce((s, d) => s + dwellerMight(d, state), 0);
}

export function currentBoss(state: GameState) {
  return BOSSES[Math.min(state.arena.bossIndex, BOSSES.length - 1)];
}

export function fightBoss(state: GameState, now = Date.now()): { state: GameState; result: FightResult } {
  if (now - state.arena.lastFightAt < FIGHT_COOLDOWN_MS) {
    throw new Error("The legion is regrouping — wait for the cooldown.");
  }
  const squad = arenaSquad(state);
  if (squad.length === 0) throw new Error("No idle heroes to send to the arena.");
  const power = arenaSquadPower(state);
  if (power <= 0) throw new Error("Your squad has no might.");

  const boss = currentBoss(state);
  const dmg = Math.floor(power * (0.8 + Math.random() * 0.6));
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

  s = { ...s, arena, gold: s.gold + goldGain, totalGoldEarned: s.totalGoldEarned + goldGain };
  return { state: s, result: { damage: dmg, killed, reward: goldGain, bossName: boss.name } };
}

// ---------- persistence ----------

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.dwellers)) {
      return createInitialState();
    }
    return tick({ ...createInitialState(), ...parsed }, Date.now());
  } catch {
    return createInitialState();
  }
}

export function saveState(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
