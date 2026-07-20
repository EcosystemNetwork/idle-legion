// The Treasury — one destination for everything that used to be three tabs and
// a scattering of crypto dashboards.
//
// Information architecture:
//
//   Treasury
//   ├── Vaults      the resource hierarchy, at a glance, with what to do next
//   ├── Bazaar      buy and sell (gold market + optional treasury market)
//   ├── Exchange    gold ⇄ $LEGION
//   ├── Bank        stake $LEGION for interest
//   ├── War Chest   fund the Free Company, collect the vault
//   ├── Estates     land parcels and their yields
//   └── Ledger      account, balance, transaction history
//
// The player moves between these without ever leaving "the treasury", which is
// the whole point: it reads as one building with rooms, not seven products.

import { useMemo, useState } from "react";
import type { DerivedStats, GameState, LandKind, OnchainListing, Rarity } from "../../game/types";
import type { useGame } from "../../hooks/useGame";
import type { useWallet } from "../../hooks/useWallet";
import {
  LAND_KIND_META,
  LAND_MIN_MIGHT,
  LAND_SLOTS,
  LAND_YIELD,
  ONCHAIN_LISTINGS,
  RARITY_META,
  TIERS,
  TIER_PORTRAIT,
  WARCHEST_YIELD_PER_USD,
} from "../../game/config";
import {
  bankPending,
  bankWithdrawFee,
  dexPrice,
  formatNum,
  gearDefOf,
  gearSellValue,
  heroSellValue,
  inventoryGear,
  landClaimCost,
  landSlotsLeft,
  landUpgradeCost,
  landYields,
  quoteGoldToLegion,
  quoteLegionToGold,
  warChestStoreCap,
  warChestYield,
} from "../../game/engine";
import {
  COMPANY_TIERS,
  NETWORK_FEE_USD,
  RESOURCES,
  RESOURCE_TIER_META,
  TIER_RARITY,
  companyTier,
  listingFacts,
  nextCompanyTier,
  usd,
  vaultYieldAt,
} from "../../game/economy";
import { tabUnlock } from "../../game/unlocks";
import ListingCard from "./ListingCard";
import TreasuryIdentity from "./TreasuryIdentity";
import TxSheet from "./TxSheet";
import { useTreasuryTx } from "./useTreasuryTx";
import type { TxIntent } from "./useTreasuryTx";
import "./treasury.css";

type Actions = ReturnType<typeof useGame>["actions"];
type Wallet = ReturnType<typeof useWallet>;

export type TreasurySection =
  | "vaults"
  | "bazaar"
  | "exchange"
  | "bank"
  | "warchest"
  | "estates"
  | "ledger";

const SECTIONS: {
  id: TreasurySection;
  label: string;
  icon: string;
  sub: string;
  /** Unlock id in game/unlocks.ts, when the room is earned rather than given. */
  gate?: "exchange" | "realm";
}[] = [
  { id: "vaults", label: "Vaults", icon: "🏛️", sub: "what you hold" },
  { id: "bazaar", label: "Bazaar", icon: "⚖️", sub: "buy & sell" },
  { id: "exchange", label: "Exchange", icon: "💱", sub: "gold ⇄ $LEGION", gate: "exchange" },
  { id: "bank", label: "Bank", icon: "🏦", sub: "earn interest", gate: "exchange" },
  { id: "warchest", label: "War Chest", icon: "🪖", sub: "hire the company" },
  { id: "estates", label: "Estates", icon: "🗺️", sub: "land & yields", gate: "realm" },
  { id: "ledger", label: "Ledger", icon: "📜", sub: "account & history" },
];

export default function Treasury({
  state,
  stats,
  now,
  actions,
  wallet,
  section,
  onSection,
  onHero,
  onGoTo,
}: {
  state: GameState;
  stats: DerivedStats;
  now: number;
  actions: Actions;
  wallet: Wallet;
  section: TreasurySection;
  onSection: (s: TreasurySection) => void;
  onHero: (id: string) => void;
  /** Jump to another part of the game after a reward lands. */
  onGoTo: (tab: string) => void;
}) {
  const tx = useTreasuryTx(
    (amount) => wallet.fundWarChest(amount),
    wallet.readError,
  );
  const [rewardTarget, setRewardTarget] = useState<() => void>(() => () => {});

  const sections = SECTIONS.map((s) => ({
    ...s,
    unlock: s.gate ? tabUnlock(state, stats.might, s.gate) : { unlocked: true, hint: "" },
  }));
  const active = sections.find((s) => s.id === section) ?? sections[0];
  const shown = active.unlock.unlocked ? active.id : "vaults";

  /** Everything a purchase needs, assembled once so every caller is consistent. */
  const buy = (l: OnchainListing) => {
    const facts = listingFacts(state, stats, l);
    const intent: TxIntent = {
      id: l.id,
      title:
        l.kind === "boost"
          ? "Hire the Free Company"
          : l.kind === "hero"
            ? `Bring ${l.label} into the legion`
            : `Claim ${l.label} for the armoury`,
      action: l.kind === "boost" ? "Fund the War Chest" : "Strike the bargain",
      spendUsd: l.priceUsd,
      feeUsd: NETWORK_FEE_USD,
      receive: l.label,
      receiveIcon: l.kind === "hero" ? "🗡️" : l.kind === "gear" ? "🛡️" : "🪖",
      ownership: facts.ownership,
      changes: facts.changes,
      note:
        facts.category === "power"
          ? `There is a free path to this: ${facts.freePath}`
          : undefined,
      rewardLabel:
        l.kind === "hero" ? "See your gladiator" : l.kind === "gear" ? "Open the armoury" : "See the bonus",
      onSettled: (txId, amountUsd) => {
        if (l.kind === "hero" && l.tier) actions.grantGladiator(l.tier);
        else if (l.kind === "gear" && l.defId) actions.grantGear(l.defId);
        else actions.applyFunding(amountUsd, txId);
      },
    };
    setRewardTarget(() => () => {
      if (l.kind === "hero") onGoTo("legion");
      else if (l.kind === "gear") onGoTo("legion");
      else onSection("warchest");
    });
    tx.open(intent);
  };

  const fundWarChest = (amountUsd: number) => {
    const before = state.mercenaryBoost;
    const after = COMPANY_TIERS.reduce(
      (b, t) => (state.warChestUsd + amountUsd >= t.minUsd ? Math.max(b, t.boost) : b),
      before,
    );
    const beforeVault = warChestYield(state);
    const afterVault = vaultYieldAt(state, state.warChestUsd + amountUsd);
    setRewardTarget(() => () => onSection("warchest"));
    tx.open({
      id: `warchest-${amountUsd}`,
      title: "Fund the War Chest",
      action: "Fund the War Chest",
      spendUsd: amountUsd,
      feeUsd: NETWORK_FEE_USD,
      receive: "A permanent Free Company contract",
      receiveIcon: "🪖",
      ownership: "bound",
      changes: [
        {
          label: "Output bonus",
          before: `+${Math.round(before * 100)}%`,
          after: `+${Math.round(after * 100)}%`,
          deltaPct: (after - before) * 100,
          better: after > before,
        },
        {
          label: "Vault yield",
          before: `${beforeVault.toFixed(2)} gold/s`,
          after: `${afterVault.toFixed(2)} gold/s`,
          deltaPct: beforeVault > 0 ? ((afterVault - beforeVault) / beforeVault) * 100 : 100,
          better: true,
        },
      ],
      note:
        "This bonus is bound to your legion and cannot be sold or transferred. Descending banks Renown, which raises the same bonus for free.",
      rewardLabel: "See the War Chest",
      onSettled: (txId, amount) => actions.applyFunding(amount, txId),
    });
  };

  return (
    <section className="panel treasury">
      <header className="tr-head">
        <div>
          <h2>🏛️ The Treasury</h2>
          <p className="muted small">
            Everything your legion holds, trades, lends and owns — under one roof.
          </p>
        </div>
        <div className="tr-head-bal">
          <span className="trb">
            🪙 <b>{formatNum(state.gold)}</b>
          </span>
          <span className="trb">
            💠 <b>{formatNum(state.legion)}</b>
          </span>
          <span className="trb ext">
            🏛️ <b>{wallet.totalUsd == null ? (wallet.session ? "…" : "—") : usd(wallet.totalUsd)}</b>
          </span>
        </div>
      </header>

      <nav className="tr-nav" aria-label="Treasury rooms">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`tr-nav-btn ${shown === s.id ? "on" : ""} ${s.unlock.unlocked ? "" : "locked"}`}
            disabled={!s.unlock.unlocked}
            title={s.unlock.unlocked ? s.sub : `Locked — ${s.unlock.hint}`}
            onClick={() => onSection(s.id)}
          >
            <span className="tr-nav-ic">{s.unlock.unlocked ? s.icon : "🔒"}</span>
            <span className="tr-nav-txt">
              <b>{s.label}</b>
              <small>{s.unlock.unlocked ? s.sub : s.unlock.hint}</small>
            </span>
            {s.id === "warchest" && state.warChest.stored >= 1 && <i className="dot" />}
          </button>
        ))}
      </nav>

      {shown === "vaults" && <Vaults state={state} stats={stats} wallet={wallet} onSection={onSection} />}
      {shown === "bazaar" && (
        <Bazaar state={state} stats={stats} actions={actions} wallet={wallet} onBuy={buy} onHero={onHero} onSection={onSection} />
      )}
      {shown === "exchange" && <Exchange state={state} actions={actions} />}
      {shown === "bank" && <Bank state={state} now={now} actions={actions} />}
      {shown === "warchest" && <WarChest state={state} actions={actions} wallet={wallet} onFund={fundWarChest} onSection={onSection} />}
      {shown === "estates" && <Estates state={state} stats={stats} actions={actions} />}
      {shown === "ledger" && <Ledger state={state} wallet={wallet} tx={tx} />}

      <TxSheet
        tx={tx}
        addressLine={wallet.uaAddress ?? wallet.session?.address ?? null}
        onGoToReward={() => rewardTarget()}
        onTopUp={() => onSection("ledger")}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vaults — the resource hierarchy, made legible
// ---------------------------------------------------------------------------

function Vaults({
  state,
  stats,
  wallet,
  onSection,
}: {
  state: GameState;
  stats: DerivedStats;
  wallet: Wallet;
  onSection: (s: TreasurySection) => void;
}) {
  const rows: {
    tier: keyof typeof RESOURCE_TIER_META;
    items: { key: string; value: string; rate?: string }[];
  }[] = [
    {
      tier: "basic",
      items: [
        { key: "gold", value: formatNum(state.gold), rate: `+${stats.goldPerSec.toFixed(1)}/s` },
        {
          key: "provisions",
          value: formatNum(state.provisions),
          rate: `${stats.provisionsPerSec >= 0 ? "+" : ""}${stats.provisionsPerSec.toFixed(2)}/s`,
        },
        {
          key: "salves",
          value: formatNum(state.salves),
          rate: `${stats.salvesPerSec >= 0 ? "+" : ""}${stats.salvesPerSec.toFixed(2)}/s`,
        },
      ],
    },
    {
      tier: "strategic",
      items: [
        {
          key: "legion",
          value: formatNum(state.legion),
          rate: stats.legionPerSec > 0 ? `+${stats.legionPerSec.toFixed(2)}/s` : "—",
        },
      ],
    },
    {
      tier: "treasury",
      items: [
        {
          key: "treasury",
          value: wallet.totalUsd == null ? (wallet.session ? "…" : "—") : usd(wallet.totalUsd),
          rate: wallet.session ? "your account" : "not opened",
        },
      ],
    },
  ];

  return (
    <div className="tr-vaults">
      {rows.map((row) => {
        const meta = RESOURCE_TIER_META[row.tier];
        return (
          <section key={row.tier} className={`vault-tier t-${row.tier}`} style={{ ["--accent" as string]: meta.accent }}>
            <header>
              <h3>{meta.label}</h3>
              <p className="muted small">{meta.note}</p>
            </header>
            <div className="vault-tier-items">
              {row.items.map((it) => {
                const r = RESOURCES[it.key];
                return (
                  <article key={it.key} className="vault-item">
                    <span className="vi-ic">{r.icon}</span>
                    <div className="vi-body">
                      <span className="vi-name">{r.label}</span>
                      <b className="vi-val">{it.value}</b>
                      <small className="vi-rate">{it.rate}</small>
                      <p className="vi-blurb muted small">{r.blurb}</p>
                      <p className="vi-earn small">{r.earnedBy}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="tr-next">
        <h4>What you can do here</h4>
        <ul>
          <li>
            <button type="button" className="link-btn" onClick={() => onSection("bazaar")}>
              Bazaar
            </button>{" "}
            — sell spare gear and gladiators for gold, or browse the premium stalls.
          </li>
          <li>
            <button type="button" className="link-btn" onClick={() => onSection("exchange")}>
              Exchange
            </button>{" "}
            — turn surplus gold into $LEGION when you&apos;re saving for land.
          </li>
          <li>
            <button type="button" className="link-btn" onClick={() => onSection("bank")}>
              Bank
            </button>{" "}
            — lend $LEGION you aren&apos;t spending and collect interest each second.
          </li>
          <li>
            <button type="button" className="link-btn" onClick={() => onSection("estates")}>
              Estates
            </button>{" "}
            — claim parcels that produce forever, with no upkeep.
          </li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bazaar
// ---------------------------------------------------------------------------

function Bazaar({
  state,
  stats,
  actions,
  wallet,
  onBuy,
  onHero,
  onSection,
}: {
  state: GameState;
  stats: DerivedStats;
  actions: Actions;
  wallet: Wallet;
  onBuy: (l: OnchainListing) => void;
  onHero: (id: string) => void;
  onSection: (s: TreasurySection) => void;
}) {
  const [mode, setMode] = useState<"sell" | "buy">("sell");
  const [kind, setKind] = useState<"all" | OnchainListing["kind"]>("all");
  const [rarity, setRarity] = useState<"all" | Rarity>("all");
  const [sort, setSort] = useState<"rarity" | "cheap" | "dear">("rarity");
  const [query, setQuery] = useState("");

  const inv = inventoryGear(state);
  const sellable = [...state.dwellers].sort((a, b) => TIERS[b.tier].might - TIERS[a.tier].might);
  const gearPile = inv.reduce((sum, item) => sum + gearSellValue(item.defId), 0);

  const listings = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = ONCHAIN_LISTINGS.filter(
      (l) =>
        (kind === "all" || l.kind === kind) &&
        (rarity === "all" || l.rarity === rarity) &&
        (q === "" || l.label.toLowerCase().includes(q) || l.sub.toLowerCase().includes(q)),
    );
    out.sort((a, b) =>
      sort === "cheap"
        ? a.priceUsd - b.priceUsd
        : sort === "dear"
          ? b.priceUsd - a.priceUsd
          : RARITY_META[b.rarity].stars - RARITY_META[a.rarity].stars || b.priceUsd - a.priceUsd,
    );
    return out;
  }, [kind, rarity, sort, query]);

  // Signed out is not an error state — the card still opens, it just routes to
  // the Ledger first. A disabled button with a tooltip teaches nothing.
  const signedOut = wallet.caps.particle && !wallet.session;
  const canBuy = Boolean(wallet.caps.particle && !wallet.busy);
  const reason = wallet.caps.particle
    ? "One moment…"
    : "Premium stalls are unavailable in this build.";

  return (
    <div className="tr-bazaar">
      <div className="mkt-switch">
        <button type="button" className={mode === "sell" ? "on" : ""} onClick={() => setMode("sell")}>
          💰 Sell for gold <span className="muted small">{sellable.length + inv.length}</span>
        </button>
        <button type="button" className={mode === "buy" ? "on" : ""} onClick={() => setMode("buy")}>
          ⚖️ Premium stalls <span className="muted small">{ONCHAIN_LISTINGS.length}</span>
        </button>
      </div>

      {mode === "sell" ? (
        <div className="sell-cols">
          <div className="sell-col">
            <div className="sell-head">
              <h4 className="ml">
                🗡️ Gladiators <span className="muted small">{sellable.length}</span>
              </h4>
              <span className="muted small">Selling frees a bunk — you must keep one.</span>
            </div>
            <div className="sell-grid">
              {sellable.map((d) => (
                <div key={d.id} className="sell-item" style={{ ["--rar" as string]: RARITY_META[TIER_RARITY[d.tier]].color }}>
                  <img src={TIER_PORTRAIT[d.tier]} alt={d.name} onClick={() => onHero(d.id)} />
                  <div className="sell-info">
                    <span className="sell-name">{d.name}</span>
                    <span className="sell-tier" style={{ color: RARITY_META[TIER_RARITY[d.tier]].color }}>
                      {TIERS[d.tier].name} Lv{d.level}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="chip-btn sell-btn"
                    disabled={state.dwellers.length <= 1}
                    onClick={() => actions.sellHero(d.id)}
                  >
                    🪙 {formatNum(heroSellValue(d))}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="sell-col">
            <div className="sell-head">
              <h4 className="ml">
                🛡️ Spare gear <span className="muted small">{inv.length}</span>
              </h4>
              {inv.length > 0 && <span className="muted small">Pile is worth 🪙 {formatNum(gearPile)}</span>}
            </div>
            <div className="sell-grid">
              {inv.length === 0 && (
                <p className="muted small">
                  No spare gear. Open crates or win raids — both drop gear at every rarity.
                </p>
              )}
              {inv.map((item) => {
                const g = gearDefOf(item);
                return (
                  <div key={item.id} className="sell-item" style={{ ["--rar" as string]: RARITY_META[g.rarity].color }}>
                    <img src={g.img} alt={g.name} />
                    <div className="sell-info">
                      <span className="sell-name">{g.name}</span>
                      <span className="sell-tier" style={{ color: RARITY_META[g.rarity].color }}>
                        +{g.might}⚔ {g.slot}
                      </span>
                    </div>
                    <button type="button" className="chip-btn sell-btn" onClick={() => actions.sellGear(item.id)}>
                      🪙 {formatNum(gearSellValue(item.defId))}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="tr-fairness">
            <span className="fair-ic" aria-hidden>
              🎖️
            </span>
            <p>
              <b>Nothing here is required.</b> Every gladiator and every piece of gear in these stalls
              also drops from crates, raids and the summoning pit. The stalls sell time, not victory —
              each card shows you the free route to the same power.
            </p>
          </div>

          {!wallet.session && (
            <p className="tr-hint">
              Browsing is free. You&apos;ll only be asked to open an account when you decide to buy
              something —{" "}
              <button type="button" className="link-btn" onClick={() => onSection("ledger")}>
                or open one now
              </button>
              .
            </p>
          )}

          <div className="mkt-filters">
            <div className="mkt-chips">
              {(
                [
                  ["all", "All"],
                  ["hero", "🗡️ Gladiators"],
                  ["gear", "🛡️ Gear"],
                  ["boost", "🪖 Contracts"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" className={`f-chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="mkt-chips">
              <button type="button" className={`f-chip ${rarity === "all" ? "on" : ""}`} onClick={() => setRarity("all")}>
                Any rarity
              </button>
              {(["epic", "legendary"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`f-chip ${rarity === r ? "on" : ""}`}
                  style={{ ["--rar" as string]: RARITY_META[r].color }}
                  onClick={() => setRarity(r)}
                >
                  {RARITY_META[r].name}
                </button>
              ))}
            </div>
            <input
              className="mkt-search"
              type="search"
              placeholder="Search the stalls…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select className="mkt-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="rarity">Rarest first</option>
              <option value="cheap">Cheapest first</option>
              <option value="dear">Priciest first</option>
            </select>
          </div>

          <div className="bz-grid">
            {listings.length === 0 && <p className="muted small">Nothing in the stalls matches that.</p>}
            {listings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                facts={listingFacts(state, stats, l)}
                canBuy={canBuy}
                ctaLabel={signedOut ? "Sign in to buy" : "Review"}
                disabledReason={reason}
                onBuy={() => (signedOut ? onSection("ledger") : onBuy(l))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exchange
// ---------------------------------------------------------------------------

function Exchange({ state, actions }: { state: GameState; actions: Actions }) {
  const [goldIn, setGoldIn] = useState("");
  const [legionIn, setLegionIn] = useState("");
  const price = dexPrice(state);
  const gN = Number(goldIn) || 0;
  const lN = Number(legionIn) || 0;
  const outLegion = quoteGoldToLegion(state, gN);
  const outGold = quoteLegionToGold(state, lN);
  const goldShort = gN > state.gold;
  const legionShort = lN > state.legion;

  return (
    <div className="tr-room exchange-room">
      <header className="tr-room-head">
        <h3>💱 The Exchange</h3>
        <p className="muted small">
          The money-changers will trade your gold for $LEGION, the legion&apos;s own coin. $LEGION is
          slow to earn and buys land, summonings and interest — so most players trade here when
          they&apos;re saving for a parcel.
        </p>
        <div className="rank-chip">1,000 gold ≈ 💠 {(price * 1000).toFixed(2)} $LEGION</div>
      </header>

      <div className="xc-cols">
        <div className="xc-card">
          <h4 className="ml">🪙 Gold → 💠 $LEGION</h4>
          <div className="swap-row">
            <input
              type="number"
              min="0"
              placeholder="gold to trade"
              value={goldIn}
              onChange={(e) => setGoldIn(e.target.value)}
            />
            <span className="swap-arrow">→ 💠 {formatNum(outLegion)}</span>
          </div>
          <div className="swap-foot">
            <span className="muted small">
              You hold 🪙 {formatNum(state.gold)}
              {goldShort && <b className="short"> — not enough for that trade</b>}
            </span>
            <button
              type="button"
              className="btn"
              disabled={gN <= 0 || goldShort}
              onClick={() => {
                actions.swapGoldForLegion(gN);
                setGoldIn("");
              }}
            >
              Trade
            </button>
          </div>
        </div>

        <div className="xc-card">
          <h4 className="ml">💠 $LEGION → 🪙 Gold</h4>
          <div className="swap-row">
            <input
              type="number"
              min="0"
              placeholder="$LEGION to trade"
              value={legionIn}
              onChange={(e) => setLegionIn(e.target.value)}
            />
            <span className="swap-arrow">→ 🪙 {formatNum(outGold)}</span>
          </div>
          <div className="swap-foot">
            <span className="muted small">
              You hold 💠 {formatNum(state.legion)}
              {legionShort && <b className="short"> — not enough for that trade</b>}
            </span>
            <button
              type="button"
              className="btn secondary"
              disabled={lN <= 0 || legionShort}
              onClick={() => {
                actions.swapLegionForGold(lN);
                setLegionIn("");
              }}
            >
              Trade
            </button>
          </div>
        </div>
      </div>

      <p className="tr-fineprint">
        The changers keep 0.3% of every trade. Their reserve holds 🪙 {formatNum(state.dex.poolGold)} and
        💠 {formatNum(state.dex.poolLegion)} — trading a large amount at once moves the rate against you,
        so several smaller trades usually fetch more. $LEGION is a game currency; its rate is set by this
        reserve alone and it is not a promise of value outside the game.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

function Bank({ state, now, actions }: { state: GameState; now: number; actions: Actions }) {
  const [amt, setAmt] = useState("");
  const pending = bankPending(state, now);
  const fee = bankWithdrawFee(state, now);
  const n = Number(amt) || 0;
  const daily = state.bank.staked * 0.01;

  return (
    <div className="tr-room bank-room">
      <header className="tr-room-head">
        <h3>🏦 The Bank</h3>
        <p className="muted small">
          Lend the treasury $LEGION you aren&apos;t spending and it pays interest every second —
          roughly 1% a day. You can take it back whenever you like.
        </p>
      </header>

      <div className="bank-stats">
        <div>
          <b>{formatNum(state.bank.staked)}</b>
          <span>💠 lent to the bank</span>
        </div>
        <div>
          <b>{formatNum(pending)}</b>
          <span>interest waiting</span>
        </div>
        <div>
          <b>~{daily.toFixed(2)}</b>
          <span>💠 per day at this size</span>
        </div>
        <div className={fee > 0 ? "warn" : ""}>
          <b>{Math.round(fee * 100)}%</b>
          <span>early-withdrawal fee</span>
        </div>
      </div>

      <div className="swap-row">
        <input type="number" min="0" placeholder="amount of $LEGION" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <button
          type="button"
          className="btn"
          disabled={n <= 0 || n > state.legion}
          onClick={() => {
            actions.stakeLegion(n);
            setAmt("");
          }}
        >
          Lend
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={n <= 0 || n > state.bank.staked}
          onClick={() => {
            actions.unstakeLegion(n);
            setAmt("");
          }}
        >
          Take back{fee > 0 ? ` (−${Math.round(fee * 100)}%)` : ""}
        </button>
      </div>

      <button type="button" className="btn wide" disabled={pending < 1} onClick={() => actions.claimBankYield()}>
        {pending < 1 ? "Interest is still accruing…" : `Collect ${formatNum(pending)} 💠 interest`}
      </button>

      <p className="tr-fineprint">
        Taking your $LEGION back early costs a fee that shrinks the longer you leave it: 25% in the
        first minute, 8% within the hour, 4% within a day, and nothing after that. The fee exists so
        long-term lenders aren&apos;t diluted by people dipping in and out — it is never charged on the
        interest itself.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// War Chest
// ---------------------------------------------------------------------------

const FUND_STEPS = [0.1, 0.5, 1, 5];

function WarChest({
  state,
  actions,
  wallet,
  onFund,
  onSection,
}: {
  state: GameState;
  actions: Actions;
  wallet: Wallet;
  onFund: (usd: number) => void;
  onSection: (s: TreasurySection) => void;
}) {
  const tier = companyTier(state.warChestUsd);
  const next = nextCompanyTier(state.warChestUsd);
  const stored = state.warChest.stored;
  const cap = warChestStoreCap(state);
  const rate = warChestYield(state);
  const canFund = Boolean(wallet.session && wallet.caps.particle && !wallet.busy);

  return (
    <div className="tr-room warchest-room">
      <header className="tr-room-head">
        <h3>🪖 The War Chest</h3>
        <p className="muted small">
          A standing fund that pays a mercenary company to march with your legion. While it&apos;s
          funded, every chamber in the stronghold produces more — permanently — and the chest itself
          drips gold you can collect.
        </p>
      </header>

      <div className="wc-state">
        <div className="wc-current">
          <span className="wc-cap">Your company</span>
          <b>{tier ? tier.name : "None hired"}</b>
          <small>
            {tier ? `+${Math.round(tier.boost * 100)}% output on every chamber` : "No bonus yet"}
          </small>
        </div>
        <div className="wc-vault">
          <span className="wc-cap">Chest yield</span>
          <b>
            {formatNum(Math.floor(stored))}
            <span className="muted"> / {formatNum(Math.floor(cap))}</span>
          </b>
          <small>{rate > 0 ? `+${rate.toFixed(2)} gold/s` : "fund the chest to start it"}</small>
          <button type="button" className="btn" disabled={stored < 1} onClick={() => actions.collectWarChest()}>
            {stored < 1 ? "Nothing to collect" : `Collect 🪙 ${formatNum(Math.floor(stored))}`}
          </button>
        </div>
      </div>

      <div className="wc-tiers">
        <h4>Company ranks</h4>
        <ul>
          {COMPANY_TIERS.map((t) => {
            const earned = state.warChestUsd >= t.minUsd;
            return (
              <li key={t.minUsd} className={earned ? "earned" : ""}>
                <span className="wc-t-mark">{earned ? "✓" : "○"}</span>
                <span className="wc-t-name">{t.name}</span>
                <span className="wc-t-boost">+{Math.round(t.boost * 100)}% output</span>
                <span className="wc-t-cost">{usd(t.minUsd)} total funded</span>
              </li>
            );
          })}
        </ul>
        {next && (
          <p className="muted small">
            {usd(Math.max(0, next.minUsd - state.warChestUsd))} more funded in total reaches{" "}
            <b>{next.name}</b>.
          </p>
        )}
      </div>

      <div className="wc-fund">
        <h4>Fund the chest</h4>
        {!canFund ? (
          <p className="tr-hint">
            {wallet.caps.particle ? (
              <>
                You&apos;ll need a treasury account first —{" "}
                <button type="button" className="link-btn" onClick={() => onSection("ledger")}>
                  open one in the Ledger
                </button>
                . It takes an email and about ten seconds.
              </>
            ) : (
              <>Funding is unavailable in this build. Everything else in the Treasury works normally.</>
            )}
          </p>
        ) : (
          <div className="wc-steps">
            {FUND_STEPS.map((amt) => {
              const t = COMPANY_TIERS.find((c) => c.minUsd === amt);
              return (
                <button key={amt} type="button" className="wc-step" onClick={() => onFund(amt)}>
                  <b>{usd(amt)}</b>
                  <small>{t ? t.name : "top up"}</small>
                  <small className="muted">+{Math.round((t?.boost ?? 0) * 100)}% output</small>
                </button>
              );
            })}
          </div>
        )}
        <p className="tr-fineprint">
          The Free Company bonus is bound to this legion: it cannot be sold, traded or transferred, and
          it does not unlock any content you couldn&apos;t reach by playing. The same bonus is granted
          free — permanently — by <b>Descending</b> to a deeper stronghold, which banks Renown.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estates (land)
// ---------------------------------------------------------------------------

const LAND_ALL: LandKind[] = ["gold", "provisions", "salves", "legion", "might"];

function Estates({ state, stats, actions }: { state: GameState; stats: DerivedStats; actions: Actions }) {
  const [kind, setKind] = useState<LandKind>("gold");
  const claimCost = landClaimCost(state);
  const slots = landSlotsLeft(state);
  const gated = stats.might < LAND_MIN_MIGHT;
  const y = landYields(state);
  const short = state.legion < claimCost;

  return (
    <div className="tr-room estates-room">
      <header className="tr-room-head">
        <h3>🗺️ Estates</h3>
        <p className="muted small">
          Parcels of the realm that produce forever, with no workers and no upkeep. Only {LAND_SLOTS}{" "}
          exist for your legion, so choose what each one grows.
        </p>
        <div className="rank-chip">
          {state.land.length}/{LAND_SLOTS} claimed
        </div>
      </header>

      <div className="estate-yield">
        <span>Your estates currently produce</span>
        <b>🪙 {y.gold.toFixed(1)}/s</b>
        <b>🌾 {y.provisions.toFixed(1)}/s</b>
        <b>⛑ {y.salves.toFixed(1)}/s</b>
        <b>💠 {y.legion.toFixed(2)}/s</b>
        <b>⚔ +{Math.round(y.might)}</b>
      </div>

      <div className="realm-grid">
        {state.land.map((p) => {
          const meta = LAND_KIND_META[p.kind];
          const upCost = landUpgradeCost(p);
          const isMight = p.kind === "might";
          const gain = isMight ? LAND_YIELD.might : LAND_YIELD[p.kind];
          return (
            <article key={p.id} className={`parcel k-${p.kind}`}>
              <div className="parcel-top">
                <span className="parcel-ic">{meta.icon}</span>
                <span className="parcel-lvl">Level {p.level}</span>
              </div>
              <div className="parcel-name">{meta.name}</div>
              <div className="parcel-yield muted small">
                {isMight ? `+${Math.round(gain * p.level)} ⚔ might` : `+${(gain * p.level).toFixed(2)}/s`}
              </div>
              <div className="parcel-next small">
                → {isMight ? `+${Math.round(gain * (p.level + 1))} ⚔` : `+${(gain * (p.level + 1)).toFixed(2)}/s`} at
                level {p.level + 1}
              </div>
              <button
                type="button"
                className="chip-btn up"
                disabled={state.gold < upCost}
                onClick={() => actions.upgradeLand(p.id)}
              >
                Improve · 🪙 {formatNum(upCost)}
              </button>
            </article>
          );
        })}
        {Array.from({ length: slots }).map((_, i) => (
          <article key={`empty${i}`} className="parcel empty">
            <span className="parcel-plus">＋</span>
            <span className="muted small">unclaimed</span>
          </article>
        ))}
      </div>

      {slots > 0 && (
        <div className="claim-bar">
          <span className="build-label">Claim a parcel</span>
          <div className="claim-kinds">
            {LAND_ALL.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip-btn ${kind === k ? "on" : ""}`}
                onClick={() => setKind(k)}
              >
                {LAND_KIND_META[k].icon} {LAND_KIND_META[k].name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            disabled={gated || short}
            onClick={() => actions.claimLand(kind)}
          >
            {gated
              ? `Needs ${LAND_MIN_MIGHT} might — you have ${Math.floor(stats.might)}`
              : short
                ? `Needs 💠 ${formatNum(claimCost)} — you have ${formatNum(state.legion)}`
                : `Claim · 💠 ${formatNum(claimCost)}`}
          </button>
        </div>
      )}

      <p className="tr-fineprint">
        Parcels are bought with $LEGION, which you earn by playing or trade for in the Exchange. Land
        is never sold for outside value — the realm answers to strength, not to coin.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger — account + history
// ---------------------------------------------------------------------------

function Ledger({
  state,
  wallet,
  tx,
}: {
  state: GameState;
  wallet: Wallet;
  tx: ReturnType<typeof useTreasuryTx>;
}) {
  return (
    <div className="tr-room ledger-room">
      <header className="tr-room-head">
        <h3>📜 The Ledger</h3>
        <p className="muted small">Your account, your balance, and every entry the treasury has recorded.</p>
      </header>

      {!tx.online && (
        <p className="tr-offline" role="status">
          ⚡ You&apos;re offline. Your stronghold keeps producing and everything is saved on this device —
          treasury entries will resume when the connection returns.
        </p>
      )}

      <TreasuryIdentity
        session={wallet.session}
        busy={wallet.busy}
        totalUsd={wallet.totalUsd}
        assets={wallet.assets as { tokenType?: string; amountInUSD?: number }[]}
        address={wallet.uaAddress}
        canEmail={wallet.caps.magic}
        canTransact={wallet.caps.particle}
        onEmail={(e) => void wallet.loginMagic(e)}
        onWallet={() => void wallet.loginInjected()}
        onRefresh={() => void wallet.refreshBalances()}
        onSignOut={() => void wallet.logout()}
      />

      <div className="tr-history">
        <h4>Entries</h4>
        {tx.ledger.length === 0 ? (
          <p className="muted small">
            Nothing recorded yet. Funding the War Chest or buying from the premium stalls writes an entry
            here — including anything that failed, so you can always see nothing was taken.
          </p>
        ) : (
          <ul className="tr-rows">
            {tx.ledger.map((r) => (
              <li key={r.id} className={`tr-row ${r.status}`}>
                <span className="tr-row-mark">{r.status === "settled" ? "✓" : "✕"}</span>
                <span className="tr-row-title">{r.title}</span>
                <span className="tr-row-amt">{usd(r.amountUsd)}</span>
                <span className="tr-row-when muted small">{new Date(r.at).toLocaleString()}</span>
                {r.url && (
                  <a className="tr-row-link" href={r.url} target="_blank" rel="noreferrer">
                    details ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tr-summary">
        <div>
          <b>{usd(state.warChestUsd)}</b>
          <span>funded into the War Chest, all time</span>
        </div>
        <div>
          <b>+{Math.round(state.mercenaryBoost * 100)}%</b>
          <span>permanent output from that funding</span>
        </div>
        <div>
          <b>{formatNum(state.warChest.totalYielded)}</b>
          <span>gold the chest has paid back</span>
        </div>
        <div>
          <b>{(WARCHEST_YIELD_PER_USD * 3600).toFixed(0)}</b>
          <span>gold per hour, per $1 funded</span>
        </div>
      </div>
    </div>
  );
}
