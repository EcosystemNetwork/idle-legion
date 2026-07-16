import { useMemo, useState } from "react";
import { MERCENARY_TIERS, RAIDS, UNITS, UNIT_ORDER } from "./game/config";
import {
  barracksUpgradeCost,
  formatGold,
  unitCost,
} from "./game/engine";
import { useGame } from "./hooks/useGame";
import { useWallet } from "./hooks/useWallet";
import "./App.css";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function App() {
  const { state, stats, error: gameError, now, actions } = useGame();
  const wallet = useWallet();
  const [email, setEmail] = useState("");
  const [fundAmount, setFundAmount] = useState("0.1");
  const [tab, setTab] = useState<"legion" | "raid" | "warchest">("legion");

  const raidProgress = useMemo(() => {
    if (!state.activeRaid) return null;
    const total = state.activeRaid.endsAt - state.activeRaid.startedAt;
    const done = Math.min(1, Math.max(0, (now - state.activeRaid.startedAt) / total));
    const ready = now >= state.activeRaid.endsAt;
    const left = Math.max(0, Math.ceil((state.activeRaid.endsAt - now) / 1000));
    return { done, ready, left };
  }, [state.activeRaid, now]);

  const onFund = async () => {
    const result = await wallet.fundWarChest(fundAmount);
    if (result) {
      const usd = Number(result.amount) || 0.1;
      actions.applyFunding(usd, result.transactionId);
      setTab("legion");
    }
  };

  return (
    <div className="app">
      <div className="bg-glow" aria-hidden />
      <header className="top">
        <div className="brand">
          <span className="brand-icon">⚔️</span>
          <div>
            <h1>Idle Legion</h1>
            <p className="tagline">
              One login · One balance · Arbitrum settles the war chest
            </p>
          </div>
        </div>
        <div className="track-badge">
          <span>Particle UA · EIP-7702</span>
          <span>Arbitrum</span>
          <span>Magic</span>
        </div>
      </header>

      <section className="resources">
        <div className="stat">
          <span className="label">Gold</span>
          <strong>{formatGold(state.gold)}</strong>
          <small>
            / {formatGold(stats.goldCap)} cap · {formatGold(stats.gps)}/s
          </small>
        </div>
        <div className="stat">
          <span className="label">Power</span>
          <strong>{Math.floor(stats.power)}</strong>
          <small>{state.totalRaids} raids won</small>
        </div>
        <div className="stat">
          <span className="label">Mercenary boost</span>
          <strong>+{Math.round(state.mercenaryBoost * 100)}%</strong>
          <small>War chest ${state.warChestUsd.toFixed(2)}</small>
        </div>
        <div className="stat onchain">
          <span className="label">Unified balance</span>
          <strong>
            {wallet.totalUsd == null
              ? wallet.session
                ? "…"
                : "—"
              : `$${wallet.totalUsd.toFixed(2)}`}
          </strong>
          <small>
            {wallet.session
              ? shortAddr(wallet.session.address)
              : "not connected"}
          </small>
        </div>
      </section>

      <nav className="tabs">
        {(
          [
            ["legion", "Legion"],
            ["raid", "Raids"],
            ["warchest", "War Chest"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {(gameError || wallet.error) && (
        <div className="banner error" role="alert">
          {gameError || wallet.error}
          <button
            type="button"
            onClick={() => {
              actions.clearError();
              wallet.setError(null);
            }}
          >
            dismiss
          </button>
        </div>
      )}

      {tab === "legion" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Barracks · Lvl {state.barracksLevel}</h2>
            <button
              type="button"
              className="btn secondary"
              onClick={() => actions.upgradeBarracks()}
            >
              Upgrade ({formatGold(barracksUpgradeCost(state.barracksLevel))}g)
            </button>
          </div>
          <div className="unit-grid">
            {UNIT_ORDER.map((id) => {
              const def = UNITS[id];
              const owned = state.units[id];
              const cost = unitCost(id, owned);
              const can = state.gold >= cost;
              return (
                <article key={id} className="unit-card">
                  <div className="unit-top">
                    <span className="unit-icon">{def.icon}</span>
                    <div>
                      <h3>{def.name}</h3>
                      <p>{def.description}</p>
                    </div>
                  </div>
                  <div className="unit-meta">
                    <span>×{owned}</span>
                    <span>+{def.gps} g/s</span>
                    <span>{def.power} power</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={!can}
                    onClick={() => actions.buy(id)}
                  >
                    Recruit · {formatGold(cost)}g
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "raid" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Raids</h2>
            {state.activeRaid && raidProgress && (
              <div className="raid-status">
                {raidProgress.ready ? (
                  <button type="button" className="btn" onClick={() => actions.claimRaid()}>
                    Claim loot
                  </button>
                ) : (
                  <span>
                    Marching… {raidProgress.left}s
                    <span className="bar">
                      <i style={{ width: `${raidProgress.done * 100}%` }} />
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="raid-grid">
            {RAIDS.map((m) => {
              const locked = stats.power < m.minPower;
              const busy = Boolean(state.activeRaid);
              return (
                <article key={m.id} className={`raid-card ${locked ? "locked" : ""}`}>
                  <div className="raid-top">
                    <span>{m.icon}</span>
                    <div>
                      <h3>{m.name}</h3>
                      <p>{m.description}</p>
                    </div>
                  </div>
                  <div className="unit-meta">
                    <span>{m.durationSec}s</span>
                    <span>≥{m.minPower} power</span>
                    <span>+{m.goldReward}g</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={locked || busy}
                    onClick={() => actions.startRaid(m.id)}
                  >
                    {locked ? "Need more power" : busy ? "Raid in progress" : "March"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "warchest" && (
        <section className="panel warchest">
          <div className="panel-head">
            <h2>War Chest</h2>
            <p className="muted">
              Fund mercenaries with <strong>any-chain</strong> assets. Universal
              Accounts (EIP-7702) routes value and lands <strong>USDT on Arbitrum</strong>.
              No bridge UI. No chain switch.
            </p>
          </div>

          <div className="auth-box">
            {!wallet.session ? (
              <>
                <h3>Enter the field</h3>
                {wallet.caps.magic ? (
                  <form
                    className="email-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (email.trim()) void wallet.loginMagic(email.trim());
                    }}
                  >
                    <input
                      type="email"
                      placeholder="you@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn" disabled={wallet.busy}>
                      Magic login
                    </button>
                  </form>
                ) : (
                  <p className="muted small">
                    Set <code>VITE_MAGIC_PUBLISHABLE_KEY</code> for email wallets.
                  </p>
                )}
                <button
                  type="button"
                  className="btn secondary"
                  disabled={wallet.busy}
                  onClick={() => void wallet.loginInjected()}
                >
                  Connect browser wallet
                </button>
              </>
            ) : (
              <div className="session">
                <div>
                  <strong>
                    {wallet.session.method === "magic" ? "Magic" : "Wallet"} ·{" "}
                    {shortAddr(wallet.session.address)}
                  </strong>
                  {wallet.session.email && (
                    <div className="muted small">{wallet.session.email}</div>
                  )}
                  {wallet.uaAddress && (
                    <div className="muted small">
                      UA / 7702 · {shortAddr(wallet.uaAddress)}
                    </div>
                  )}
                </div>
                <div className="session-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={wallet.busy}
                    onClick={() => void wallet.refreshBalances()}
                  >
                    Refresh balance
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={wallet.busy}
                    onClick={() => void wallet.logout()}
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>

          {wallet.assets.length > 0 && (
            <div className="assets">
              <h3>Primary assets (unified)</h3>
              <ul>
                {wallet.assets.map((a) => (
                  <li key={a.tokenType}>
                    <span>{a.tokenType.toUpperCase()}</span>
                    <span>
                      {a.amount.toFixed(4)} · ${a.amountInUSD.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="fund-box">
            <h3>Fund War Chest → Arbitrum USDT</h3>
            <p className="muted small">
              Cross-chain transfer via Particle Universal Accounts SDK (
              <code>useEIP7702: true</code>). Sources liquidity from your
              unified Primary Assets, destination chain = Arbitrum One.
            </p>
            <div className="email-row">
              <input
                type="text"
                inputMode="decimal"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                aria-label="USDT amount"
              />
              <button
                type="button"
                className="btn"
                disabled={!wallet.session || wallet.busy || !wallet.caps.particle}
                onClick={() => void onFund()}
              >
                {wallet.busy ? "Routing…" : `Send ${fundAmount} USDT → Arb`}
              </button>
            </div>
            {!wallet.caps.particle && (
              <p className="muted small warn">
                Add Particle keys in <code>.env</code> to enable live UA transfers.
                Game loop works fully offline without them.
              </p>
            )}
            {wallet.lastTx && (
              <p className="tx-ok">
                Funded {wallet.lastTx.amount} USDT ·{" "}
                <a href={wallet.lastTx.url} target="_blank" rel="noreferrer">
                  View on UniversalX
                </a>
              </p>
            )}
          </div>

          <div className="tiers">
            <h3>Mercenary tiers</h3>
            <ul>
              {MERCENARY_TIERS.map((t) => (
                <li
                  key={t.minUsd}
                  className={state.warChestUsd >= t.minUsd ? "earned" : ""}
                >
                  <span>≥ ${t.minUsd}</span>
                  <span>{t.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <footer className="foot">
        <p>
          UXMaxx · Universal Accounts track · original Idle Legion build ·
          EIP-7702 chain-abstracted EOA · settlement on Arbitrum
        </p>
        <button type="button" className="btn ghost" onClick={() => actions.reset()}>
          Reset local save
        </button>
      </footer>
    </div>
  );
}
