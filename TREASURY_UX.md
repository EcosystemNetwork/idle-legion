# The Treasury — economy & transaction UX

How Idle Legion's money works, why it is shaped this way, and where each rule
lives in code. Read this before changing anything in `src/components/treasury/`
or `src/game/economy.ts`.

The target: a player who has never touched a blockchain thinks *"I am funding my
empire."* A player who has can still inspect the chain, the account, the routing
and the transaction hash — one disclosure away, never in the main flow.

---

## 1. What changed

Before, the economy was three top-level tabs that read as unrelated products:

```
… ⚔️ Arena   💱 Exchange   🗺️ Realm   🏛️ Market   📜 Codex
                  ↑ DEX+Bank    ↑ land      ↑ store + the only wallet UI
```

The Market tab opened with *"the Universal Account reaches any Chain and settles
cross-chain as USDT on Arbitrum (Particle EIP-7702)"* — four proper nouns and an
EIP number before the player learned they could buy a sword.

Now there is one destination with seven rooms:

```
… ⚔️ Arena   🏛️ Treasury   📜 Codex
                  │
                  ├── 🏛️ Vaults     what you hold, and what each thing is for
                  ├── ⚖️ Bazaar     sell for gold · premium stalls
                  ├── 💱 Exchange   gold ⇄ $LEGION
                  ├── 🏦 Bank       lend $LEGION, earn interest
                  ├── 🪖 War Chest  hire the Free Company, collect the vault
                  ├── 🗺️ Estates    land parcels and yields
                  └── 📜 Ledger     account, balance, history
```

Rooms keep their own unlock gates (`game/unlocks.ts`), so a new player entering
the Treasury sees Vaults, Bazaar, War Chest and Ledger, with Exchange, Bank and
Estates visibly locked and labelled with what earns them.

---

## 2. Resource hierarchy

Three rungs, named for what the player *does* with them. Defined once in
`game/economy.ts` (`RESOURCE_TIER_META`, `RESOURCES`) and rendered by the Vaults
room; nothing else in the app is allowed to invent a fourth framing.

| Rung | Contents | How it's framed |
|---|---|---|
| **Stores** | 🪙 Gold · 🌾 Provisions · ⛑️ Salves | "Everyday supplies. Earned by playing, spent constantly." |
| **Standing** | 💠 $LEGION | "Slow, scarce, and strategic. Buys land and earns interest." |
| **Treasury** | 🏛️ external balance (USDT) | "Outside value you may add if you want to. **Never required.**" |

The resource bar chip that used to read `🔗 Balance · 0x8fa2…9c31` now reads
`🏛️ Treasury · your account`. The address moved to the Ledger, where a player
who wants it will go looking.

---

## 3. Web2-first onboarding

The seven requirements, and where each is enforced:

1. **Play before connecting.** The Treasury tab is gated on 5,000 lifetime gold
   (`unlocks.ts`). No sign-in prompt exists anywhere before it — not on boot, not
   on the Kingdom screen, not in a modal.
2. **Benefit before transaction.** The stall card carries utility, before/after,
   rarity, ownership, total cost, why-it-matters and the free path. The
   transaction sheet only opens after the player presses **Review**.
3. **Email is the default.** `TreasuryIdentity` puts the email field first and
   largest. "I already have a crypto wallet" is a text link underneath. The word
   *wallet* appears exactly once in the signed-out state.
4. **One balance.** `Treasury balance: $12.40` — one number, with the caption
   "One balance. We handle where it lives." Per-chain holdings exist only inside
   *Advanced account details*.
5. **Plain-language confirmation.** Every sheet shows, always: what you spend,
   the fee on its own line, the total, what you receive, and whether it's
   tradable or account-bound. No exceptions, no collapsed rows.
6. **Every state has copy.** See §5.
7. **Return to the reward.** Success ends on `See your gladiator →`, which
   closes the sheet and navigates to the Legion (or the War Chest for a
   contract). The reward target is captured when the intent opens.

Signed-out players are never blocked with a disabled button — the stall's CTA
becomes **Sign in to buy** and routes to the Ledger.

---

## 4. Wireframes

### Stall card (`ListingCard.tsx`)

```
┌──────────────────────────────────────┐
│ [art]                    ⚔️ POWER    │  category badge, colour-coded
│                                      │
│ ★★★★★                                │  rarity
├──────────────────────────────────────┤
│ Emberforged Blades                   │
│ Equips to one gladiator's weapon     │  utility, one sentence
│ slot for +36 might.                  │
│ ┌──────────────────────────────────┐ │
│ │ LEGION MIGHT                     │ │  before → after,
│ │ 1,240  →  1,264          +2%     │ │  computed from the live save
│ └──────────────────────────────────┘ │
│ [Legendary] [🔁 Tradable]            │  rarity · ownership type
│ WHY NOW  Your best weapon is +12     │  why it matters to THIS player
│          might. This lifts the whole │
│          legion by 24.               │
│ FREE PATH  Crates and raid loot drop │  the honest alternative
│            gear of every rarity —    │
│            and duplicates fuse.      │
├──────────────────────────────────────┤
│ $0.21                     [ Review ] │  total, with the split beneath
│ $0.20 + $0.01 fee                    │
└──────────────────────────────────────┘
```

### Transaction sheet — review (`TxSheet.tsx`)

```
┌────────────────────────────────────────────┐
│ Claim Emberforged Blades for the armoury ✕ │  diegetic headline
├────────────────────────────────────────────┤
│ You spend                          $0.20   │
│ Network fee                        $0.01   │  never buried
│ Total                              $0.21   │  emphasised
│ You receive        🛡️ Emberforged Blades   │
│ Ownership              🔁 Tradable         │
├────────────────────────────────────────────┤
│ You own this outright and may sell or      │
│ transfer it later.                         │
│                                            │
│ IF YOU DO THIS                             │
│ Legion might     1,240 → 1,264      +2%    │
│                                            │
│ ┌ There is a free path to this: crates    ┐│  shown for every "power" item
│ │ and raid loot drop gear of every rarity.││
│ └────────────────────────────────────────┘│
│ This price is held for 74s.                │
│                                            │
│           [ Not now ]  [ Strike the        │
│                          bargain · $0.21 ] │
│ ▸ View transaction details                 │  the ONLY place chains appear
└────────────────────────────────────────────┘
```

Expanded, `View transaction details` reveals: settles as USDT on Arbitrum;
routed by Particle Universal Account · EIP-7702 chain-abstracted EOA; the
account address; the transaction id; an explorer link; and the raw error string
when one exists.

### War Chest

```
┌ Your company ────────┐ ┌ Chest yield ─────────┐
│ Free Company         │ │ 1,204 / 4,000        │
│ +60% output on every │ │ +0.40 gold/s         │
│ chamber              │ │ [ Collect 🪙 1,204 ] │
└──────────────────────┘ └──────────────────────┘

COMPANY RANKS
✓ Scout Mercs    +15% output    $0.10 total funded
✓ Company        +35% output    $0.50 total funded
✓ Free Company   +60% output    $1.00 total funded
○ War Host      +125% output    $5.00 total funded
  $4.00 more funded in total reaches War Host.

FUND THE CHEST
[ $0.10 ] [ $0.50 ] [ $1.00 ] [ $5.00 ]
  Scout     Company   Free Co.  War Host

│ The Free Company bonus is bound to this legion: it cannot be sold,
│ traded or transferred, and it does not unlock any content you couldn't
│ reach by playing. The same bonus is granted free — permanently — by
│ Descending to a deeper stronghold, which banks Renown.
```

Exchange, Bank and Estates follow the same skeleton: a room header that explains
the mechanic in two sentences of plain language, the controls, then a fine-print
block that says the awkward part out loud (the 0.3% cut, the withdrawal-fee
decay schedule, the fact that $LEGION's rate comes from the in-game reserve
alone and is not a promise of outside value).

---

## 5. Transaction states

One state machine, `useTreasuryTx.ts`. Every state has a headline, a body that
says whether money moved, and exactly one obvious next action.

| Phase | Headline | Key promise in the body |
|---|---|---|
| `review` | *the intent's own title* | price held for 90s |
| `approving` | Awaiting your seal | "Nothing has left yet." |
| `pending` | The coin is on the road | "you can keep playing" |
| `success` | It is done | restates the before/after, offers the reward |
| `rejected` | You called it off | "nothing left your treasury" |
| `insufficient` | Your treasury is short | "Nothing was spent… everything here has a free path." |
| `expired` | That price has gone stale | "we won't charge you against an old one" |
| `offline` | The roads are cut | "your stronghold keeps producing" |
| `failed` | The transfer didn't go through | "Nothing was taken from your treasury." |

Notes:

- **`approving` vs `pending` are different screens.** They are different waits
  with different anxieties — one is "go look at your other app", the other is
  "sit tight".
- **Quote expiry is enforced, not decorative.** After 90s the sheet moves to
  `expired` rather than charging against a stale price.
- **Offline is detected two ways**: the `online`/`offline` events, and a
  `navigator.onLine` check at the moment of confirm.
- **Failures are written to the ledger too**, so the player can always look back
  and see that nothing was taken.
- Error classification (`classifyError`) reads the signer message
  synchronously via `wallet.readError()` — a ref, not React state, because state
  is still stale in the tick a call fails and a user rejection would otherwise be
  misreported as a system failure.

---

## 6. Anti-pay-to-win policy

Enforced in `game/economy.ts`, surfaced on every card.

1. **Four visible buckets** (`ValueClass`): Power, Convenience, Cosmetic,
   Collectible. The badge sits on the art, not in a tooltip.
2. **Every power item names its free path.** `listingFacts()` returns a
   `freePath` string for all three listing kinds, and the transaction sheet
   repeats it as a note before the confirm button. Gear → crates, raid loot and
   fusion. Gladiators → the slave market and the summoning pit. The Free
   Company bonus → Descending banks Renown, which grants the same multiplier
   permanently for free.
3. **The Bazaar leads with the disclaimer, not the goods.** The fairness banner
   sits above the paid grid: *"Nothing here is required… The stalls sell time,
   not victory."*
4. **The card tells you when not to buy.** If the player already fields better
   gear in that slot, `why` reads *"Your legion already fields +28 might here, so
   this would sit in storage. Spend elsewhere."*
5. **Ownership is stated, not implied.** `🔁 Tradable` vs `🔒 Account-bound` vs
   `🎖️ Earned in game`, with the consequence spelled out in the sheet.
6. **No manufactured urgency.** No countdown timers on offers, no "only 3 left",
   no streak-loss threats, no discount theatre. The only timer in the system is
   the 90-second quote hold, which exists to protect the player.
7. **No value promises.** $LEGION is described as a game currency whose rate
   comes from the in-game reserve. Nothing anywhere suggests an asset will
   appreciate.

---

## 7. Files

| File | Responsibility |
|---|---|
| `src/game/economy.ts` | Resource hierarchy, value classes, ownership, `listingFacts()` (before/after, why, free path), company tiers. No React, no chain. |
| `src/components/treasury/Treasury.tsx` | The destination: room nav, the seven rooms, intent assembly. |
| `src/components/treasury/ListingCard.tsx` | The stall card. |
| `src/components/treasury/TxSheet.tsx` | The one confirmation surface + all nine states. |
| `src/components/treasury/TreasuryIdentity.tsx` | Sign-in and the unified balance; advanced account disclosure. |
| `src/components/treasury/useTreasuryTx.ts` | Transaction state machine, quote TTL, error classification, local ledger. |
| `src/components/treasury/treasury.css` | Visual system, desktop + mobile. |
| `src/game/unlocks.ts` | `treasury` tab gate; `exchange` / `realm` now gate rooms. |

### Reuse

`useTreasuryTx` takes its `send` function as a parameter, so any future flow
(a land auction, a season pass, a tournament entry) gets the same seven states
and the same confirmation contract by constructing a `TxIntent` — it does not
need to know anything about how value moves.

---

## 8. Responsive

- **Desktop** — room nav is an auto-fit grid; stalls at `minmax(268px, 1fr)`;
  the transaction sheet is a centred 480px dialog.
- **≤820px** — nav sub-labels drop, stalls tighten to 240px.
- **≤560px** — the nav becomes a horizontally scrolling, snap-aligned rail so
  the current room stays visible; stalls go single-column; the transaction sheet
  becomes a bottom sheet that slides up, with stacked full-width actions
  (primary on top under the thumb).
- `prefers-reduced-motion` disables the sheet's entrance animation and slows the
  spinner.
