# Idle Legion — Encode UXMaxx Submission

**Track (main):** Particle Network **Universal Accounts** (EIP-7702 mode)
**Bounties targeted:** Arbitrum (consumer app, on-chain settlement) · Magic Labs (embedded email wallet)

**Live demo:** _(GitHub Pages URL — filled on deploy)_
**Repo:** https://github.com/EcosystemNetwork/idle-legion
**Category:** Consumer / gaming

---

## One-liner

> Dig an underground **stronghold**, staff its rooms with your **legion**, raid the wastes, and fund the **War Chest** with assets from *any* chain.
> Universal Accounts route the value and land it as **USDT on Arbitrum** — one login, one balance, no bridge UI.

A **Fallout-Shelter-style base builder × Crypto Dynasty**, with a Universal Accounts treasury. Idle Legion is a real game first and a wallet demo second. The chain abstraction is felt, not shown: the player never picks a network, never bridges, never touches a gas token. They just fund the war and watch every room's output climb.

## The problem we're attacking

Crypto onboarding for normal players is brutal: install a wallet, seed phrase, pick the right chain, bridge funds, hold the right gas token, sign a scary transaction. Every one of those steps is a churn cliff. A game should feel like a game.

Idle Legion collapses that entire funnel into **email login → one click → funded**, using Particle Universal Accounts so the balance is chain-abstracted and the settlement is invisible.

## How each track requirement is met

| Requirement | Implementation | Where |
|---|---|---|
| Universal Accounts SDK in **EIP-7702 mode** | `new UniversalAccount({ smartAccountOptions: { useEIP7702: true, ownerAddress } })` — EOA is upgraded in place, same address, chain-abstracted balance | [`src/lib/ua.ts`](src/lib/ua.ts) |
| **≥1 cross-chain value move** via UA | `createTransferTransaction` sources Primary Assets from whatever chain holds them and delivers **USDT on Arbitrum One**; `getEIP7702Auth` supplies 7702 authorizations, then `sendTransaction` | [`src/lib/ua.ts`](src/lib/ua.ts) |
| **Runnable demo** | Playable offline instantly; live cross-chain fund with Particle + Magic keys | `npm run dev` |
| **Consumer UX** | Magic email OTP login or browser wallet; no chain switch, no bridge screen, no gas-token theater | [`src/App.tsx`](src/App.tsx) |
| **Arbitrum bounty** | Destination/settlement chain is Arbitrum One; War Chest lands as Arbitrum USDT (`0xFd08…Cbb9`) | [`src/lib/config.ts`](src/lib/config.ts) |
| **Magic bonus** | `magic-sdk` email OTP as the primary, no-MetaMask onboarding path | [`src/lib/auth.ts`](src/lib/auth.ts) |

## Why the UX wins

- **No network picker.** Universal Accounts present one unified USD balance across chains. The player sees `$X`, not "which chain?"
- **No bridge.** Funding the War Chest is a single button. UA routes the liquidity; the player never sees a bridge UI or a second confirmation.
- **No gas-token hunt.** EIP-7702 + UA means the EOA acts as a smart account without a separate deploy or a native-gas balance on the destination.
- **No wallet install required.** Magic email OTP gets a non-crypto player from zero to a funded on-chain action in under a minute.
- **The chain work is diegetic.** On-chain funding maps to an in-game "Mercenary boost" — a permanent gold-per-second multiplier — so the blockchain action has an immediate, legible game payoff.

## Adoption angle

Idle games are one of the highest-retention consumer categories. The monetization-friendly moment (spend to boost) is exactly where we inject a **cross-chain, gasless, one-click on-chain action**. That's a template any consumer app can copy: keep the product native, make the chain invisible, and settle wherever liquidity/fees are best (here, Arbitrum).

## 45-second demo script

1. **Play.** Land on the **Stronghold** cutaway. Collect gold from the Gold Mine, dig a Granary and War Room, assign dwellers by aptitude (matches glow green). It reads as a base builder.
2. **Raid.** Send an idle squad on a timed raid; claim the loot. Might rises.
3. **Onboard.** Open the **War Chest** (Treasury Vault) → log in with **email (Magic)**. No MetaMask.
4. **See the abstraction.** The unified **Primary Assets** balance shows one multi-chain total in USD.
5. **Move value cross-chain.** Click **Send USDT → Arb**. Universal Accounts source funds from whatever chain holds them and settle **USDT on Arbitrum** — no bridge UI, no chain switch.
6. **Payoff + proof.** The **Free Company** boost unlocks (permanent multiplier on every room) and a **UniversalX activity link** proves the cross-chain settlement on-chain.

## Tech

- **Frontend:** Vite + React 19 + TypeScript
- **Chain abstraction:** `@particle-network/universal-account-sdk` (EIP-7702)
- **Embedded wallet:** `magic-sdk` (email OTP)
- **Signing / RPC:** `ethers` v6
- **Game engine:** pure, deterministic TS module ([`src/game/`](src/game/)) with `localStorage` persistence — no backend
- **Deploy:** static build → GitHub Pages (keys injected from CI secrets at build time; never committed)

## Honesty notes

- Original build for UXMaxx — legion idle theme, not a fork or re-skin of a production app.
- Secrets stay out of git (`.env` is gitignored); the deployed build receives publishable, domain-restricted client keys via CI.
- Default fund amount is `0.1` USDT to keep mainnet Primary Asset demos cheap.

## Links

- Particle Universal Accounts docs: https://developers.particle.network/universal-accounts/cha/overview
- Web quickstart: https://developers.particle.network/universal-accounts/cha/web-quickstart
- Encode UXMaxx: https://www.encodeclub.com/my-programmes/uxmaxx-hackathon
