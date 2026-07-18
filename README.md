# Idle Legion

**UXMaxx Hackathon · Universal Accounts Track**  
Particle Network EIP-7702 · Arbitrum settlement · Magic embedded wallets

> Dig an underground **stronghold**, staff its rooms with your **legion** (each dweller has an aptitude), and tap to collect gold and provisions. Send squads on **raids**, survive **incidents**, and grow a dynasty. Then fund the **War Chest** with assets from *any* chain — Universal Accounts route value and land **USDT on Arbitrum**, hiring a Free Company that boosts every room. One login, one balance, no bridge UI.

**A Fallout-Shelter-style base builder × Crypto Dynasty, with a Universal Accounts treasury.**

## Why this hits the track

| Requirement | How Idle Legion does it |
|-------------|-------------------------|
| Universal Accounts SDK **EIP-7702 mode** | `useEIP7702: true` on `UniversalAccount` — EOA upgraded in place |
| ≥1 **cross-chain value move** via UA | `createTransferTransaction` → USDT on **Arbitrum One** from unified Primary Assets |
| Functional demo | Playable idle game offline; live UA with Particle + wallet/Magic keys |
| Consumer UX | Magic email login or browser wallet; no chain switch, no gas token theater |
| Arbitrum bounty | Settlement / destination chain is Arbitrum |
| Magic bonus | Magic email OTP embedded wallet as primary auth path |

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

The **idle game** (recruit, barracks, raids, local save) works fully offline.  
War Chest live transfer needs Particle dashboard keys.

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

1. Open app → **Stronghold** cutaway. Collect gold from the Gold Mine, dig a Granary/War Forge, assign dwellers (aptitude match glows green). Feels like a base builder.
2. **Raids** → send an idle squad on a timed raid; claim loot.
3. **War Chest** tab (Treasury Vault) → Magic email login (or browser wallet).
4. Show **unified Primary Assets** balance (multi-chain, one total).
5. Click **Send USDT → Arb** — UA sources funds from whatever chain holds Primary Assets; destination is Arbitrum USDT.
6. **Free Company** boost unlocks — a permanent multiplier on every room. Link opens UniversalX activity.

## Architecture

```
src/
  game/          pure stronghold engine (rooms, dwellers, production,
                 provisions pressure, rush/incidents, raids, war-chest boost)
  hooks/         useGame, useWallet
  lib/
    auth.ts      Magic email + injected wallet
    ua.ts        Particle Universal Account (EIP-7702) + Arbitrum transfer
    config.ts    env + Arbitrum USDT address
  App.tsx        cutaway UI (stronghold / legion / raids / war chest)
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

## Links

- Particle UA docs: https://developers.particle.network/universal-accounts/cha/overview  
- Web quickstart: https://developers.particle.network/universal-accounts/cha/web-quickstart  
- Encode UXMaxx: https://www.encodeclub.com/my-programmes/uxmaxx-hackathon  
