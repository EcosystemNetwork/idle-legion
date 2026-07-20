// Navigation model.
//
// The game has twelve destinations. Presented flat they read as twelve peers;
// grouped they read as four ideas the player already holds: the world I own,
// the units I own, the fights I pick, the wealth I keep.
//
// Nothing here changes what is reachable — every legacy tab still exists, it
// just lives inside a section. Unlock gating is unchanged (game/unlocks.ts).

export type Tab =
  | "kingdom"
  | "stronghold"
  | "legion"
  | "arena"
  | "raids"
  | "worldboss"
  | "duels"
  | "treasury"
  | "codex"
  | "operator";

export type SectionId = "kingdom" | "legion" | "battle" | "treasury";

export interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
  /** Sub-destinations, in teaching order. The first unlocked one is the default. */
  tabs: { id: Tab; label: string; icon: string; blurb: string }[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: "kingdom",
    label: "Kingdom",
    icon: "🏰",
    tabs: [
      { id: "kingdom", label: "World", icon: "🏰", blurb: "Your kingdom from above" },
      { id: "stronghold", label: "Deep Works", icon: "⛏️", blurb: "Dig, staff and upgrade rooms" },
    ],
  },
  {
    id: "legion",
    label: "Legion",
    icon: "🛡️",
    tabs: [
      { id: "legion", label: "Gladiators", icon: "🛡️", blurb: "Everyone who fights for you" },
      { id: "codex", label: "Codex", icon: "📜", blurb: "Every relic in the realm" },
    ],
  },
  {
    id: "battle",
    label: "Battle",
    icon: "⚔️",
    tabs: [
      { id: "raids", label: "Raids", icon: "🗺️", blurb: "Send a squad into the Wastes" },
      { id: "arena", label: "Arena", icon: "⚔️", blurb: "Duel the bosses of the deep" },
      { id: "worldboss", label: "World Boss", icon: "🐉", blurb: "Everyone's fight, all at once" },
      { id: "duels", label: "Duels", icon: "🏟️", blurb: "Ranked ladder against real legions" },
    ],
  },
  {
    id: "treasury",
    label: "Treasury",
    icon: "🪙",
    // The Treasury is itself a multi-room surface (vaults, bazaar, exchange,
    // estates, ledger) with its own internal navigation — see
    // components/treasury/Treasury.tsx. It appears here as one destination so
    // the main nav stays at four.
    tabs: [
      { id: "treasury", label: "Treasury", icon: "🏛️", blurb: "Vaults, bazaar, estates and ledger" },
      { id: "operator", label: "Operator", icon: "🔮", blurb: "Missions only the Mirror shows" },
    ],
  },
];

/** Which section a legacy tab id belongs to. */
export const SECTION_OF: Record<Tab, SectionId> = (() => {
  const m = {} as Record<Tab, SectionId>;
  for (const s of SECTIONS) for (const t of s.tabs) m[t.id] = s.id;
  return m;
})();

export function sectionDef(id: SectionId): SectionDef {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}

export function tabDef(id: Tab) {
  for (const s of SECTIONS) {
    const t = s.tabs.find((x) => x.id === id);
    if (t) return t;
  }
  return SECTIONS[0].tabs[0];
}
