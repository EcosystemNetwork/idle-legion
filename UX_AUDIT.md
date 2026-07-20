# Idle Legion — UX/UI Audit (pre-redesign)

Audited: desktop ~1440px and mobile ~390px, first-session state through ~10 minutes.
Scope of the fix: presentation and information architecture only. No new gameplay systems.

---

## 1. The permanent HUD outweighs the game

`ResourceBar` (`src/App.tsx:796`) renders **up to 11 chips plus a Collect-all button** in a
wrapping flex row: Gold, Provisions, Salves, $LEGION, Population, Might, Wounded, Renown,
Crates, on-chain Balance, Collect all.

- At 1440px this is two rows. At 390px `.chip-stat { flex-basis: 44% }` (`App.css:742`) makes
  it **six rows of chips** — roughly 320px of vertical space before any game content.
- Beneath it sit up to three stacked banners (daily, mirror, incident) and then the tab row,
  which at 390px is another `flex-basis: 44%` wrap — **six more rows**.
- Net effect on a 390px × 844px phone: the 3D kingdom (`.game-world`, `height: min(52vh, 460px)`)
  starts well below the fold. The HUD literally gets more screen than the game.
- Every chip is styled identically, so gold (the number that drives every decision) has the
  same visual weight as the on-chain USD balance (which matters to almost nobody in minute one).

**Violates:** "keep only the three most important resources visible", "primary scene gets more
screen space than the HUD".

## 2. The Kingdom map is decoration, not navigation

`GameWorld` (`src/components/GameWorld.tsx`) mounts the Three.js kingdom and forwards
`onEnter(id)` → `setTab(id)`. The scene already raycasts buildings and shows a hover tooltip
(`src/three/kingdom.ts`), so the *mechanism* exists. But:

- The map receives **no game state at all** — only `dwellers` (a headcount). It cannot show which
  building is ready to collect, which is locked, which is on fire, or which can be upgraded.
- The real navigation is the tab row above it. The map is a thing you look at; the tabs are the
  thing you use. Because the tab row duplicates every destination, the map has no job.
- The hover tooltip is a single shared chip at the bottom centre — no per-building affordance,
  no tap target feedback, no state.
- With no WebGL the entire scene degrades to `KingdomLoading` with the note
  *"use the tabs above to move around the kingdom"* (`App.tsx:641`) — an explicit admission that
  the map is not load-bearing.
- Incidents (`state.incident`) fire as a **global banner** at the top of the page even though an
  incident belongs to a specific room (`state.incident.roomId`). The player is told "something is
  on fire" but not *where* on the world it is.

**Violates:** "make the Kingdom map the primary navigation surface", "production-ready indicators,
locked silhouettes, incident alerts, upgrade markers directly on the world".

## 3. Eleven top-level tabs is not an information architecture

`Tab` (`App.tsx:163`) is a flat union of 12 destinations: kingdom, stronghold, legion, arena,
raids, worldboss, duels, exchange, realm, market, codex, operator.

- `unlocks.ts` correctly hides most of them early — a fresh save shows 3. This is good and worth
  keeping. But once the player is ~20 minutes in, they face a flat row of 11 peers with no
  grouping, no hierarchy, and no indication which are related.
- Conceptually these are four things: **the world** (kingdom, stronghold), **your units**
  (legion, codex), **combat** (raids, arena, worldboss, duels), and **economy**
  (market, exchange, realm). Nothing in the UI says so.
- Notification dots exist on four tabs but use two undifferentiated styles (`.dot`, `.dot.gift`),
  so "you have a reward" and "you have an unspent boost" look the same.

**Violates:** "replace the large tab collection with a compact navigation structure organized
around Kingdom, Legion, Battle, Treasury".

## 4. There is no answer to "what do I do next?"

- `Objectives` (`App.tsx:1885`) — the closest thing to a next-action prompt — is buried **inside
  the Legion tab**, below `SummoningPanel`. A new player on the Kingdom tab never sees it.
- It renders *all* objectives as equal-weight cards in a row, so it is a checklist, not a
  directive. Nothing says "do this one".
- `nextUnlock()` produces an excellent hint string ("Dig a War Room in the Stronghold") but it is
  rendered as a **greyed-out, dashed, `cursor: help` pill in the tab row** (`App.tsx:608`) —
  styled as *disabled chrome*, i.e. the exact visual language for "ignore me".
- Rewards are shown as a bare number (`🎁 +{o.reward}`) with no unit, so the payoff is unreadable.

**Violates:** "one prominent Next Objective card that always explains the next action and its
reward", "new player identifies the next action within five seconds".

## 5. Competing calls to action everywhere

On a first-session Kingdom screen the player can simultaneously be shown: **Collect all**
(HUD), **Claim** (daily banner), **Claim Mirror** (mirror banner), **open crate** (HUD chip),
**heal all** (HUD chip), plus every clickable building. Five-plus primary-weight buttons, all
gold-filled `.btn`, none ranked.

Inside `StrongholdView` each `Chamber` carries up to five controls (`⚡` rush, `👥` auto-staff,
`Raid ▸`, `Vault ▸`, `▲ upgrade`) rendered as identical `.chip-btn` pills with **emoji-only
labels and title-attribute tooltips** — unusable on touch, where there is no hover.

**Violates:** "never more than three competing primary calls to action".

## 6. Responsive behaviour is an afterthought

Only four layout breakpoints exist in 1,884 lines of CSS (`820px`, `520px`, `720px`, `800px`),
and three of them only flip one grid to a single column.

- `.app { max-width: 1160px }` (`App.css:31`) — at 1440px the game is a 1160px column with
  ~140px of dead gutter each side, while the HUD wraps inside it.
- The Stronghold's `.vault-body` uses a fixed 58px left padding for the decorative elevator on
  mobile, permanently spending 15% of a 390px screen on an ornament.
- Modals (`AssignModal`, `HeroModal`, `RevealModal`, …) have no mobile-specific treatment; they
  are desktop dialogs shown on phones.
- Chamber controls, market stalls and hero grids are all `flex-wrap` with no min-width discipline,
  so they reflow into 1-column strips at 390px with large empty tails.

## 7. No systematic design language

- `:root` (`App.css:1`) defines colours and two font families — and nothing else. **No spacing
  scale, no radius scale, no type scale, no elevation scale, no state colours.** Every value in
  the file is a magic number: `padding: 8px 10px`, `12px`, `14px`, `18px`, `9px 11px` all appear.
- Radii range across `6px, 7px, 8px, 9px, 10px, 11px, 12px, 14px, 16px, 18px, 999px` with no rule.
- The same "card" is re-implemented as `.panel`, `.xc-card`, `.duel-card`, `.parcel`, `.stall`,
  `.chamber`, `.obj`, `.adm-ret-tile` — eight one-off card styles.
- Buttons: `.btn`, `.btn.secondary`, `.btn.ghost`, `.btn.danger`, `.chip-btn`, `.chip-btn.go`,
  `.chip-btn.up`, `.build-btn`, `.crate-btn`, `.link-btn`, `.buy`, `.sell-btn` — twelve button
  classes, several visually indistinguishable.
- `App.tsx` is a **3,254-line single file** holding 40+ components. There is no reusable UI layer,
  so every new surface adds another bespoke style.

**Violates:** "reusable React components and CSS tokens rather than isolated one-off styling."

## 8. Missing or ad-hoc system states

| State | Today |
|---|---|
| Loading | Only the kingdom has one (`.gw-veil` spinner). Every other view pops in. |
| Locked | A dashed grey pill in the tab row. No locked-building treatment on the map. |
| Empty | None. An empty legion / no gear / no land renders a bare grid with nothing in it. |
| Error | One red bar at the top of the page (`.banner.error`) for *all* errors, game and wallet, with a lowercase "dismiss". Not contextual to where the error happened. |
| Completion | Level-ups and reveals are well handled (`LevelUpLayer`, `RevealModal`). Objective completion is just a button becoming enabled. |

## 9. Typography and hierarchy

- Cinzel (display) is used for headings *and* numeric values *and* badges *and* tier names, so it
  stops signalling importance.
- Body sizes in use: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 26px — twelve steps, mostly
  arbitrary, several used once.
- `.muted.small` (12px, `#b3a9c8` on `#110c1c`) carries genuinely important text — costs,
  requirements, streak state — at low contrast.
- Numbers are not consistently tabular; only `.pvp-stat`, `.wb-dmg` and a couple of admin classes
  set `font-variant-numeric: tabular-nums`, so counters jitter as they count up.

---

## What is genuinely good and must be preserved

1. **The art direction.** Dark Roman-apocalypse, gold `#ffc233` / violet `#b072ff`, painterly
   room and raid backdrops, the underground strata treatment. This is the product's identity.
2. **The meme-fantasy voice.** "fresh meat off the Wastes", "Even recruits GMI here", "sleep, eat,
   and cope". Keep every word.
3. **Progressive unlocks** (`game/unlocks.ts`) — the pacing logic is correct; only its
   *presentation* is wrong.
4. **The juice layer** (`fx/juice.ts`): coin arcs, rings, shakes, float text, level-up toasts.
   Genuinely commercial-feeling. All of it stays and gets wired to the new surfaces.
5. **The 3D kingdom scene itself** — good silhouette, good mood. It needs a job, not a rebuild.

---

## Redesign thesis

> The kingdom **is** the game screen. The HUD is a thin band on top of it. Everything else is a
> panel that slides over the world and can be dismissed back to it.

Concretely:

1. **HUD → 3 resources** (Gold, Provisions, Might) + a **Treasury** button that expands a panel
   holding $LEGION, salves, renown, crates, population, wallet and on-chain balance.
2. **Nav → 4 destinations** (Kingdom, Legion, Battle, Treasury), with the existing 11 tabs
   becoming sub-sections inside Legion / Battle / Treasury. Progressive unlock logic unchanged.
3. **Map → primary navigation.** Buildings become real hotspots carrying live state badges:
   ready-to-collect, locked silhouette, incident, upgrade-available, staffing needed.
4. **One Next Objective card**, always visible, always naming the action and the reward, sourced
   from existing objective + unlock state.
5. **A token layer + primitive components** so the eight card styles and twelve button styles
   collapse into one of each.
