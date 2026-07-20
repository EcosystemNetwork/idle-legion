# Idle Legion

**UXMaxx Hackathon · Universal Accounts Track**
Particle Network EIP-7702 · Arbitrum settlement · Magic embedded wallets

> They rugged the Surface. So we dug. Carve an underground **stronghold** beneath a dead mountain, staff its chambers with a **legion** of gladiators (each with an aptitude), and tap to pull **sestertii** and **provisions** from the deep. Send squads to raid the **Wastes**, fight **world bosses** in the Arena, and grow a dynasty. Then fund the **War Chest** with assets from *any* chain — the **Universal Account** reaches across every surviving Chain with no bridge and lands **USDT on Arbitrum**, hiring a Free Company that boosts every room. One login, one balance, no bridge UI.

**A Fallout-Shelter-style base builder × Crypto Dynasty, with a Universal Accounts treasury — and a full degen-Roman apocalypse behind it.**

📖 **The world, factions, and the legend of Kekius Maximus live in [LORE.md](LORE.md).** Every room, raid, and boss draws from that canon.

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

- **🏰 Stronghold** — a Fallout-Shelter-style vertical cutaway. Collect sestertii from the Gold Mine, dig a Granary / War Forge / War Room, and assign gladiators by aptitude (matches glow green). The **Master's Quarters** shows off your boss gladiator as an animated **3D model** (Kekius via `<model-viewer>`).
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

Both **degrade gracefully**: the game runs fully offline, and when the backend is unreachable the UI falls back to a local simulation (a **🟢 LIVE** / **◍ offline sim** badge always tells you which). Server code lives in [`functions/`](functions/); the client bridge is [`src/lib/arena.ts`](src/lib/arena.ts).

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

## Demo script (judges)

1. Open app → **Stronghold** cutaway. Collect gold from the Gold Mine, dig a Granary/War Forge, assign gladiators (aptitude match glows green). Peek at the **Master's Quarters** for the 3D Kekius boss. Feels like a base builder.
2. **Legion** → open a lunchbox, equip gear on a gladiator, watch their might climb.
3. **Raids** → send an idle squad on a timed raid; claim loot + a lunchbox.
4. **Arena** → throw your squad at a world boss and climb the rank.
5. **Marketplace** (the Bazaar) → Magic email login (or browser wallet).
6. Show **unified Primary Assets** balance (multi-chain, one total).
7. Buy an on-chain asset / fund the War Chest — UA sources funds from whatever chain holds Primary Assets; destination is Arbitrum USDT. No bridge, no chain switch.
8. **Free Company** boost unlocks — a permanent multiplier on every room. Link opens UniversalX activity.

## Architecture

```
src/
  game/          pure stronghold engine (rooms, gladiators, production,
                 provisions pressure, rush/incidents, raids, arena bosses,
                 gear/lunchboxes, war-chest boost) + config (all canon copy)
  hooks/         useGame, useWallet
  lib/
    auth.ts      Magic email + injected wallet
    ua.ts        Particle Universal Account (EIP-7702) + Arbitrum transfer
    config.ts    env + Arbitrum USDT address
  App.tsx        cutaway UI (stronghold / legion / arena / raids / marketplace)
                 + <model-viewer> 3D boss showcase
LORE.md          the world bible — setting, factions, Kekius, glossary, voice guide
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
