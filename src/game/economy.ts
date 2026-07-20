// The economy's *meaning* layer.
//
// engine.ts knows how much a thing costs. This module knows what a thing IS to
// the player: which rung of the resource hierarchy it sits on, whether it is
// power or convenience, whether it can be traded or is bound to the account,
// what the legion looks like before and after buying it, and — critically —
// the free path to the same power for anyone who never spends a cent.
//
// Nothing here touches a chain, a wallet, or a contract. Those words belong in
// the "advanced details" disclosure, not in the sentence a player reads first.

import {
  GEAR_BY_ID,
  LAND_KIND_META,
  MERCENARY_TIERS,
  RARITY_META,
  TIERS,
  WARCHEST_YIELD_PER_USD,
} from "./config";
import { equippedGearDefs, formatNum, globalBoost } from "./engine";
import type { DerivedStats, GameState, OnchainListing, Rarity } from "./types";

// ---------------------------------------------------------------------------
// Resource hierarchy
// ---------------------------------------------------------------------------

/**
 * Three rungs, deliberately named for what the player does with them rather
 * than for what they technically are:
 *
 *  - `basic`     gold / provisions / salves — earned by playing, spent hourly.
 *  - `strategic` $LEGION — the slow, scarce currency behind land and staking.
 *  - `treasury`  external value (USDT) — optional, never required to progress.
 */
export type ResourceTier = "basic" | "strategic" | "treasury";

export interface ResourceMeta {
  id: string;
  /** In-world name. Never a ticker unless the ticker IS the in-world name. */
  label: string;
  icon: string;
  tier: ResourceTier;
  /** One sentence a player with zero crypto background understands. */
  blurb: string;
  /** Where it comes from, in plain language. */
  earnedBy: string;
}

export const RESOURCE_TIER_META: Record<
  ResourceTier,
  { label: string; note: string; accent: string }
> = {
  basic: {
    label: "Stores",
    note: "Everyday supplies. Earned by playing, spent constantly.",
    accent: "var(--gold)",
  },
  strategic: {
    label: "Standing",
    note: "Slow, scarce, and strategic. Buys land and earns interest.",
    accent: "var(--cyan)",
  },
  treasury: {
    label: "Treasury",
    note: "Outside value you may add if you want to. Never required.",
    accent: "var(--green)",
  },
};

export const RESOURCES: Record<string, ResourceMeta> = {
  gold: {
    id: "gold",
    label: "Gold",
    icon: "🪙",
    tier: "basic",
    blurb: "Pays for chambers, recruits, healing and upgrades.",
    earnedBy: "Mines, raids and the arena.",
  },
  provisions: {
    id: "provisions",
    label: "Provisions",
    icon: "🌾",
    tier: "basic",
    blurb: "Feeds the legion. Run out and everyone works slower.",
    earnedBy: "Granaries and grain fields.",
  },
  salves: {
    id: "salves",
    label: "Salves",
    icon: "⛑️",
    tier: "basic",
    blurb: "Heals wounded gladiators between fights.",
    earnedBy: "The infirmary and herb gardens.",
  },
  legion: {
    id: "legion",
    label: "$LEGION",
    icon: "💠",
    tier: "strategic",
    blurb:
      "The legion's own coin. Claims land, funds summoning, and earns interest in the Bank.",
    earnedBy: "Land, the arena ladder, world bosses — or traded for gold.",
  },
  treasury: {
    id: "treasury",
    label: "Treasury balance",
    icon: "🏛️",
    tier: "treasury",
    blurb:
      "Value you bring from outside the game. Entirely optional — every reward it unlocks can also be earned by playing.",
    earnedBy: "Added by you, from your own account.",
  },
};

// ---------------------------------------------------------------------------
// What a purchasable thing IS
// ---------------------------------------------------------------------------

/**
 * The four honest buckets. Keeping them visibly separate is the whole
 * anti-pay-to-win posture: a player should be able to see at a glance that the
 * shiny thing is a collectible, not a power spike.
 */
export type ValueClass = "power" | "convenience" | "cosmetic" | "collectible";

export const VALUE_CLASS_META: Record<
  ValueClass,
  { label: string; icon: string; note: string; accent: string }
> = {
  power: {
    label: "Power",
    icon: "⚔️",
    note: "Raises a stat. Everything here is also reachable by playing.",
    accent: "var(--red)",
  },
  convenience: {
    label: "Convenience",
    icon: "⏳",
    note: "Saves time. Changes how fast you get there, not how far you can go.",
    accent: "var(--cyan)",
  },
  cosmetic: {
    label: "Cosmetic",
    icon: "🎨",
    note: "Looks only. No effect on any stat.",
    accent: "var(--purple)",
  },
  collectible: {
    label: "Collectible",
    icon: "🏺",
    note: "Limited or historic. Held for its own sake.",
    accent: "var(--amber)",
  },
};

/** How firmly a thing belongs to the player. */
export type Ownership = "earned" | "tradable" | "bound";

export const OWNERSHIP_META: Record<
  Ownership,
  { label: string; icon: string; note: string }
> = {
  earned: {
    label: "Earned in game",
    icon: "🎖️",
    note: "Won through play. Lives in your save; can be sold back for gold.",
  },
  tradable: {
    label: "Tradable",
    icon: "🔁",
    note: "You own this outright and may sell or transfer it later.",
  },
  bound: {
    label: "Account-bound",
    icon: "🔒",
    note: "Tied to this legion forever. Cannot be sold or transferred.",
  },
};

/** A single before → after line on a purchase preview. */
export interface StatChange {
  label: string;
  before: string;
  after: string;
  /** Signed delta used for colour + the "+x%" chip. */
  deltaPct: number;
  better: boolean;
}

export interface ListingFacts {
  category: ValueClass;
  ownership: Ownership;
  /** What it does, in one plain sentence. */
  utility: string;
  /** Before/after rows — empty for pure cosmetics. */
  changes: StatChange[];
  /** How to reach comparable power without spending anything. */
  freePath: string;
  /** Why this matters to THIS legion, right now. */
  why: string;
  rarity: Rarity;
  /** Total the player parts with, all-in. */
  totalUsd: number;
  /** Non-refundable network cost, shown separately and never buried. */
  feeUsd: number;
}

/** Network cost estimate. Flat and small; shown as its own line, never hidden. */
export const NETWORK_FEE_USD = 0.01;

function pct(before: number, after: number): number {
  if (before <= 0) return after > 0 ? 100 : 0;
  return ((after - before) / before) * 100;
}

/** Best equipped item the legion currently fields in a given slot. */
function bestEquippedMight(state: GameState, slot: string): number {
  let best = 0;
  for (const d of state.dwellers) {
    for (const g of equippedGearDefs(state, d)) {
      if (g.slot === slot && g.might > best) best = g.might;
    }
  }
  return best;
}

/**
 * Everything the card needs to be honest, derived from the live save so the
 * "why this matters" line is about this player and not a generic pitch.
 */
export function listingFacts(
  state: GameState,
  stats: DerivedStats,
  l: OnchainListing,
): ListingFacts {
  const totalUsd = l.priceUsd + NETWORK_FEE_USD;
  const base = { rarity: l.rarity, totalUsd, feeUsd: NETWORK_FEE_USD };

  if (l.kind === "gear" && l.defId) {
    const g = GEAR_BY_ID[l.defId];
    const might = g?.might ?? 0;
    const output = g?.output ?? 0;
    const incumbent = g ? bestEquippedMight(state, g.slot) : 0;
    const gain = Math.max(0, might - incumbent);
    const afterMight = stats.might + gain;
    const changes: StatChange[] = [
      {
        label: "Legion might",
        before: formatNum(Math.floor(stats.might)),
        after: formatNum(Math.floor(afterMight)),
        deltaPct: pct(stats.might, afterMight),
        better: gain > 0,
      },
    ];
    if (output > 0) {
      const afterGps = stats.goldPerSec + output;
      changes.push({
        label: "Gold per second",
        before: stats.goldPerSec.toFixed(1),
        after: afterGps.toFixed(1),
        deltaPct: pct(stats.goldPerSec, afterGps),
        better: true,
      });
    }
    return {
      ...base,
      category: "power",
      ownership: "tradable",
      utility: `Equips to one gladiator's ${g?.slot ?? "gear"} slot for +${might} might${
        output > 0 ? ` and +${output} output` : ""
      }.`,
      changes,
      freePath:
        gain > 0
          ? "Crates and raid loot drop gear of every rarity — and any two duplicates fuse into a stronger one, for free."
          : "You already field better in this slot. Crates and raid loot will keep pace with this tier on their own.",
      why:
        gain > 0
          ? `Your best ${g?.slot ?? "piece"} is +${incumbent} might. This replaces it and lifts the whole legion by ${gain}.`
          : `Your legion already fields +${incumbent} might here, so this would sit in storage. Spend elsewhere.`,
    };
  }

  if (l.kind === "hero" && l.tier) {
    const t = TIERS[l.tier];
    const afterMight = stats.might + t.might;
    const afterGps = stats.goldPerSec + t.output;
    return {
      ...base,
      category: "power",
      ownership: "tradable",
      utility: `Adds a ${t.name} to your roster — a body that fights, works a chamber, and levels up.`,
      changes: [
        {
          label: "Legion might",
          before: formatNum(Math.floor(stats.might)),
          after: formatNum(Math.floor(afterMight)),
          deltaPct: pct(stats.might, afterMight),
          better: true,
        },
        {
          label: "Roster",
          before: `${stats.population}`,
          after: `${stats.population + 1}`,
          deltaPct: pct(stats.population, stats.population + 1),
          better: true,
        },
        {
          label: "Gold per second",
          before: stats.goldPerSec.toFixed(1),
          after: afterGps.toFixed(1),
          deltaPct: pct(stats.goldPerSec, afterGps),
          better: true,
        },
      ],
      freePath:
        "The slave market at the gate sells gladiators for gold, and two of your own can be paired in the Summoning Pit to breed a stronger heir — no cost but time.",
      why:
        stats.idleCount > 0
          ? `You have ${stats.idleCount} idle worker${stats.idleCount === 1 ? "" : "s"} — another body only helps once your chambers are staffed.`
          : `Every chamber is staffed. A ${t.name} is the next real step up in output.`,
    };
  }

  // boost → the Free Company contract, i.e. funding the War Chest
  const current = state.mercenaryBoost;
  const nextUsd = state.warChestUsd + l.priceUsd;
  const nextBoost = MERCENARY_TIERS.reduce(
    (b, t) => (nextUsd >= t.minUsd ? Math.max(b, t.boost) : b),
    current,
  );
  const beforeGps = stats.goldPerSec;
  const afterGps = beforeGps * ((1 + nextBoost) / (1 + current));
  return {
    ...base,
    category: "convenience",
    ownership: "bound",
    utility:
      "A standing contract with a mercenary company: every chamber in your stronghold produces more, permanently.",
    changes: [
      {
        label: "Output bonus",
        before: `+${Math.round(current * 100)}%`,
        after: `+${Math.round(nextBoost * 100)}%`,
        deltaPct: (nextBoost - current) * 100,
        better: nextBoost > current,
      },
      {
        label: "Gold per second",
        before: beforeGps.toFixed(1),
        after: afterGps.toFixed(1),
        deltaPct: pct(beforeGps, afterGps),
        better: afterGps > beforeGps,
      },
    ],
    freePath:
      "Descending to a deeper stronghold banks Renown, which raises the same output bonus permanently and costs nothing but a fresh start.",
    why: "It speeds up every chamber at once, so it compounds with whatever you build next. It never unlocks content you couldn't reach by playing.",
  };
}

// ---------------------------------------------------------------------------
// War Chest / Free Company
// ---------------------------------------------------------------------------

export interface CompanyTier {
  minUsd: number;
  boost: number;
  label: string;
  /** In-world name, no percentages — the number is shown separately. */
  name: string;
}

export const COMPANY_TIERS: CompanyTier[] = MERCENARY_TIERS.map((t) => ({
  ...t,
  name: t.label.replace(/\s*\(.*\)$/, ""),
}));

export function companyTier(usd: number): CompanyTier | null {
  let out: CompanyTier | null = null;
  for (const t of COMPANY_TIERS) if (usd >= t.minUsd) out = t;
  return out;
}

export function nextCompanyTier(usd: number): CompanyTier | null {
  return COMPANY_TIERS.find((t) => usd < t.minUsd) ?? null;
}

/** Gold per second the vault yields at a hypothetical funded amount. */
export function vaultYieldAt(state: GameState, usd: number): number {
  return usd * WARCHEST_YIELD_PER_USD * (1 + globalBoost(state));
}

// ---------------------------------------------------------------------------
// Small shared helpers for the Treasury UI
// ---------------------------------------------------------------------------

export function rarityColor(r: Rarity): string {
  return RARITY_META[r].color;
}

export function landLabel(kind: keyof typeof LAND_KIND_META): string {
  return LAND_KIND_META[kind].name;
}

/** "$1.20" — one place the app formats external money, so it never drifts. */
export function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}
