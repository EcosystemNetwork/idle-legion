import {
  APTITUDE_LABEL,
  MATCH_BONUS,
  MERCENARY_TIERS,
  RAIDS,
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
  IncidentKind,
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
    activeRaid: null,
    incident: null,
    warChestUsd: 0,
    mercenaryBoost: 0,
    fundedOnchain: false,
    lastFundTxId: null,
    totalRaids: 0,
    totalGoldEarned: 0,
    lastTick: now,
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

export function dwellerOutput(d: Dweller): number {
  return TIERS[d.tier].output * (1 + 0.12 * (d.level - 1));
}

export function dwellerMight(d: Dweller): number {
  return TIERS[d.tier].might * (1 + 0.1 * (d.level - 1));
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
    let o = dwellerOutput(d);
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
  for (const d of state.dwellers) might += dwellerMight(d);

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
        return dwellerOutput(b) - dwellerOutput(a);
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
    return sum + (d ? dwellerMight(d) : 0);
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
    dwellers: grantXp(state, state.activeRaid.squad, 40),
    activeRaid: null,
  };
}

export function raidSquadMight(state: GameState): number {
  return state.dwellers
    .filter((d) => d.roomId == null && !isOnRaid(state, d.id))
    .reduce((sum, d) => sum + dwellerMight(d), 0);
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
