import { useState } from "react";
import {
  APTITUDE_ICON,
  APTITUDE_LABEL,
  BUILDABLE,
  IMG,
  MERCENARY_TIERS,
  RAIDS,
  RAID_ART,
  ROOMS,
  ROOM_ART,
  TIERS,
  TIER_PORTRAIT,
} from "./game/config";
import {
  buildCost,
  dwellerById,
  dwellerMight,
  formatNum,
  isOnRaid,
  raidSquadMight,
  recruitCost,
  roomCapacity,
  roomRate,
  roomStoreCap,
  maxPopulation,
  upgradeCost,
} from "./game/engine";
import { useGame } from "./hooks/useGame";
import { useWallet } from "./hooks/useWallet";
import type { Dweller, GameState, Room, Tier } from "./game/types";
import "./App.css";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type Tab = "stronghold" | "legion" | "raids" | "warchest";
type Actions = ReturnType<typeof useGame>["actions"];
type Stats = ReturnType<typeof useGame>["stats"];
type Wallet = ReturnType<typeof useWallet>;

const RESOURCE_IMG: Record<string, string> = {
  gold: IMG.gold,
  provisions: IMG.provisions,
};

const RARITY: Record<Tier, { name: string; color: string; stars: number }> = {
  recruit: { name: "Common", color: "#9aa6b2", stars: 1 },
  spearman: { name: "Uncommon", color: "#5fe38a", stars: 2 },
  archer: { name: "Rare", color: "#4aa8ff", stars: 3 },
  cavalry: { name: "Epic", color: "#b072ff", stars: 4 },
  champion: { name: "Legendary", color: "#ffc233", stars: 5 },
};

function stars(n: number) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// ---------------- Standing figure (character) ----------------

function Figure({
  d,
  onClick,
  title,
}: {
  d: Dweller;
  onClick?: () => void;
  title?: string;
}) {
  const delay = (d.id.charCodeAt(d.id.length - 1) % 10) * 0.15;
  return (
    <button
      type="button"
      className={`fig apt-${d.aptitude}`}
      style={{ animationDelay: `${delay}s` }}
      title={title ?? `${d.name} · ${TIERS[d.tier].name} · Lv${d.level} · ${APTITUDE_LABEL[d.aptitude]}`}
      onClick={onClick}
    >
      <img className="fig-img" src={TIER_PORTRAIT[d.tier]} alt={TIERS[d.tier].name} loading="lazy" />
      <span className="fig-lvl">{d.level}</span>
      <span className="fig-shadow" aria-hidden />
    </button>
  );
}

function GhostFigure({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="fig ghost" onClick={onClick} title="Assign a dweller">
      <span className="fig-plus">＋</span>
      <span className="fig-shadow" aria-hidden />
    </button>
  );
}

// ---------------- App ----------------

export default function App() {
  const { state, stats, error: gameError, now, actions } = useGame();
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("stronghold");
  const [assignRoomId, setAssignRoomId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fundAmount, setFundAmount] = useState("0.1");

  const assignRoom = assignRoomId ? state.rooms.find((r) => r.id === assignRoomId) : null;

  const onFund = async () => {
    const result = await wallet.fundWarChest(fundAmount);
    if (result) {
      const usd = Number(result.amount) || 0.1;
      actions.applyFunding(usd, result.transactionId);
      setTab("stronghold");
    }
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="hero-frame">
            <img className="hero-emblem" src={IMG.hero} alt="Champion" />
          </span>
          <div>
            <h1>Idle Legion</h1>
            <p className="tagline">Build the stronghold · Raise a dynasty · Fund the war on-chain</p>
          </div>
        </div>
        <div className="track-badge">
          <span>Particle UA · EIP-7702</span>
          <span>Arbitrum</span>
          <span>Magic</span>
        </div>
      </header>

      <ResourceBar state={state} stats={stats} wallet={wallet} onCollectAll={actions.collectAll} />

      {state.incident && (
        <div className="banner incident" role="alert">
          <span className="incident-icon">🔥</span>
          <strong>{state.incident.label}</strong>
          <span className="muted small">
            The legion is fighting it off — {Math.max(0, Math.ceil((state.incident.endsAt - now) / 1000))}s
          </span>
        </div>
      )}

      <nav className="tabs">
        {(
          [
            ["stronghold", "🏰 Stronghold"],
            ["legion", "🛡️ Legion"],
            ["raids", "🗺️ Raids"],
            ["warchest", "🏦 War Chest"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
            {id === "warchest" && state.mercenaryBoost > 0 && <i className="dot" />}
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

      {tab === "stronghold" && (
        <StrongholdView
          state={state}
          stats={stats}
          now={now}
          actions={actions}
          onAssign={(id) => setAssignRoomId(id)}
          onOpenWarChest={() => setTab("warchest")}
          onOpenRaids={() => setTab("raids")}
        />
      )}

      {tab === "legion" && <LegionView state={state} actions={actions} />}

      {tab === "raids" && <RaidsView state={state} now={now} actions={actions} />}

      {tab === "warchest" && (
        <WarChestView
          state={state}
          wallet={wallet}
          email={email}
          setEmail={setEmail}
          fundAmount={fundAmount}
          setFundAmount={setFundAmount}
          onFund={onFund}
        />
      )}

      {assignRoom && (
        <AssignModal
          room={assignRoom}
          state={state}
          actions={actions}
          onClose={() => setAssignRoomId(null)}
        />
      )}

      <footer className="foot">
        <p>
          UXMaxx · Universal Accounts track · original Idle Legion build · EIP-7702
          chain-abstracted EOA · settlement on Arbitrum
        </p>
        <button type="button" className="btn ghost" onClick={() => actions.reset()}>
          Reset save
        </button>
      </footer>
    </div>
  );
}

// ---------------- Resource bar ----------------

function ResourceBar({
  state,
  stats,
  wallet,
  onCollectAll,
}: {
  state: GameState;
  stats: Stats;
  wallet: Wallet;
  onCollectAll: () => void;
}) {
  const anyReady = state.rooms.some((r) => roomStoreCap(r) > 0 && r.stored >= 1);
  return (
    <section className="resources">
      <div className="chip-stat gold">
        <span className="ci">🪙</span>
        <span className="cv">
          <b>{formatNum(state.gold)}</b>
          <small>+{stats.goldPerSec.toFixed(1)}/s</small>
        </span>
      </div>
      <div className={`chip-stat prov ${stats.fed ? "" : "warn"}`}>
        <span className="ci">🌾</span>
        <span className="cv">
          <b>{formatNum(state.provisions)}</b>
          <small>
            {stats.provisionsPerSec >= 0 ? "+" : ""}
            {stats.provisionsPerSec.toFixed(2)}/s {stats.fed ? "" : "· STARVING"}
          </small>
        </span>
      </div>
      <div className="chip-stat pop">
        <span className="ci">🛡️</span>
        <span className="cv">
          <b>
            {stats.population}
            <span className="cap">/{maxPopulation(state)}</span>
          </b>
          <small>{stats.idleCount} idle</small>
        </span>
      </div>
      <div className="chip-stat might">
        <span className="ci">⚔️</span>
        <span className="cv">
          <b>{Math.floor(stats.might)}</b>
          <small>{state.totalRaids} raids</small>
        </span>
      </div>
      <div className="chip-stat merc">
        <span className="ci">🎖️</span>
        <span className="cv">
          <b>+{Math.round(state.mercenaryBoost * 100)}%</b>
          <small>chest ${state.warChestUsd.toFixed(2)}</small>
        </span>
      </div>
      <div className="chip-stat onchain">
        <span className="ci">🔗</span>
        <span className="cv">
          <b>
            {wallet.totalUsd == null ? (wallet.session ? "…" : "—") : `$${wallet.totalUsd.toFixed(2)}`}
          </b>
          <small>{wallet.session ? shortAddr(wallet.session.address) : "offline"}</small>
        </span>
      </div>
      <button
        type="button"
        className={`collect-all ${anyReady ? "ready" : ""}`}
        disabled={!anyReady}
        onClick={onCollectAll}
      >
        Collect all
      </button>
    </section>
  );
}

// ---------------- Stronghold (vertical chambers) ----------------

function StrongholdView({
  state,
  stats,
  now,
  actions,
  onAssign,
  onOpenWarChest,
  onOpenRaids,
}: {
  state: GameState;
  stats: Stats;
  now: number;
  actions: Actions;
  onAssign: (roomId: string) => void;
  onOpenWarChest: () => void;
  onOpenRaids: () => void;
}) {
  return (
    <section className="vault">
      <div className="vault-sky">
        <span className="cloud c1">☁️</span>
        <span className="sun">🌄 THE SURFACE</span>
        <span className="cloud c2">☁️</span>
      </div>
      <div className="vault-body">
        <div className="elevator" aria-hidden>
          {state.rooms.map((r) => (
            <span key={r.id} className="rung" />
          ))}
        </div>
        <div className="chambers">
          {state.rooms.map((room) => (
            <Chamber
              key={room.id}
              room={room}
              state={state}
              stats={stats}
              now={now}
              actions={actions}
              onAssign={onAssign}
              onOpenWarChest={onOpenWarChest}
              onOpenRaids={onOpenRaids}
            />
          ))}
        </div>
      </div>
      <div className="vault-floor">
        <BuildMenu state={state} actions={actions} />
      </div>
    </section>
  );
}

function Chamber({
  room,
  state,
  stats,
  now,
  actions,
  onAssign,
  onOpenWarChest,
  onOpenRaids,
}: {
  room: Room;
  state: GameState;
  stats: Stats;
  now: number;
  actions: Actions;
  onAssign: (roomId: string) => void;
  onOpenWarChest: () => void;
  onOpenRaids: () => void;
}) {
  const def = ROOMS[room.type];
  const cap = roomCapacity(room);
  const storeCap = roomStoreCap(room);
  const rate = roomRate(state, room, stats.fed);
  const stored = Math.floor(room.stored);
  const ready = storeCap > 0 && stored >= 1;
  const fill = storeCap > 0 ? Math.min(1, room.stored / storeCap) : 0;
  const workers = room.workers.map((id) => dwellerById(state, id)).filter(Boolean) as Dweller[];
  const incident = state.incident?.roomId === room.id ? state.incident : null;
  const upCost = upgradeCost(room);
  const resImg = def.produces ? RESOURCE_IMG[def.produces] : null;

  const resting =
    room.type === "hall"
      ? state.dwellers.filter((d) => d.roomId == null && !isOnRaid(state, d.id)).slice(0, 6)
      : [];

  return (
    <div className={`chamber ${room.type} ${incident ? "on-fire" : ""} ${ready ? "is-ready" : ""}`}>
      <img className="ch-art" src={ROOM_ART[room.type]} alt="" aria-hidden loading="lazy" />
      <div className="ch-glow" aria-hidden />

      <div className="ch-plaque">
        <span className="ch-icon">{def.icon}</span>
        <span className="ch-name">{def.name}</span>
        <span className="ch-lvl">Lv {room.level}</span>
        {def.aptitude && (
          <span className="ch-apt">{APTITUDE_ICON[def.aptitude]}</span>
        )}
      </div>

      <div className="ch-stage">
        <div className="crew">
          {workers.map((d) => (
            <Figure key={d.id} d={d} onClick={() => actions.unassign(d.id)} />
          ))}
          {cap > 0 &&
            Array.from({ length: Math.max(0, cap - workers.length) }).map((_, i) => (
              <GhostFigure key={i} onClick={() => onAssign(room.id)} />
            ))}
          {resting.map((d) => (
            <Figure key={d.id} d={d} title={`${d.name} · idle in the Hall`} />
          ))}
        </div>
        <div className="ch-ground" aria-hidden />
      </div>

      {ready && resImg && (
        <button type="button" className="bubble" onClick={() => actions.collect(room.id)}>
          <img className="b-img" src={resImg} alt="" aria-hidden />
          <span className="b-amt">+{formatNum(stored)}</span>
        </button>
      )}

      <div className="ch-foot">
        {storeCap > 0 ? (
          <div className="prod-meter" title={`${rate.toFixed(1)}/s`}>
            <i style={{ width: `${fill * 100}%` }} className={ready ? "full" : ""} />
            <b>+{rate.toFixed(1)}/s</b>
          </div>
        ) : (
          <span className="ch-note">{def.description}</span>
        )}
        <div className="ch-ctrls">
          {def.produces && (
            <button
              type="button"
              className="chip-btn"
              title="Rush: instantly fill storage — risks an incident"
              onClick={() => actions.rush(room.id)}
            >
              ⚡
            </button>
          )}
          {cap > 0 && (
            <button
              type="button"
              className="chip-btn"
              title="Auto-staff from idle dwellers"
              onClick={() => actions.autoStaff(room.id)}
            >
              👥
            </button>
          )}
          {room.type === "warroom" && (
            <button type="button" className="chip-btn go" onClick={onOpenRaids}>
              Raid ▸
            </button>
          )}
          {room.type === "warchest" && (
            <button type="button" className="chip-btn go" onClick={onOpenWarChest}>
              Vault ▸
            </button>
          )}
          {room.type !== "warchest" && (
            <button
              type="button"
              className="chip-btn up"
              disabled={state.gold < upCost}
              onClick={() => actions.upgrade(room.id)}
              title={`Upgrade to Lv ${room.level + 1}`}
            >
              ▲ {formatNum(upCost)}
            </button>
          )}
        </div>
      </div>

      {incident && (
        <div className="incident-overlay">
          🔥 {incident.label}
          <span>{Math.max(0, Math.ceil((incident.endsAt - now) / 1000))}s</span>
        </div>
      )}
    </div>
  );
}

function BuildMenu({ state, actions }: { state: GameState; actions: Actions }) {
  return (
    <div className="build-menu">
      <span className="build-label">⛏ DIG A NEW ROOM</span>
      <div className="build-row">
        {BUILDABLE.map((type) => {
          const def = ROOMS[type];
          const exists = def.unique && state.rooms.some((r) => r.type === type);
          const cost = buildCost(type);
          return (
            <button
              key={type}
              className={`build-btn ${type}`}
              disabled={exists || state.gold < cost}
              onClick={() => actions.build(type)}
              title={def.description}
            >
              <span className="bi">{def.icon}</span>
              <span className="bn">{def.name}</span>
              <span className="bc">{exists ? "built" : `🪙 ${formatNum(cost)}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Legion — gacha hero cards ----------------

function LegionView({ state, actions }: { state: GameState; actions: Actions }) {
  const cost = recruitCost(state);
  const full = state.dwellers.length >= maxPopulation(state);
  const sorted = [...state.dwellers].sort(
    (a, b) => TIERS[b.tier].might - TIERS[a.tier].might || b.level - a.level,
  );
  return (
    <section className="panel legion">
      <div className="panel-head">
        <h2>🛡️ The Legion · {state.dwellers.length}/{maxPopulation(state)}</h2>
        <button
          type="button"
          className="btn"
          disabled={full || state.gold < cost}
          onClick={() => actions.recruit()}
        >
          {full ? "Hall full" : `Recruit · 🪙 ${formatNum(cost)}`}
        </button>
      </div>
      <div className="hero-grid">
        {sorted.map((d) => {
          const room = d.roomId ? state.rooms.find((r) => r.id === d.roomId) : null;
          const out = isOnRaid(state, d.id);
          const r = RARITY[d.tier];
          return (
            <article
              key={d.id}
              className={`gacha apt-${d.aptitude}`}
              style={{ ["--rar" as string]: r.color }}
            >
              <div className="gacha-frame">
                <div className="gacha-top">
                  <span className="gacha-tier">{TIERS[d.tier].name}</span>
                  <span className="gacha-lvl">Lv {d.level}</span>
                </div>
                <div className="gacha-portrait">
                  <img src={TIER_PORTRAIT[d.tier]} alt={TIERS[d.tier].name} loading="lazy" />
                  <span className="gacha-apt">{APTITUDE_ICON[d.aptitude]}</span>
                  <span className="gacha-might">{Math.floor(dwellerMight(d))} ⚔</span>
                </div>
                <div className="gacha-name">{d.name}</div>
                <div className="gacha-stars">{stars(r.stars)}</div>
                <div className="xpbar">
                  <i style={{ width: `${Math.min(100, (d.xp / (d.level * 100)) * 100)}%` }} />
                </div>
                <div className="gacha-foot">
                  {out ? (
                    <span className="badge raid">On raid</span>
                  ) : room ? (
                    <>
                      <span className="badge">{ROOMS[room.type].icon} {ROOMS[room.type].name}</span>
                      <button className="chip-btn" onClick={() => actions.unassign(d.id)}>
                        Recall
                      </button>
                    </>
                  ) : (
                    <span className="badge idle">Idle · assign in a room</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- Raids — arena battle stages ----------------

function RaidsView({ state, now, actions }: { state: GameState; now: number; actions: Actions }) {
  const hasWarRoom = state.rooms.some((r) => r.type === "warroom");
  const squadMight = raidSquadMight(state);
  const raid = state.activeRaid;
  const mission = raid ? RAIDS.find((m) => m.id === raid.missionId) : null;
  const raidLeft = raid ? Math.max(0, Math.ceil((raid.endsAt - now) / 1000)) : 0;
  const raidDone = raid ? now >= raid.endsAt : false;
  const raidProg =
    raid && mission ? Math.min(1, (now - raid.startedAt) / (raid.endsAt - raid.startedAt)) : 0;

  return (
    <section className="panel raids">
      <div className="panel-head">
        <h2>🗺️ Raids · the Arena</h2>
        <p className="muted small">
          Idle squad might: <strong>{Math.floor(squadMight)} ⚔</strong> · sends all idle dwellers
        </p>
      </div>

      {!hasWarRoom && (
        <p className="muted small warn">Dig a 🗺️ War Room in the Stronghold to launch raids.</p>
      )}

      {raid && mission && (
        <div className="active-raid" style={{ backgroundImage: `url(${RAID_ART[mission.id]})` }}>
          <div className="ar-body">
            <span className="ar-icon">{mission.icon}</span>
            <div className="ar-main">
              <strong>{mission.name}</strong>
              <div className="prod-meter big">
                <i style={{ width: `${raidProg * 100}%` }} className={raidDone ? "full" : ""} />
              </div>
              <span className="muted small">
                {raid.squad.length} dwellers out · {raidDone ? "returned!" : `${raidLeft}s`}
              </span>
            </div>
            <button
              type="button"
              className="btn"
              disabled={!raidDone}
              onClick={() => actions.claimRaid()}
            >
              {raidDone ? "Claim loot" : "Marching…"}
            </button>
          </div>
        </div>
      )}

      <div className="stage-grid">
        {RAIDS.map((m) => {
          const locked = squadMight < m.minMight;
          return (
            <article
              key={m.id}
              className={`stage ${locked ? "locked" : ""}`}
              style={{ backgroundImage: `url(${RAID_ART[m.id]})` }}
            >
              <div className="stage-veil" />
              <div className="stage-body">
                <div className="stage-head">
                  <span className="stage-icon">{m.icon}</span>
                  <h3>{m.name}</h3>
                </div>
                <p className="stage-desc">{m.description}</p>
                <div className="stage-meta">
                  <span>⏱ {m.durationSec}s</span>
                  <span className={locked ? "req warn" : "req"}>⚔ ≥{m.minMight}</span>
                  <span>🪙 +{formatNum(m.goldReward)}</span>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={locked || Boolean(raid) || !hasWarRoom}
                  onClick={() => actions.startRaid(m.id)}
                >
                  {locked ? "Need more might" : raid ? "Raid in progress" : "⚔ March to battle"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- War Chest ----------------

function WarChestView({
  state,
  wallet,
  email,
  setEmail,
  fundAmount,
  setFundAmount,
  onFund,
}: {
  state: GameState;
  wallet: Wallet;
  email: string;
  setEmail: (v: string) => void;
  fundAmount: string;
  setFundAmount: (v: string) => void;
  onFund: () => void;
}) {
  return (
    <section className="panel warchest">
      <div className="wc-hero" style={{ backgroundImage: `url(${IMG.chest})` }}>
        <div className="wc-hero-veil" />
        <div className="wc-hero-body">
          <h2>🏦 Treasury Vault</h2>
          <p className="muted">
            Fund the war with <strong>any-chain</strong> assets. Universal Accounts (
            <code>EIP-7702</code>) route value and land <strong>USDT on Arbitrum</strong> — no bridge
            UI, no chain switch. Funding hires a permanent <strong>Free Company</strong> that boosts
            every room.
          </p>
        </div>
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
              {wallet.session.email && <div className="muted small">{wallet.session.email}</div>}
              {wallet.uaAddress && (
                <div className="muted small">UA / 7702 · {shortAddr(wallet.uaAddress)}</div>
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
          Cross-chain transfer via Particle Universal Accounts (<code>useEIP7702: true</code>).
          Sources liquidity from your unified Primary Assets; destination chain = Arbitrum One.
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
            Add Particle keys in <code>.env</code> to enable live UA transfers. The stronghold plays
            fully offline without them.
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
        <h3>Free Company tiers</h3>
        <ul>
          {MERCENARY_TIERS.map((t) => (
            <li key={t.minUsd} className={state.warChestUsd >= t.minUsd ? "earned" : ""}>
              <span>≥ ${t.minUsd}</span>
              <span>{t.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------- Assign modal ----------------

function AssignModal({
  room,
  state,
  actions,
  onClose,
}: {
  room: Room;
  state: GameState;
  actions: Actions;
  onClose: () => void;
}) {
  const def = ROOMS[room.type];
  const cap = roomCapacity(room);
  const idle = state.dwellers.filter((d) => d.roomId == null && !isOnRaid(state, d.id));
  const workers = room.workers.map((id) => dwellerById(state, id)).filter(Boolean) as Dweller[];
  const apt = ROOMS[room.type].aptitude;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {def.icon} Staff the {def.name}
          </h3>
          <button className="chip-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted small">
          {workers.length}/{cap} slots ·{" "}
          {apt ? (
            <>
              prefers {APTITUDE_ICON[apt]} {APTITUDE_LABEL[apt]} (+25%)
            </>
          ) : (
            "any dweller"
          )}
        </p>

        {workers.length > 0 && (
          <>
            <h4 className="ml">On duty</h4>
            <div className="picker">
              {workers.map((d) => (
                <button key={d.id} className="pick on" onClick={() => actions.unassign(d.id)}>
                  <img className="pick-img" src={TIER_PORTRAIT[d.tier]} alt="" />
                  <span className="pn">{d.name}</span>
                  <span className="px">Lv{d.level}</span>
                  <span className="rm">recall</span>
                </button>
              ))}
            </div>
          </>
        )}

        <h4 className="ml">Idle ({idle.length})</h4>
        <div className="picker">
          {idle.length === 0 && (
            <p className="muted small">No idle dwellers. Recruit more in the Legion tab.</p>
          )}
          {idle.map((d) => {
            const match = apt && d.aptitude === apt;
            const full = workers.length >= cap;
            return (
              <button
                key={d.id}
                className={`pick ${match ? "match" : ""}`}
                disabled={full}
                onClick={() => actions.assign(d.id, room.id)}
              >
                <img className="pick-img" src={TIER_PORTRAIT[d.tier]} alt="" />
                <span className="pn">{d.name}</span>
                <span className="apt">
                  {APTITUDE_ICON[d.aptitude]} {match ? "match!" : APTITUDE_LABEL[d.aptitude]}
                </span>
                <span className="px">Lv{d.level}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
