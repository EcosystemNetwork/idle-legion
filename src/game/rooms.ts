// The ludus: room tiers, floor space, and the props that fill them.
//
// A chamber starts as a raw hole in the rock and earns its way up to a Mythic
// hall. Tier does NOT paint a new picture of the room — it buys FLOOR SPACE,
// and floor space is spent on props: an anvil, a mutagen vat, a caged beast.
// That single number is what makes "I caught something huge, move the gear out"
// a real decision instead of a special case.
//
// Props are the social layer too. A few of them don't buff a number, they
// UNLOCK a trade good (see `produces`) that nobody without that prop can make —
// so one lucky drop turns a player into their circle's supplier. Scarcity of
// the machine, not the item.
//
// This module is deliberately free of engine/UI imports: it is pure data plus
// pure functions over that data, so it can be unit-tested and reasoned about
// without booting a game state.
// `PropItem` lives in types.ts (like OnchainListing) so GameState can reference
// an owned prop without types.ts having to import this module back.
import type { PropItem, Rarity, RoomType } from "./types";

// BASE_URL keeps paths correct under the GitHub Pages /idle-legion/ prefix.
const B = import.meta.env.BASE_URL;

// ---------- tiers ------------------------------------------------------------

/** 1 = freshly dug, 5 = Mythic. Shares the rarity ladder's shape on purpose. */
export type RoomTier = 1 | 2 | 3 | 4 | 5;
export const MAX_ROOM_TIER: RoomTier = 5;

export interface RoomTierDef {
  tier: RoomTier;
  name: string;
  /** Total prop capacity at this tier. Everything placed here spends from it. */
  floorSpace: number;
  /** Lets prop rarity and room tier speak the same language in the UI. */
  rarity: Rarity;
  blurb: string;
}

export const ROOM_TIERS: Record<RoomTier, RoomTierDef> = {
  1: { tier: 1, name: "Dug", floorSpace: 4, rarity: "common", blurb: "A hole in the rock. Dirt floor, one guttering torch, and ambition." },
  2: { tier: 2, name: "Fitted", floorSpace: 7, rarity: "uncommon", blurb: "Shored timber and a level floor. It functions. Nobody writes songs about it." },
  3: { tier: 3, name: "Ornate", floorSpace: 10, rarity: "rare", blurb: "Cut stone, hung banners, a chamber that looks like it means to stay." },
  4: { tier: 4, name: "Gilded", floorSpace: 14, rarity: "epic", blurb: "Gold leaf in the joins. Rivals send people to look at it." },
  5: { tier: 5, name: "Mythic", floorSpace: 20, rarity: "legendary", blurb: "A hall the Empire will remember. Kekius has heard of this room." },
};

export const floorSpaceFor = (tier: RoomTier): number => ROOM_TIERS[tier].floorSpace;

/**
 * Tier is DERIVED from room level rather than being a second upgrade track.
 * Levelling already has costs, rush timers and UI; bolting a parallel ladder
 * onto it would mean two things to grind for one visible outcome. Hitting a
 * threshold is the moment the chamber visibly grows.
 */
export const TIER_MIN_LEVEL: Record<RoomTier, number> = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 };

export function tierForLevel(level: number): RoomTier {
  if (level >= TIER_MIN_LEVEL[5]) return 5;
  if (level >= TIER_MIN_LEVEL[4]) return 4;
  if (level >= TIER_MIN_LEVEL[3]) return 3;
  if (level >= TIER_MIN_LEVEL[2]) return 2;
  return 1;
}

/** Levels remaining until the next tier, or null if already Mythic. */
export function levelsToNextTier(level: number): { next: RoomTier; levels: number } | null {
  const tier = tierForLevel(level);
  if (tier >= MAX_ROOM_TIER) return null;
  const next = (tier + 1) as RoomTier;
  return { next, levels: TIER_MIN_LEVEL[next] - level };
}

/**
 * Art for a chamber. Tiers 1-4 share three reusable "shell" plates — a raw hole
 * looks the same whatever it's destined to become, and props do the
 * differentiating. Tier 5 swaps to a bespoke plate as the payoff reveal.
 */
export type ShellSize = "small" | "medium" | "large";
export const SHELL_ART: Record<ShellSize, string> = {
  small: `${B}art/shell-small.webp`,
  medium: `${B}art/shell-medium.webp`,
  large: `${B}art/shell-large.webp`,
};

/** Which shell a room type uses before it goes Mythic. */
export const ROOM_SHELL: Record<RoomType, ShellSize> = {
  quarters: "medium",
  hall: "large",
  mine: "large",
  granary: "large",
  infirmary: "medium",
  forge: "medium",
  warroom: "small",
  portal: "small",
  warchest: "small",
};

/** Bespoke Mythic plate per room. `null` = not drawn yet, fall back to shell. */
export const MYTHIC_ART: Partial<Record<RoomType, string>> = {
  granary: `${B}art/room-granary.png`,
  infirmary: `${B}art/kit/int-infirmary.png`,
  portal: `${B}art/kit/int-portal.png`,
};

/** Resolve the backdrop for a room at a given tier. */
export function roomArt(type: RoomType, tier: RoomTier): string {
  if (tier >= MAX_ROOM_TIER) {
    const mythic = MYTHIC_ART[type];
    if (mythic) return mythic;
  }
  return SHELL_ART[ROOM_SHELL[type]];
}

// ---------- props ------------------------------------------------------------

/**
 * What a prop is FOR. The split matters: production apparatus feeds the
 * economy, training apparatus feeds the arena, housing is dead weight that
 * exists to hold a beast, and trophies are pure flex (with a morale kicker).
 */
export type PropFamily = "production" | "training" | "housing" | "trophy";

/** Floor space a prop consumes. Small / medium / large. */
export type PropSize = 1 | 2 | 4;

/**
 * Trade goods exist ONLY as prop output. You cannot buy the good into
 * existence — you buy it from whoever owns the machine. That is the entire
 * networking hook, so keep this list short and keep every entry consumed on
 * use, or demand dies the moment supply catches up.
 */
export type TradeGood = "mutagen" | "ichor" | "emberfat";

export interface PropEffect {
  /** Multiplier on the room's resource output. 0.15 = +15%. */
  produceMult?: number;
  /** Extra worker slots. */
  capacity?: number;
  /** Multiplier on the room's storage cap. */
  storeMult?: number;
  /** Multiplier on training rate for fighters/beasts stationed here. */
  trainRate?: number;
  /** Flat might added to every fighter stationed in this room. */
  mightFlat?: number;
}

export interface PropDef {
  id: string;
  name: string;
  art: string;
  family: PropFamily;
  size: PropSize;
  rarity: Rarity;
  /** Rooms where this prop is on-theme. Placing it elsewhere is allowed but weakened. */
  rooms: RoomType[];
  effect: PropEffect;
  /** If set, this prop unlocks production of a trade good no one else can make. */
  produces?: TradeGood;
  description: string;
}

/**
 * Off-theme placement penalty. Free placement is the fun answer (put the anvil
 * wherever you like) but it needs a cost or theme becomes meaningless.
 */
export const OFF_THEME_MULT = 0.5;

const P = (f: string) => `${B}art/prop/${f}.webp`;

export const PROP_CATALOG: PropDef[] = [
  // ---- forge: production ----
  { id: "anvil", name: "Scarred Anvil", art: P("anvil"), family: "production", size: 2, rarity: "common", rooms: ["forge"], effect: { produceMult: 0.15 }, description: "Won off a smith who bet it on a bout he did not win. Every dent is somebody's bad idea." },
  { id: "bloomery", name: "Bloomery", art: P("bloomery"), family: "production", size: 4, rarity: "rare", rooms: ["forge"], effect: { produceMult: 0.35, storeMult: 0.2 }, description: "Eats scrap, breathes fire, spits billet. The heart of any forge worth the name." },
  { id: "quench-trough", name: "Quench Trough", art: P("quench-trough"), family: "production", size: 1, rarity: "common", rooms: ["forge"], effect: { produceMult: 0.08 }, description: "Cold water, hot steel, and the hiss that tells a war-hand the temper took." },
  { id: "grindstone", name: "Grindstone", art: P("grindstone"), family: "production", size: 1, rarity: "uncommon", rooms: ["forge"], effect: { produceMult: 0.12 }, description: "Puts the edge back on. Takes a fingertip a season as its fee." },
  { id: "emberfat-crucible", name: "Emberfat Crucible", art: P("emberfat-crucible"), family: "production", size: 4, rarity: "legendary", rooms: ["forge"], effect: { produceMult: 0.25 }, produces: "emberfat", description: "Renders beast-tallow into emberfat — the only thing that will quench a mutated blade. Whoever owns one, owns the smiths." },

  // ---- granary: production ----
  { id: "amphora-rack", name: "Amphora Rack", art: P("amphora-rack"), family: "production", size: 2, rarity: "common", rooms: ["granary"], effect: { storeMult: 0.3 }, description: "Stacked three high and roped, because the fourth row taught everyone a lesson." },
  { id: "grain-sacks", name: "Grain Stacks", art: P("grain-sacks"), family: "production", size: 1, rarity: "common", rooms: ["granary"], effect: { storeMult: 0.15 }, description: "Hopium, milled and bagged. The legion runs on it and pretends otherwise." },
  { id: "scales", name: "Quartermaster's Scales", art: P("scales"), family: "production", size: 1, rarity: "uncommon", rooms: ["granary", "warchest"], effect: { produceMult: 0.1 }, description: "Weighted slightly in the house's favour. Everyone knows. Nobody says." },
  { id: "hopium-still", name: "Hopium Still", art: P("hopium-still"), family: "production", size: 4, rarity: "epic", rooms: ["granary"], effect: { produceMult: 0.3, storeMult: 0.2 }, description: "Distils grain into something that makes a losing season feel survivable." },

  // ---- infirmary: production ----
  { id: "cot-row", name: "Cot Row", art: P("cot-row"), family: "production", size: 2, rarity: "common", rooms: ["infirmary"], effect: { capacity: 1, produceMult: 0.1 }, description: "Carved frames, green ticking. Most who lie here get up again." },
  { id: "apothecary-shelf", name: "Apothecary Shelf", art: P("apothecary-shelf"), family: "production", size: 1, rarity: "uncommon", rooms: ["infirmary"], effect: { produceMult: 0.15 }, description: "Two hundred jars, forty labels, one medic who claims to remember the rest." },
  { id: "herb-rack", name: "Herb-Drying Rack", art: P("herb-rack"), family: "production", size: 1, rarity: "common", rooms: ["infirmary", "granary"], effect: { produceMult: 0.08 }, description: "Bundles hung to cure. The whole chamber smells like a field that got away with it." },
  { id: "mutagen-vat", name: "Mutagen Vat", art: P("mutagen-vat"), family: "production", size: 4, rarity: "legendary", rooms: ["infirmary", "portal"], effect: { produceMult: 0.2 }, produces: "mutagen", description: "Pre-Rug bio-slurry, still warm. Makes mutagen — the reagent every high-tier blade and every spliced beast needs. There is no other source." },

  // ---- mine: production ----
  { id: "ore-cart", name: "Ore Cart", art: P("ore-cart"), family: "production", size: 1, rarity: "common", rooms: ["mine"], effect: { storeMult: 0.2 }, description: "Squeals on the down-run, screams on the up. The deep's only honest alarm." },
  { id: "pit-props", name: "Pit Props", art: P("pit-props"), family: "production", size: 1, rarity: "common", rooms: ["mine"], effect: { capacity: 1 }, description: "Timber against the weight of the mountain. Cheap, and the reason anyone comes back up." },
  { id: "ichor-tap", name: "Ichor Tap", art: P("ichor-tap"), family: "production", size: 4, rarity: "legendary", rooms: ["mine"], effect: { produceMult: 0.25 }, produces: "ichor", description: "Sunk into a vein that still glows with pre-Rug value. Draws ichor. The Empire would very much like to know you have this." },

  // ---- training ----
  { id: "pell", name: "Training Pell", art: P("pell"), family: "training", size: 1, rarity: "common", rooms: ["forge", "quarters"], effect: { trainRate: 0.15 }, description: "A post, chest-high, hacked to splinters. Where every champion started." },
  { id: "sand-pit", name: "Sand Pit", art: P("sand-pit"), family: "training", size: 4, rarity: "uncommon", rooms: ["quarters", "hall"], effect: { trainRate: 0.3, mightFlat: 2 }, description: "Raked each dawn. By dusk you can read the whole session in the drag marks." },
  { id: "weapon-rack", name: "Weapon Rack", art: P("weapon-rack"), family: "training", size: 1, rarity: "uncommon", rooms: ["forge", "quarters"], effect: { mightFlat: 3 }, description: "Everything sharp, everything counted. The count is done twice." },
  { id: "sparring-dummy", name: "Sparring Dummy", art: P("sparring-dummy"), family: "training", size: 2, rarity: "rare", rooms: ["quarters", "hall"], effect: { trainRate: 0.25, mightFlat: 2 }, description: "Weighted, jointed, and wearing a rival dynasty's colours. Morale is a training stat." },

  // ---- housing ----
  { id: "beast-cage", name: "Beast Cage", art: P("beast-cage"), family: "housing", size: 4, rarity: "uncommon", rooms: ["hall", "quarters"], effect: {}, description: "Iron, and then more iron. Holds one thing that would rather be elsewhere." },
  { id: "feed-trough", name: "Feed Trough", art: P("feed-trough"), family: "housing", size: 1, rarity: "common", rooms: ["hall", "granary"], effect: { trainRate: 0.1 }, description: "A fed monster trains. A hungry one negotiates." },

  // ---- trophies (placeable anywhere, on-theme everywhere) ----
  { id: "kek-banner", name: "Kek Banner", art: P("kek-banner"), family: "trophy", size: 1, rarity: "common", rooms: [], effect: { produceMult: 0.05 }, description: "Green and gold, hung from the vault. Rally point, and a reminder of whose Empire this is." },
  { id: "brazier", name: "Bronze Brazier", art: P("brazier"), family: "trophy", size: 1, rarity: "common", rooms: [], effect: { produceMult: 0.04 }, description: "Light enough to work by, warm enough to argue by." },
  { id: "floor-mosaic", name: "Floor Mosaic", art: P("floor-mosaic"), family: "trophy", size: 2, rarity: "rare", rooms: [], effect: { produceMult: 0.1, trainRate: 0.05 }, description: "The Kek sigil set in tile. Laid by a captive who signed it in the border, very small." },
  { id: "gladiator-laurel", name: "Gilded Laurel", art: P("gladiator-laurel"), family: "trophy", size: 1, rarity: "epic", rooms: [], effect: { trainRate: 0.15, mightFlat: 2 }, description: "Taken from a champion's head in the Colosseum. He is still alive. He is still asking about it." },
  { id: "champions-helm", name: "Champion's Helm", art: P("champions-helm"), family: "trophy", size: 1, rarity: "epic", rooms: [], effect: { mightFlat: 5 }, description: "Crested, dented at the temple, never repaired. The dent is the point." },
  { id: "chained-skull", name: "Chained Skull", art: P("chained-skull"), family: "trophy", size: 1, rarity: "rare", rooms: [], effect: { mightFlat: 3 }, description: "Something enormous, hung where the new-blood have to walk under it daily." },
  { id: "victory-standard", name: "Victory Standard", art: P("victory-standard"), family: "trophy", size: 2, rarity: "legendary", rooms: [], effect: { produceMult: 0.12, trainRate: 0.12, mightFlat: 4 }, description: "Awarded by Kekius Maximus himself, in front of everyone. That is most of its value." },
  { id: "statue", name: "Emperor's Likeness", art: P("statue"), family: "trophy", size: 4, rarity: "legendary", rooms: [], effect: { produceMult: 0.15, mightFlat: 3 }, description: "Carved to flatter. Placed so it watches the door, which was the sculptor's own idea." },
];

export const PROP_BY_ID: Record<string, PropDef> = Object.fromEntries(
  PROP_CATALOG.map((p) => [p.id, p]),
);

// ---------- beasts -----------------------------------------------------------

/**
 * A captured beast is housed in a room and eats floor space to do it — the
 * bigger the catch, the more you have to clear out to keep it. Beasts are
 * fighters (same roster, same stats, same XP) that cannot equip gear, so
 * everything already built for gladiators applies to them unchanged.
 */
export const BEAST_SPACE: Record<Rarity, number> = {
  common: 6,
  uncommon: 7,
  rare: 8,
  epic: 9,
  legendary: 10,
};

export const beastSpace = (rarity: Rarity): number => BEAST_SPACE[rarity];

// ---------- placement --------------------------------------------------------

/** Everything currently occupying one room's floor. */
export interface RoomOccupancy {
  props: PropItem[];
  /** Rarities of beasts housed here — each costs BEAST_SPACE. */
  beasts: Rarity[];
}

export const EMPTY_OCCUPANCY: RoomOccupancy = { props: [], beasts: [] };

/**
 * Occupancy is DERIVED, never stored — props and beasts each already know the
 * room they're in, so there is no second copy of the truth to keep in sync.
 * The beast argument is structurally typed so this module needn't know about
 * `Dweller`.
 */
export function occupancyFrom(
  roomId: string,
  props: PropItem[],
  beasts: { roomId: string | null; rarity?: Rarity }[],
): RoomOccupancy {
  return {
    props: props.filter((p) => p.roomId === roomId),
    beasts: beasts.filter((b) => b.roomId === roomId).map((b) => b.rarity ?? "common"),
  };
}

/** Floor space currently spent in a room. */
export function usedSpace(occ: RoomOccupancy): number {
  const fromProps = occ.props.reduce((sum, p) => sum + (PROP_BY_ID[p.defId]?.size ?? 0), 0);
  const fromBeasts = occ.beasts.reduce((sum, r) => sum + beastSpace(r), 0);
  return fromProps + fromBeasts;
}

export const freeSpace = (occ: RoomOccupancy, tier: RoomTier): number =>
  Math.max(0, floorSpaceFor(tier) - usedSpace(occ));

export type PlaceResult =
  | { ok: true; cost: number; onTheme: boolean }
  | { ok: false; reason: "no-such-prop" | "no-space"; needed: number; free: number };

/**
 * Can this prop go in this room right now? Off-theme is allowed on purpose —
 * it just runs at OFF_THEME_MULT. Only space can actually refuse you.
 */
export function canPlaceProp(
  defId: string,
  type: RoomType,
  occ: RoomOccupancy,
  tier: RoomTier,
): PlaceResult {
  const def = PROP_BY_ID[defId];
  if (!def) return { ok: false, reason: "no-such-prop", needed: 0, free: freeSpace(occ, tier) };
  const free = freeSpace(occ, tier);
  if (def.size > free) return { ok: false, reason: "no-space", needed: def.size, free };
  return { ok: true, cost: def.size, onTheme: propFitsRoom(def, type) };
}

/** Can a beast of this rarity be housed here? */
export function canHouseBeast(rarity: Rarity, occ: RoomOccupancy, tier: RoomTier): PlaceResult {
  const needed = beastSpace(rarity);
  const free = freeSpace(occ, tier);
  if (needed > free) return { ok: false, reason: "no-space", needed, free };
  return { ok: true, cost: needed, onTheme: true };
}

/**
 * The minimum set of props to pull out to free `needed` space, cheapest-first
 * by effect value — so the UI can offer "move these three and the beast fits"
 * instead of making the player solve the knapsack themselves.
 */
export function evictionPlan(needed: number, occ: RoomOccupancy, tier: RoomTier): PropItem[] {
  let short = needed - freeSpace(occ, tier);
  if (short <= 0) return [];
  const ranked = [...occ.props].sort(
    (a, b) => effectWeight(PROP_BY_ID[a.defId]) - effectWeight(PROP_BY_ID[b.defId]),
  );
  const plan: PropItem[] = [];
  for (const item of ranked) {
    if (short <= 0) break;
    plan.push(item);
    short -= PROP_BY_ID[item.defId]?.size ?? 0;
  }
  return plan;
}

/** Rough "how much am I giving up" score, used only to order eviction suggestions. */
function effectWeight(def: PropDef | undefined): number {
  if (!def) return 0;
  const e = def.effect;
  const base =
    (e.produceMult ?? 0) * 100 +
    (e.storeMult ?? 0) * 50 +
    (e.trainRate ?? 0) * 80 +
    (e.mightFlat ?? 0) * 10 +
    (e.capacity ?? 0) * 60;
  // A trade-good machine is never the thing you want to pull out first.
  return def.produces ? base + 1000 : base;
}

// ---------- aggregate effects ------------------------------------------------

/** Is this prop on-theme here? Trophies (empty `rooms`) fit everywhere by design. */
export const propFitsRoom = (def: PropDef, type: RoomType): boolean =>
  def.rooms.length === 0 || def.rooms.includes(type);

export interface RoomBonuses {
  produceMult: number; // 1.0 = unmodified
  storeMult: number;
  trainRate: number;
  mightFlat: number;
  capacity: number;
  /** Trade goods this room can currently produce, from placed props. */
  produces: TradeGood[];
}

export const NO_BONUSES: RoomBonuses = {
  produceMult: 1,
  storeMult: 1,
  trainRate: 1,
  mightFlat: 0,
  capacity: 0,
  produces: [],
};

/**
 * Roll every placed prop up into the multipliers a room actually applies.
 * Off-theme props contribute at OFF_THEME_MULT; trade-good unlocks are all or
 * nothing (a vat in the wrong room still makes mutagen, just slower via the
 * produce multiplier).
 */
export function roomBonuses(type: RoomType, occ: RoomOccupancy): RoomBonuses {
  const out: RoomBonuses = { ...NO_BONUSES, produces: [] };
  for (const item of occ.props) {
    const def = PROP_BY_ID[item.defId];
    if (!def) continue;
    const k = propFitsRoom(def, type) ? 1 : OFF_THEME_MULT;
    const e = def.effect;
    out.produceMult += (e.produceMult ?? 0) * k;
    out.storeMult += (e.storeMult ?? 0) * k;
    out.trainRate += (e.trainRate ?? 0) * k;
    out.mightFlat += (e.mightFlat ?? 0) * k;
    out.capacity += Math.floor((e.capacity ?? 0) * k);
    if (def.produces && !out.produces.includes(def.produces)) out.produces.push(def.produces);
  }
  return out;
}
