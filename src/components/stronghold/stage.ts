// Stage direction for a chamber: where people stand, what they do there, what
// the room throws into the air, and what its output looks like piled on the
// floor. Pure data — the components read it, the CSS animates it.
//
// The point of centralising this is that a room's *character* lives in one
// table. Making the Mine feel different from the Forge is editing two rows, not
// writing a bespoke component; adding a room type is adding a row.
import type { Produces, RoomType } from "../../game/types";

/** What a worker physically does at their post. Drives the crew animation. */
export type Verb = "swing" | "haul" | "tend" | "plan" | "channel" | "guard" | "count";

/** Ambient particle flavour a working room emits. */
export type MoteKind = "dust" | "spark" | "chaff" | "steam" | "arcane" | "none";

/** How this room's stored output is drawn heaped on the floor. */
export type YieldKind = "coin" | "sack" | "vial" | "ingot" | "none";

export interface Anchor {
  /** % across the chamber floor. */
  x: number;
  /** % down the chamber (baseline of the object). */
  y: number;
  /** Relative scale, 1 = nominal. */
  s: number;
}

export interface StageDef {
  /** % positions workers walk between. Index cycles per worker. */
  posts: number[];
  /** Where a worker waits between bouts. */
  rest: number;
  verb: Verb;
  /** Glyph the worker swings/carries. Kept as text so no art is required. */
  tool: string;
  motes: MoteKind;
  yieldKind: YieldKind;
  /** Where the output heap sits. */
  yieldAt: Anchor;
  /** Slots props drop into, in fill order. */
  props: Anchor[];
  /** Hue for this room's light, in degrees. Pairs with the existing --accent. */
  hue: number;
}

const YIELD_BY_RESOURCE: Record<NonNullable<Produces> | "none", YieldKind> = {
  gold: "coin",
  provisions: "sack",
  salves: "vial",
  might: "ingot",
  none: "none",
};

export const yieldKindFor = (p: Produces): YieldKind =>
  YIELD_BY_RESOURCE[p ?? "none"];

export const STAGE: Record<RoomType, StageDef> = {
  mine: {
    // Two faces on opposite walls: the crew splits, which reads as a working
    // gang rather than a queue.
    posts: [16, 82, 30, 70],
    rest: 50,
    verb: "swing",
    tool: "⛏",
    motes: "dust",
    yieldKind: "coin",
    yieldAt: { x: 52, y: 88, s: 1 },
    props: [
      { x: 24, y: 86, s: 0.9 },
      { x: 74, y: 86, s: 0.9 },
      { x: 46, y: 80, s: 0.7 },
      { x: 88, y: 82, s: 0.7 },
    ],
    hue: 44,
  },
  forge: {
    // Everyone converges on the anvil — the heat is the centre of the room.
    posts: [42, 58, 30, 70],
    rest: 84,
    verb: "swing",
    tool: "🔨",
    motes: "spark",
    yieldKind: "ingot",
    yieldAt: { x: 78, y: 88, s: 1 },
    props: [
      { x: 50, y: 86, s: 1 },
      { x: 22, y: 84, s: 0.85 },
      { x: 76, y: 82, s: 0.8 },
      { x: 90, y: 86, s: 0.7 },
    ],
    hue: 22,
  },
  granary: {
    posts: [22, 74, 40, 60],
    rest: 50,
    verb: "haul",
    tool: "🌾",
    motes: "chaff",
    yieldKind: "sack",
    yieldAt: { x: 30, y: 88, s: 1 },
    props: [
      { x: 70, y: 86, s: 1 },
      { x: 86, y: 84, s: 0.8 },
      { x: 52, y: 82, s: 0.75 },
      { x: 14, y: 84, s: 0.7 },
    ],
    hue: 96,
  },
  infirmary: {
    posts: [30, 62, 46, 76],
    rest: 88,
    verb: "tend",
    tool: "⛑",
    motes: "steam",
    yieldKind: "vial",
    yieldAt: { x: 84, y: 88, s: 0.95 },
    props: [
      { x: 34, y: 88, s: 1 },
      { x: 64, y: 88, s: 1 },
      { x: 18, y: 80, s: 0.75 },
      { x: 88, y: 78, s: 0.7 },
    ],
    hue: 168,
  },
  warroom: {
    posts: [46, 56],
    rest: 50,
    verb: "plan",
    tool: "🗺",
    motes: "none",
    yieldKind: "none",
    yieldAt: { x: 50, y: 88, s: 1 },
    props: [
      { x: 50, y: 86, s: 1.1 },
      { x: 18, y: 84, s: 0.8 },
      { x: 84, y: 84, s: 0.8 },
    ],
    hue: 276,
  },
  portal: {
    posts: [50, 40, 60],
    rest: 82,
    verb: "channel",
    tool: "🌀",
    motes: "arcane",
    yieldKind: "none",
    yieldAt: { x: 50, y: 88, s: 1 },
    props: [
      { x: 50, y: 76, s: 1.2 },
      { x: 20, y: 86, s: 0.8 },
      { x: 80, y: 86, s: 0.8 },
    ],
    hue: 288,
  },
  hall: {
    // Nobody has a post in the Hall — off-duty legionaries drift, which is the
    // whole read: this is where people are when they are not working.
    posts: [26, 44, 62, 78],
    rest: 50,
    verb: "guard",
    tool: "",
    motes: "dust",
    yieldKind: "none",
    yieldAt: { x: 50, y: 88, s: 1 },
    props: [
      { x: 16, y: 86, s: 0.9 },
      { x: 84, y: 86, s: 0.9 },
      { x: 50, y: 80, s: 1 },
      { x: 32, y: 84, s: 0.7 },
      { x: 68, y: 84, s: 0.7 },
    ],
    hue: 40,
  },
  quarters: {
    posts: [50],
    rest: 50,
    verb: "guard",
    tool: "👑",
    motes: "dust",
    yieldKind: "none",
    yieldAt: { x: 50, y: 88, s: 1 },
    props: [
      { x: 20, y: 84, s: 0.9 },
      { x: 80, y: 84, s: 0.9 },
      { x: 50, y: 78, s: 1 },
    ],
    hue: 42,
  },
  warchest: {
    posts: [50],
    rest: 50,
    verb: "count",
    tool: "🪙",
    motes: "arcane",
    yieldKind: "coin",
    yieldAt: { x: 50, y: 86, s: 1.1 },
    props: [
      { x: 22, y: 84, s: 0.85 },
      { x: 78, y: 84, s: 0.85 },
    ],
    hue: 186,
  },
};

/**
 * Prop id → silhouette shape. The prop art in ART_BRIEF.md doesn't exist yet,
 * so every prop renders as a CSS-drawn silhouette keyed off this map; when a
 * real sprite lands the component swaps to it and falls back here on 404.
 * Unmapped props get a crate, which is the honest answer for "something is
 * stored here and I don't know what".
 */
export const PROP_SHAPE: Record<string, string> = {
  anvil: "anvil",
  bloomery: "furnace",
  "quench-trough": "trough",
  grindstone: "wheel",
  "emberfat-crucible": "furnace",
  "amphora-rack": "amphorae",
  "grain-sacks": "sacks",
  scales: "scales",
  "hopium-still": "still",
  "cot-row": "cot",
  "apothecary-shelf": "shelf",
  "herb-rack": "rack",
  "mutagen-vat": "vat",
  "ore-cart": "cart",
  "pit-props": "beams",
  "ichor-tap": "vat",
  pell: "post",
  "sand-pit": "pit",
  "weapon-rack": "rack",
  "sparring-dummy": "post",
  "beast-cage": "cage",
  "feed-trough": "trough",
  "kek-banner": "banner",
  brazier: "brazier",
  "floor-mosaic": "mosaic",
  "gladiator-laurel": "laurel",
  "champions-helm": "helm",
  "chained-skull": "skull",
  "victory-standard": "banner",
  statue: "statue",
};

export const propShape = (defId: string) => PROP_SHAPE[defId] ?? "crate";

/**
 * Stable 0..1 from an id. Used to desync ambient loops — without it every
 * worker in the stronghold swings on exactly the same frame and the whole
 * screen pulses like a metronome.
 */
export function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
