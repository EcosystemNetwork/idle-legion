// The room visual-state system.
//
// ONE pure function turns a `Room` into everything the presentation layer needs:
// a primary state, a flag set, diegetic badges, and a bag of CSS custom
// properties. Nothing here imports React or touches the DOM, so the same
// descriptor drives the 2D Stronghold chambers, the 3D Kingdom buildings and
// (eventually) any minimap or notification surface — a new state is added once,
// here, and every surface picks it up.
//
// The rule that keeps this from rotting: components must never re-derive state
// from `Room` fields directly (`room.stored >= cap`, `workers.length === 0`, …).
// They read `visual.flags` / `visual.primary`. If a component needs a condition
// this module doesn't expose, the condition belongs in this module.
import {
  aptitudeMatches,
  dwellerById,
  isOnRaid,
  roomCapacity,
  roomPropBonuses,
  roomRate,
  roomStoreCap,
  upgradeCost,
  warChestStoreCap,
  RUSH_COOLDOWN_MS,
} from "./engine";
import { ROOMS } from "./config";
import { tierForLevel, type RoomTier } from "./rooms";
import type { DerivedStats, Dweller, GameState, Room, RoomType } from "./types";

/**
 * Every state a chamber can be in. Ordered loosely by severity — see
 * `PRIMARY_ORDER` for the actual precedence, which is what decides the room's
 * lighting and mood.
 */
export type RoomStateKey =
  | "locked" // not dug yet — a marked-out dig site
  | "incident" // on fire / caving in / overrun, right now
  | "upgrading" // masons are in, the chamber is being cut wider
  | "downed" // a worker is on the floor and not getting up
  | "injured" // a worker is bleeding but still swinging
  | "full" // storage capped — production has stopped
  | "damaged" // shaken by a recent rush or incident; dust still falling
  | "misstaffed" // staffed by the wrong aptitude — working at a penalty
  | "empty" // has slots, nobody in them
  | "understaffed" // some slots filled, some empty
  | "producing" // staffed and running
  | "starving" // the legion is out of provisions — output penalised
  | "idle"; // no production role at all (hall, war room, quarters)

/**
 * Precedence for the ONE state that owns the room's lighting, mood and
 * silhouette. Everything else in `flags` still renders as a badge, so no
 * information is lost by picking a single winner — this only decides what the
 * room *looks* like at a glance from across the screen.
 */
const PRIMARY_ORDER: RoomStateKey[] = [
  "locked",
  "incident",
  "upgrading",
  "downed",
  "full",
  "damaged",
  "misstaffed",
  "empty",
  "understaffed",
  "starving",
  "producing",
  "injured",
  "idle",
];

export type BadgeTone = "good" | "warn" | "bad" | "info";

/** A single diegetic marker hung on the chamber wall. */
export interface RoomBadge {
  key: string;
  icon: string;
  /** Short carved-sign text. Empty string = glyph only. */
  text: string;
  /** Full sentence for `title` / screen readers. */
  label: string;
  tone: BadgeTone;
  /** Urgent badges sway harder and get a rim light. */
  urgent?: boolean;
}

/**
 * How much visual machinery a room is allowed to run. Derived from state, not
 * from the quality tier — the quality tier scales it down separately.
 */
export interface RoomVisual {
  room: Room;
  type: RoomType;
  tier: RoomTier;
  primary: RoomStateKey;
  flags: Partial<Record<RoomStateKey, boolean>>;
  badges: RoomBadge[];

  // --- continuous channels (0..1 unless noted) ---
  /** Storage fullness — drives the physical pile of goods on the floor. */
  fill: number;
  /** How hard the room is working — drives worker cadence and machinery speed. */
  activity: number;
  /** Warmth/brightness of the room's light. */
  lightIntensity: number;
  /** Torch flicker period in seconds; incidents shorten it. */
  flickerSec: number;

  // --- raw numbers the UI still wants ---
  rate: number;
  stored: number;
  storeCap: number;
  capacity: number;
  workers: Dweller[];
  /** Workers whose aptitude matches the room's preferred one. */
  matched: number;
  upgradeCost: number;
  canAffordUpgrade: boolean;
  /** Trade goods this room's props unlock. */
  produces: string[];
  /** ms remaining on the "still shaken" window, 0 when clear. */
  shakenMs: number;
  /** ms remaining on the incident, 0 when clear. */
  incidentMs: number;
  /** Incident kind, for picking the right overlay (smoke / rubble / rats). */
  incidentKind: string | null;
}

/** Presentation-only: how long the masonry animation plays after an upgrade. */
export const UPGRADE_ANIM_MS = 4200;

/** Aptitude a room wants, or null if it doesn't care. */
export const roomAptitude = (type: RoomType) => ROOMS[type].aptitude;

/**
 * The whole system, in one pure call. `now` is passed in rather than read from
 * the clock so the caller's single animation-frame timestamp drives every room
 * identically — otherwise chambers drift a frame apart and timers disagree.
 */
export function deriveRoomVisual(
  state: GameState,
  room: Room,
  stats: DerivedStats,
  now: number,
): RoomVisual {
  const def = ROOMS[room.type];
  const isVault = room.type === "warchest";

  const capacity = roomCapacity(room, state);
  const storeCap = isVault ? warChestStoreCap(state) : roomStoreCap(room, state);
  const storedRaw = isVault ? state.warChest.stored : room.stored;
  const stored = Math.floor(storedRaw);
  const rate = roomRate(state, room, stats.fed);
  const fill = storeCap > 0 ? Math.min(1, storedRaw / storeCap) : 0;

  const workers = room.workers
    .map((id) => dwellerById(state, id))
    .filter((d): d is Dweller => Boolean(d));
  const matched = workers.filter((d) => aptitudeMatches(room, d)).length;
  const downed = workers.filter((d) => d.downed).length;
  const injured = workers.filter((d) => !d.downed && d.hp < 1).length;

  const incident = state.incident?.roomId === room.id ? state.incident : null;
  const incidentMs = incident ? Math.max(0, incident.endsAt - now) : 0;
  const shakenMs = incident
    ? 0
    : Math.max(0, RUSH_COOLDOWN_MS - (now - (room.rushAt ?? 0)));
  const upgradingMs = Math.max(0, UPGRADE_ANIM_MS - (now - (room.upgradedAt ?? 0)));

  const cost = upgradeCost(room);
  const bonuses = roomPropBonuses(state, room);

  // A room "produces" if it has a resource role at all. The vault is the odd one
  // out: it yields from staked USD, so it is never staffed and never misstaffed.
  const hasWorkSlots = capacity > 0;
  const isProducer = Boolean(def.produces) && !isVault;

  const flags: Partial<Record<RoomStateKey, boolean>> = {
    incident: Boolean(incident),
    upgrading: upgradingMs > 0,
    downed: downed > 0,
    injured: injured > 0,
    damaged: shakenMs > 0,
    full: storeCap > 0 && storedRaw >= storeCap,
    empty: hasWorkSlots && workers.length === 0,
    understaffed: hasWorkSlots && workers.length > 0 && workers.length < capacity,
    // "Wrong hands on the job" — only meaningful for a room that prefers an
    // aptitude AND has someone in it who doesn't have it.
    misstaffed:
      def.aptitude != null && workers.length > 0 && matched < workers.length,
    producing: rate > 0,
    starving: isProducer && !stats.fed && def.produces !== "provisions" && def.produces !== "salves",
    idle: !isProducer && !hasWorkSlots,
  };

  const primary = PRIMARY_ORDER.find((k) => flags[k]) ?? "idle";

  // Activity drives worker cadence. A half-staffed room should visibly move at
  // half pace rather than snapping between "still" and "flat out".
  const staffFrac = capacity > 0 ? workers.length / capacity : workers.length > 0 ? 1 : 0;
  const matchFrac = workers.length > 0 ? matched / workers.length : 0;
  let activity = 0;
  if (flags.incident || flags.downed || flags.full) activity = 0;
  else if (rate > 0) activity = clamp01(0.35 + 0.45 * staffFrac + 0.2 * matchFrac);
  else if (isVault && rate > 0) activity = 0.5;

  return {
    room,
    type: room.type,
    tier: tierForLevel(room.level),
    primary,
    flags,
    badges: badgesFor(flags, {
      matched,
      workers: workers.length,
      capacity,
      canAffordUpgrade: state.gold >= cost && !isVault,
      produces: bonuses.produces,
      aptitude: def.aptitude,
    }),
    fill,
    activity,
    lightIntensity: lightFor(primary, activity),
    flickerSec: flags.incident ? 0.32 : flags.damaged ? 1.4 : 4.2,
    rate,
    stored,
    storeCap,
    capacity,
    workers,
    matched,
    upgradeCost: cost,
    canAffordUpgrade: state.gold >= cost,
    produces: bonuses.produces,
    shakenMs,
    incidentMs,
    incidentKind: incident?.kind ?? null,
  };
}

/**
 * The dig-site descriptor for a room type the player hasn't built yet. Same
 * shape as a real room's visual so the grid can render locked and live chambers
 * through one component.
 */
export interface DigSiteVisual {
  type: RoomType;
  cost: number;
  affordable: boolean;
  /** Already built and unique — the slot is spent, not merely unaffordable. */
  taken: boolean;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** How bright the chamber burns. Trouble dims it; good work warms it up. */
function lightFor(primary: RoomStateKey, activity: number): number {
  switch (primary) {
    case "incident":
      return 1; // firelight, but the colour ramp turns it red
    case "upgrading":
      return 0.85;
    case "downed":
    case "damaged":
      return 0.32;
    case "empty":
    case "locked":
      return 0.22;
    case "full":
      return 0.7;
    case "misstaffed":
    case "understaffed":
      return 0.45 + activity * 0.25;
    default:
      return 0.4 + activity * 0.55;
  }
}

function badgesFor(
  flags: Partial<Record<RoomStateKey, boolean>>,
  ctx: {
    matched: number;
    workers: number;
    capacity: number;
    canAffordUpgrade: boolean;
    produces: string[];
    aptitude: string | null;
  },
): RoomBadge[] {
  const out: RoomBadge[] = [];
  const push = (b: RoomBadge) => out.push(b);

  if (flags.incident)
    push({ key: "incident", icon: "🔥", text: "", label: "Incident — this chamber is offline", tone: "bad", urgent: true });
  if (flags.downed)
    push({ key: "downed", icon: "⛑", text: "", label: "A worker is down and needs a salve", tone: "bad", urgent: true });
  if (flags.injured && !flags.downed)
    push({ key: "injured", icon: "🩸", text: "", label: "A worker is wounded but still working", tone: "warn" });
  if (flags.full)
    push({ key: "full", icon: "📦", text: "FULL", label: "Storage is full — production has stopped", tone: "warn", urgent: true });
  if (flags.damaged)
    push({ key: "damaged", icon: "🪨", text: "", label: "Shaken by a recent rush — still settling", tone: "warn" });
  if (flags.misstaffed)
    push({
      key: "misstaffed",
      icon: "⚠",
      text: `${ctx.matched}/${ctx.workers}`,
      label: "Wrong hands on the job — these workers lack the room's aptitude",
      tone: "warn",
    });
  if (flags.empty)
    push({ key: "empty", icon: "👤", text: "0", label: "Nobody is working this chamber", tone: "warn" });
  else if (flags.understaffed)
    push({ key: "understaffed", icon: "👥", text: `${ctx.workers}/${ctx.capacity}`, label: "Free work slots", tone: "info" });
  if (flags.starving)
    push({ key: "starving", icon: "🍖", text: "", label: "The legion is starving — output is halved", tone: "bad", urgent: true });
  if (flags.upgrading)
    push({ key: "upgrading", icon: "🧱", text: "", label: "Masons are cutting this chamber wider", tone: "info" });
  else if (ctx.canAffordUpgrade)
    push({ key: "upgradeReady", icon: "▲", text: "", label: "You can afford to upgrade this chamber", tone: "good" });
  for (const good of ctx.produces)
    push({ key: `good-${good}`, icon: "⚗", text: good, label: `This chamber can make ${good}`, tone: "good" });

  return out;
}

// ---------------------------------------------------------------------------
// Kingdom buildings — the same idea, one level up.
// ---------------------------------------------------------------------------

/**
 * What a building on the Kingdom map is doing, from the surface. Deliberately
 * coarser than `RoomStateKey`: at map scale the player needs "can I go there",
 * "is something waiting for me" and "is something wrong", not a staffing audit.
 */
export type BuildingStateKey = "locked" | "quiet" | "active" | "ready" | "danger";

export interface BuildingVisual {
  id: string;
  state: BuildingStateKey;
  /** 0..1 — how much smoke/motion the building shows. */
  activity: number;
  /** Something is collectable or claimable inside. */
  ready: boolean;
  /** Incident, starvation, or downed legionaries inside. */
  danger: boolean;
  /** Short diegetic reason, shown on hover. */
  note: string;
}

/**
 * Roll the whole stronghold up into per-building map state. Building ids match
 * `BUILDINGS` in three/kingdom.ts, which match App's tab ids.
 */
export function deriveBuildingVisuals(
  state: GameState,
  stats: DerivedStats,
  unlocked: (id: string) => boolean,
  now: number,
): Record<string, BuildingVisual> {
  const roomsOf = (...types: RoomType[]) =>
    state.rooms.filter((r) => types.includes(r.type));

  const anyReady = (types: RoomType[]) =>
    roomsOf(...types).some((r) => r.stored >= 1);
  const anyStaffed = (types: RoomType[]) =>
    roomsOf(...types).some((r) => r.workers.length > 0);

  const incidentIn = (types: RoomType[]) =>
    Boolean(state.incident && roomsOf(...types).some((r) => r.id === state.incident!.roomId));

  const make = (
    id: string,
    opts: { active: boolean; ready: boolean; danger: boolean; activity?: number; note?: string },
  ): BuildingVisual => {
    const locked = !unlocked(id);
    const state_: BuildingStateKey = locked
      ? "locked"
      : opts.danger
        ? "danger"
        : opts.ready
          ? "ready"
          : opts.active
            ? "active"
            : "quiet";
    return {
      id,
      state: state_,
      activity: locked ? 0 : (opts.activity ?? (opts.active ? 0.7 : 0.15)),
      ready: !locked && opts.ready,
      danger: !locked && opts.danger,
      note: locked ? "under construction" : (opts.note ?? ""),
    };
  };

  const deepTypes: RoomType[] = ["mine", "granary", "forge", "infirmary"];
  const raidOut = Boolean(state.activeRaid && state.activeRaid.endsAt > now);

  return {
    stronghold: make("stronghold", {
      active: anyStaffed(deepTypes),
      ready: anyReady(deepTypes),
      danger: incidentIn(deepTypes) || !stats.fed,
      activity: clamp01(stats.goldPerSec > 0 ? 0.5 + Math.min(0.5, stats.goldPerSec / 40) : 0.1),
      note: !stats.fed ? "the legion is starving" : anyReady(deepTypes) ? "goods waiting" : "",
    }),
    legion: make("legion", {
      active: stats.population > 0,
      ready: stats.idleCount > 0,
      danger: stats.woundedCount > 0,
      note: stats.woundedCount > 0 ? `${stats.woundedCount} wounded` : "",
    }),
    raids: make("raids", {
      active: raidOut,
      ready: Boolean(state.raidReport) || (state.activeRaid != null && !raidOut),
      danger: false,
      note: raidOut ? "a raid is out" : "",
    }),
    arena: make("arena", {
      active: true,
      ready: state.lunchboxes > 0,
      danger: false,
      note: state.lunchboxes > 0 ? "crates unopened" : "",
    }),
    market: make("market", {
      active: state.market.length > 0,
      ready: state.warChest.stored >= 1,
      danger: false,
      note: state.warChest.stored >= 1 ? "vault yield waiting" : "",
    }),
    codex: make("codex", { active: true, ready: false, danger: false }),
  };
}
