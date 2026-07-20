# Idle Legion

**UXMaxx Hackathon · Universal Accounts Track**
Particle Network EIP-7702 · Arbitrum settlement · Magic embedded wallets

> They rugged the Surface. So we dug. Carve an underground **stronghold** beneath a dead mountain, staff its chambers with a **legion** of gladiators (each with an aptitude), and tap to pull **sestertii** and **provisions** from the deep. Send squads to raid the **Wastes**, fight **world bosses** in the Arena, and grow a dynasty. Then fund the **War Chest** with assets from *any* chain — the **Universal Account** reaches across every surviving Chain with no bridge and lands **USDT on Arbitrum**, hiring a Free Company that boosts every room. One login, one balance, no bridge UI.

**A Fallout-Shelter-style base builder × Crypto Dynasty, with a Universal Accounts treasury — and a full degen-Roman apocalypse behind it.**

▶ **Live:** https://ecosystemnetwork.github.io/idle-legion/

📖 **The world, factions, and the legend of Kekius Maximus live in [LORE.md](LORE.md).** Every room, raid, and boss draws from that canon. The people of the deep are **Keks** — sons of the laughing god, hence *Kekius* Maximus. Never "frogs".

## The story in one breath

The old world ran on the shining **Chains**, linked by **Bridges**. Someone pulled the rug — the Bridges drained, the Chains cracked apart, and the sunlit Surface became **the Wastes**. Survivors stopped looking up and **dug**. Your Stronghold is their cold storage; your legion is their future; the **Universal Account** in the Treasury Vault is the one relic that still moves value across Chains *without a bridge* — which is exactly why the whole game is built around it. Patron saint of the deep: **Kekius Maximus**, the meme-messiah who rose from the mempool three blocks after the Rug. *Stay Kekius.*

## Why this hits the track

| Requirement | How Idle Legion does it |
|-------------|-------------------------|
| Universal Accounts SDK **EIP-7702 mode** | `useEIP7702: true` on `UniversalAccount` — EOA upgraded in place |
| ≥1 **cross-chain value move** via UA | `createTransferTransaction` → USDT on **Arbitrum One** from unified Primary Assets |
| Functional demo | Playable idle game offline; live UA with Particle + wallet/Magic keys |
| Consumer UX | Magic email login or browser wallet; no chain switch, no gas token theater |
| Arbitrum bounty | Settlement / destination chain is Arbitrum |
| Magic bonus | Magic email OTP embedded wallet as primary auth path |

## What you actually do

- **🏰 Kingdom** — the home screen and default tab: a DFK-style isometric map of the **Gladiator Kek Empire**, rendered in real 3D, whose buildings are the nav into every other system.
- **⛏️ Stronghold** — a Fallout-Shelter-style vertical cutaway. Collect sestertii from the Gold Mine, dig a Granary / War Forge / War Room, and assign gladiators by aptitude (matches glow green). Rooms open into painterly **interiors** with animated Kek dwellers, and the **Master's Quarters** shows off your boss gladiator as an animated **3D actor**.
- **🛡️ Legion** — your roster of gladiators, ranks recruit → champion. Level them, equip **gear** (weapon / armor / mount) rolled from a common→legendary rarity ladder, and crack **lunchboxes** 🎁 (loot crates dropped by raids).
- **⚔️ Arena** — fight escalating **world bosses** under the ruined Colosseum, ending at **Kekius the Tyrant** (the dark-timeline Kekius). Climb the rank ladder.
- **🗺️ Raids** — send idle squads topside into the Wastes on timed raids for gold and a guaranteed lunchbox. Bigger might → bigger prize.
- **🏛️ Marketplace** — the on-chain Bazaar. Buy grail gladiators and gear with USDT settled cross-chain via Universal Accounts, and sell spare assets back for gold. Fund the **War Chest** to hire a **Free Company** — a permanent production multiplier on every room.

## Systems (the full game, not just a wallet demo)

Idle Legion ships the retention/economy DNA of **Fallout Shelter**, **Crypto Dynasty**, and **DeFi Kingdoms**:

- **Survival stakes** — dwellers have **HP**; incidents wound them, a raid can **down or kill** a fighter, and healing spends **salves** from the **Infirmary** (a third resource with its own failure state). **Stamina** gates every fight (rest in the Hall to recover).
- **Gear economy** — **forge** gear up a rising gold curve and **fuse** duplicates for levels (the core gold sink).
- **Class triangle** — melee ▶ ranged ▶ charge. Every fighter, boss, raid, and duel has a class; matchup swings damage ±35%.
- **Raid log** — each raid returns a timestamped after-action report (loot, wounds, losses).
- **$LEGION economy** — a real **DEX** (constant-product AMM, gold ⇄ $LEGION), a **Bank** (stake for real-yield with an anti-mercenary withdrawal-fee decay), and **Land** (scarce, might-gated parcels that yield forever).
- **Genetic summoning** — heroes carry a **dual genome** (dominant + recessive genes); breed two at the **Summoning Portal** for a new-blood child — genes shuffle, rare traits surface, tiers can mutate up, and parents fatigue.
- **Daily-login streak** + an expanded objective treadmill.

### 🐉 Real multiplayer (World Boss + Duels)

Two systems are **actually networked** on **InsForge** (Postgres + Deno edge functions), server-authoritative:

- **World Boss** — one shared boss; **every player's damage is durable** and the leaderboard is **real players**. It escalates a tier each time the realm fells it.
- **PvP Duels** — an **async ELO ladder** where your opponents are **other real players'** synced legions; your results sync back to the shared board.

Both **degrade gracefully**: the game runs fully offline, and when the backend is unreachable the UI falls back to a local simulation (a **🟢 LIVE** / **◍ offline sim** badge always tells you which). Server code lives in [`functions/`](functions/) with schema in [`migrations/`](migrations/); the client bridge is [`src/lib/arena.ts`](src/lib/arena.ts). The same backend also carries **cloud saves** ([`src/lib/cloudSave.ts`](src/lib/cloudSave.ts)) and the **Scrying Mirror / Operator** live-ops board — tuned without a redeploy, see [SCRYING_MIRROR_OPS.md](SCRYING_MIRROR_OPS.md).

### Onboarding — progressive unlocks

Twelve tabs at once is the fastest way to lose a new player, so each surface stays hidden until the loop that teaches it is done: **dig → staff → raid → fight → trade → compete → deep economy**. Locked tabs are hidden entirely and the tab bar shows a single *next goal* teaser instead (Raids needs a War Room, Arena needs a raid, Market needs 5k total gold, Duels/World Boss need Arena wins, Realm needs 300 might *and* 3 raids). Unlocks are derived from state — nothing extra to persist — and a **Descend** never re-hides a system a veteran already learned. See [`src/game/unlocks.ts`](src/game/unlocks.ts).

### Performance

- **113 kB gz first paint** (down from 733 kB). `magic-sdk`, `ethers` and the Particle UA SDK are loaded on demand at the moment a player actually connects or transacts — types stay `import type`, so there's no runtime cost and the heavy chunks are never modulepreloaded.
- **One WebGL context for the whole game.** Every animated actor draws through a shared-context portal renderer ([`src/three/portals.ts`](src/three/portals.ts)) instead of taking a context each — this replaced `<model-viewer>`, which thrashed contexts.
- The 3D harness ([`src/three/engine.ts`](src/three/engine.ts)) pauses on a hidden tab or an off-screen canvas (idle games run for hours in the background) and runs an **adaptive quality governor** that drops bloom and pixel ratio when the frame rate can't hold. Non-WebGL devices fall back to the 2D kingdom map.

## Quick start

```bash
cd idle-legion
cp .env.example .env
# fill Particle + Magic keys
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### Without keys

The **idle game** (recruit, build, raid, arena, gear, local save) works fully offline.
War Chest / Marketplace live transfers need Particle dashboard keys.

### Env

```env
VITE_PARTICLE_PROJECT_ID=
VITE_PARTICLE_CLIENT_KEY=
VITE_PARTICLE_APP_ID=
VITE_MAGIC_PUBLISHABLE_KEY=
# optional override for transfer receiver (default = your EOA)
# VITE_WAR_CHEST_RECEIVER=
```

- Particle: https://dashboard.particle.network/
- Magic: https://dashboard.magic.link/

Allowlist your deploy domain (`ecosystemnetwork.github.io`) in **both** dashboards or live auth/UA will fail.

### Build & deploy

```bash
npm run build       # tsc -b && vite build
npm run preview     # serve dist/
npm run lint        # oxlint
npm run build:boss  # re-bake the animated boss GLB from the Meshy clips
```

Pushing to `main` auto-deploys to GitHub Pages via `.github/workflows/deploy.yml`; the `VITE_*` keys come from repo secrets. `vercel.json` carries an SPA rewrite for Vercel hosting.

## Demo script (judges)

1. Open app → the 3D **Kingdom** map of the Gladiator Kek Empire. Note only three tabs are open — the rest unlock as you play.
2. **Stronghold** cutaway. Collect gold from the Gold Mine, dig a Granary/War Forge, assign gladiators (aptitude match glows green). Enter a room to see its interior and its Kek dwellers; peek at the **Master's Quarters** for the animated 3D Kekius boss. Feels like a base builder.
3. **Legion** → open a lunchbox, equip gear on a gladiator, watch their might climb.
4. **Raids** → send an idle squad on a timed raid; claim loot + a lunchbox.
5. **Arena** → throw your squad at a boss and climb the rank. Then the **World Boss** and **Duels** — real other players, 🟢 LIVE badge.
6. **Marketplace** (the Bazaar) → Magic email login (or browser wallet).
7. Show **unified Primary Assets** balance (multi-chain, one total).
8. Buy an on-chain asset / fund the War Chest — UA sources funds from whatever chain holds Primary Assets; destination is Arbitrum USDT. No bridge, no chain switch.
9. **Free Company** boost unlocks — a permanent multiplier on every room. Link opens UniversalX activity.

## Architecture

```
src/
  game/          pure engine, no React and no I/O
    engine.ts    rooms, gladiators, production, provisions pressure, incidents,
                 raids, arena bosses, gear/lunchboxes, breeding, war-chest boost
    config.ts    all canon copy + catalogs (gear, bosses, rarity, art manifest)
    unlocks.ts   progressive tab gating   interiors.ts  room interior layouts
    assets.ts    classified + priced art catalog   streak.ts  daily login
  three/         raw-Three.js layer
    engine.ts    shared render harness (bloom, RAF, pause, quality governor)
    portals.ts   one WebGL context shared by every actor on screen
    kingdom.ts   the 3D kingdom map      loaders.ts   GLB/Draco loading + dispose
  components/    GameWorld, KingdomMap, RoomScene, BossStage, Actor, ModelStage,
                 AdminPanel
  hooks/         useGame, useWallet      fx/  juice, ambience, mute
  lib/
    auth.ts      Magic email + injected wallet   (lazy-loaded)
    ua.ts        Particle Universal Account (EIP-7702) + Arbitrum transfer (lazy)
    arena.ts     world-boss + duel-ladder bridge  cloudSave.ts  persistent saves
    insforge.ts  backend client          telemetry.ts  privacy-first analytics
    config.ts    env + Arbitrum USDT address
  App.tsx        shell + tab routing (kingdom / stronghold / legion / arena /
                 raids / world boss / duels / market / codex / realm / exchange)
functions/       Deno edge functions (world-boss, duel-ladder, cloud-save,
                 track, claim-mirror, complete-mission, operator-feed, admin)
migrations/      Postgres schema for the above
LORE.md          the world bible — setting, factions, Kekius, glossary, voice
FS_SPEC.md       Fallout Shelter systems/numbers reference we build against
SUBMISSION.md    hackathon submission   SCRYING_MIRROR_OPS.md  live-ops runbook
```

### Core UA snippet

```ts
new UniversalAccount({
  projectId,
  projectClientKey,
  projectAppUuid,
  smartAccountOptions: {
    name: "UNIVERSAL",
    version: "2.0.1",
    ownerAddress,
    useEIP7702: true, // track requirement
  },
});

// Cross-chain: any Primary Asset → USDT on Arbitrum
await ua.createTransferTransaction({
  token: { chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE, address: ARBITRUM_USDT },
  amount: "0.1",
  receiver,
});
```

## Tracks / prizes targeted

1. **Universal Accounts Track** (main) — EIP-7702 + cross-chain value
2. **Arbitrum bounty** — consumer app settled on Arbitrum
3. **Magic Labs bonus** — embedded email wallet onboarding

## Notes

- Original game built for this hackathon (legion idle theme; not a fork of production apps).
- Keep Particle/Magic secrets out of git (`.env` is gitignored via Vite template).
- Fund amount default `0.1` USDT — use small amounts on mainnet Primary Assets.
- In-fiction, bridges are dead (they caused the Rug); the Universal Account is the *only* cross-chain magic — that's why chain abstraction is the whole point, not a bolt-on.

## Privacy — analytics

The live build sends **pseudonymous** gameplay analytics to an InsForge edge function:
a random per-browser session id, timezone, engagement/screen dwell time, and click
labels. The server also sees the request IP and **geolocates it**.

- **No email and no wallet address are sent.** Identity is opt-in only
  (`localStorage['idle-legion-analytics-pii'] = "on"`).
- **Do Not Track** and **Global Privacy Control** are honoured as a hard opt-out —
  nothing is queued or transmitted.
- Players can opt out entirely from the footer link
  (`localStorage['idle-legion-analytics'] = "off"`).

If you point this at real users, pair it with a proper consent flow for your
jurisdiction; IP geolocation is personal data under GDPR.

## Links

- Particle UA docs: https://developers.particle.network/universal-accounts/cha/overview
- Web quickstart: https://developers.particle.network/universal-accounts/cha/web-quickstart
- Encode UXMaxx: https://www.encodeclub.com/my-programmes/uxmaxx-hackathon
