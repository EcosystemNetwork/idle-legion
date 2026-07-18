import { useState } from "react";
import {
  APTITUDE_ICON,
  APTITUDE_LABEL,
  BUILDABLE,
  MERCENARY_TIERS,
  RAIDS,
  ROOMS,
  TIERS,
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
import type { Dweller, GameState, Room } from "./game/types";
import "./App.css";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type Tab = "stronghold" | "legion" | "raids" | "warchest";

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
      <div className="bg-glow" aria-hidden />

      <header className="top">
        <div className="brand">
          <span className="brand-icon">⚔️</span>
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
            ["stronghold", "Stronghold"],
            ["legion", "Legion"],
            ["raids", "Raids"],
            ["warchest", "War Chest"],
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
  stats: ReturnType<typeof useGame>["stats"];
  wallet: ReturnType<typeof useWallet>;
  onCollectAll: () => void;
}) {
  const anyReady = state.rooms.some((r) => roomStoreCap(r) > 0 && r.stored >= 1);
  return (
    <section className="resources">
      <div className="stat gold">
        <span className="label">Gold</span>
        <strong>{formatNum(state.gold)}</strong>
        <small>+{stats.goldPerSec.toFixed(1)}/s</small>
      </div>
      <div className={`stat prov ${stats.fed ? "" : "warn"}`}>
        <span className="label">Provisions</span>
        <strong>{formatNum(state.provisions)}</strong>
        <small>
          {stats.provisionsPerSec >= 0 ? "+" : ""}
          {stats.provisionsPerSec.toFixed(2)}/s {stats.fed ? "" : "· STARVING"}
        </small>
      </div>
      <div className="stat pop">
        <span className="label">Legion</span>
        <strong>
          {stats.population}
          <span className="cap">/{maxPopulation(state)}</span>
        </strong>
        <small>{stats.idleCount} idle</small>
      </div>
      <div className="stat might">
        <span className="label">Might</span>
        <strong>{Math.floor(stats.might)}</strong>
        <small>{state.totalRaids} raids won</small>
      </div>
      <div className="stat merc">
        <span className="label">Free Company</span>
        <strong>+{Math.round(state.mercenaryBoost * 100)}%</strong>
        <small>chest ${state.warChestUsd.toFixed(2)}</small>
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
        <small>{wallet.session ? shortAddr(wallet.session.address) : "not connected"}</small>
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

// ---------------- Stronghold (cutaway) ----------------

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
  stats: ReturnType<typeof useGame>["stats"];
  now: number;
  actions: ReturnType<typeof useGame>["actions"];
  onAssign: (roomId: string) => void;
  onOpenWarChest: () => void;
  onOpenRaids: () => void;
}) {
  return (
    <section className="stronghold">
      <div className="cutaway">
        <div className="surface">
          <span>⛰️ THE SURFACE</span>
        </div>
        {state.rooms.map((room) => (
          <RoomRow
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
        <div className="bedrock">
          <BuildMenu state={state} actions={actions} />
        </div>
      </div>
    </section>
  );
}

function RoomRow({
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
  stats: ReturnType<typeof useGame>["stats"];
  now: number;
  actions: ReturnType<typeof useGame>["actions"];
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

  return (
    <article className={`room ${room.type} ${incident ? "on-fire" : ""}`}>
      <div className="room-face">
        <div className="room-id">
          <span className="room-icon">{def.icon}</span>
          <div>
            <h3>
              {def.name} <span className="lvl">Lv {room.level}</span>
            </h3>
            <p className="muted small">
              {def.aptitude ? (
                <>
                  best worked by {APTITUDE_ICON[def.aptitude]} {APTITUDE_LABEL[def.aptitude]}
                </>
              ) : (
                def.description
              )}
            </p>
          </div>
        </div>

        {/* worker slots */}
        {cap > 0 && (
          <div className="slots">
            {Array.from({ length: cap }).map((_, i) => {
              const d = workers[i];
              return d ? (
                <button
                  key={d.id}
                  className={`slot filled ${aptMatch(room, d) ? "match" : ""}`}
                  title={`${d.name} · ${TIERS[d.tier].name} · Lv${d.level} · ${APTITUDE_LABEL[d.aptitude]}`}
                  onClick={() => actions.unassign(d.id)}
                >
                  <span>{TIERS[d.tier].icon}</span>
                  <i>{d.level}</i>
                </button>
              ) : (
                <button key={i} className="slot empty" onClick={() => onAssign(room.id)}>
                  +
                </button>
              );
            })}
          </div>
        )}

        {/* production / collect */}
        {storeCap > 0 && (
          <div className="production">
            <div className="prod-bar">
              <i style={{ width: `${fill * 100}%` }} className={ready ? "full" : ""} />
            </div>
            <button
              type="button"
              className={`collect ${ready ? "ready" : ""}`}
              disabled={!ready}
              onClick={() => actions.collect(room.id)}
            >
              {ready ? `Collect ${formatNum(stored)}` : `+${rate.toFixed(1)}/s`}
            </button>
          </div>
        )}
      </div>

      {/* per-room actions */}
      <div className="room-actions">
        {def.produces && (
          <button
            type="button"
            className="mini"
            title="Instantly fill storage — risks an incident"
            onClick={() => actions.rush(room.id)}
          >
            ⚡ Rush
          </button>
        )}
        {cap > 0 && (
          <button type="button" className="mini" onClick={() => actions.autoStaff(room.id)}>
            Auto-staff
          </button>
        )}
        {room.type === "warroom" && (
          <button type="button" className="mini accent" onClick={onOpenRaids}>
            Plan raid →
          </button>
        )}
        {room.type === "warchest" && (
          <button type="button" className="mini accent" onClick={onOpenWarChest}>
            Open vault →
          </button>
        )}
        {room.type !== "warchest" && (
          <button
            type="button"
            className="mini"
            disabled={state.gold < upCost}
            onClick={() => actions.upgrade(room.id)}
          >
            ⬆ Lv{room.level + 1} · {formatNum(upCost)}g
          </button>
        )}
      </div>

      {incident && (
        <div className="incident-overlay">
          🔥 {incident.label} · {Math.max(0, Math.ceil((incident.endsAt - now) / 1000))}s
        </div>
      )}
    </article>
  );
}

function aptMatch(room: Room, d: Dweller): boolean {
  return ROOMS[room.type].aptitude === d.aptitude;
}

function BuildMenu({
  state,
  actions,
}: {
  state: GameState;
  actions: ReturnType<typeof useGame>["actions"];
}) {
  return (
    <div className="build-menu">
      <span className="build-label">⛏ Dig a new room</span>
      <div className="build-row">
        {BUILDABLE.map((type) => {
          const def = ROOMS[type];
          const exists = def.unique && state.rooms.some((r) => r.type === type);
          const cost = buildCost(type);
          return (
            <button
              key={type}
              className="build-btn"
              disabled={exists || state.gold < cost}
              onClick={() => actions.build(type)}
              title={def.description}
            >
              <span className="bi">{def.icon}</span>
              <span className="bn">{def.name}</span>
              <span className="bc">{exists ? "built" : `${formatNum(cost)}g`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Legion roster ----------------

function LegionView({
  state,
  actions,
}: {
  state: GameState;
  actions: ReturnType<typeof useGame>["actions"];
}) {
  const cost = recruitCost(state);
  const full = state.dwellers.length >= maxPopulation(state);
  const sorted = [...state.dwellers].sort(
    (a, b) => TIERS[b.tier].might - TIERS[a.tier].might || b.level - a.level,
  );
  return (
    <section className="panel legion">
      <div className="panel-head">
        <h2>The Legion · {state.dwellers.length}/{maxPopulation(state)}</h2>
        <button
          type="button"
          className="btn"
          disabled={full || state.gold < cost}
          onClick={() => actions.recruit()}
        >
          {full ? "Hall full" : `Recruit · ${formatNum(cost)}g`}
        </button>
      </div>
      <div className="roster">
        {sorted.map((d) => {
          const room = d.roomId ? state.rooms.find((r) => r.id === d.roomId) : null;
          const out = isOnRaid(state, d.id);
          return (
            <article key={d.id} className="dweller-card">
              <span className="dw-icon">{TIERS[d.tier].icon}</span>
              <div className="dw-main">
                <h3>
                  {d.name} <span className="muted small">{TIERS[d.tier].name}</span>
                </h3>
                <div className="dw-meta">
                  <span className="apt">
                    {APTITUDE_ICON[d.aptitude]} {APTITUDE_LABEL[d.aptitude]}
                  </span>
                  <span>Lv {d.level}</span>
                  <span>{Math.floor(dwellerMight(d))} might</span>
                </div>
                <div className="xpbar">
                  <i style={{ width: `${Math.min(100, (d.xp / (d.level * 100)) * 100)}%` }} />
                </div>
              </div>
              <div className="dw-status">
                {out ? (
                  <span className="badge raid">On raid</span>
                ) : room ? (
                  <>
                    <span className="badge">{ROOMS[room.type].icon} {ROOMS[room.type].name}</span>
                    <button className="mini" onClick={() => actions.unassign(d.id)}>
                      Recall
                    </button>
                  </>
                ) : (
                  <span className="badge idle">Idle</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- Raids ----------------

function RaidsView({
  state,
  now,
  actions,
}: {
  state: GameState;
  now: number;
  actions: ReturnType<typeof useGame>["actions"];
}) {
  const hasWarRoom = state.rooms.some((r) => r.type === "warroom");
  const squadMight = raidSquadMight(state);
  const raid = state.activeRaid;
  const mission = raid ? RAIDS.find((m) => m.id === raid.missionId) : null;
  const raidLeft = raid ? Math.max(0, Math.ceil((raid.endsAt - now) / 1000)) : 0;
  const raidDone = raid ? now >= raid.endsAt : false;
  const raidProg = raid && mission ? Math.min(1, (now - raid.startedAt) / (raid.endsAt - raid.startedAt)) : 0;

  return (
    <section className="panel raids">
      <div className="panel-head">
        <h2>Raids</h2>
        <p className="muted small">
          Idle squad might: <strong>{Math.floor(squadMight)}</strong> · sends all idle dwellers
        </p>
      </div>

      {!hasWarRoom && (
        <p className="muted small warn">Dig a 🗺️ War Room in the Stronghold to launch raids.</p>
      )}

      {raid && mission && (
        <div className="active-raid">
          <span>{mission.icon}</span>
          <div className="ar-main">
            <strong>{mission.name}</strong>
            <div className="prod-bar big">
              <i style={{ width: `${raidProg * 100}%` }} className={raidDone ? "full" : ""} />
            </div>
            <span className="muted small">
              {raid.squad.length} dwellers out · {raidDone ? "returned" : `${raidLeft}s`}
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
      )}

      <div className="raid-grid">
        {RAIDS.map((m) => {
          const locked = squadMight < m.minMight;
          return (
            <article key={m.id} className={`raid-card ${locked ? "locked" : ""}`}>
              <div className="raid-top">
                <span>{m.icon}</span>
                <div>
                  <h3>{m.name}</h3>
                  <p>{m.description}</p>
                </div>
              </div>
              <div className="dw-meta">
                <span>{m.durationSec}s</span>
                <span>≥{m.minMight} might</span>
                <span>+{formatNum(m.goldReward)}g</span>
              </div>
              <button
                type="button"
                className="btn"
                disabled={locked || Boolean(raid) || !hasWarRoom}
                onClick={() => actions.startRaid(m.id)}
              >
                {locked ? "Need more might" : raid ? "Raid in progress" : "March"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- War Chest (on-chain / UA) ----------------

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
  wallet: ReturnType<typeof useWallet>;
  email: string;
  setEmail: (v: string) => void;
  fundAmount: string;
  setFundAmount: (v: string) => void;
  onFund: () => void;
}) {
  return (
    <section className="panel warchest">
      <div className="panel-head">
        <h2>🏦 Treasury Vault</h2>
        <p className="muted">
          Fund the war with <strong>any-chain</strong> assets. Universal Accounts (
          <code>EIP-7702</code>) route value and land <strong>USDT on Arbitrum</strong> — no bridge
          UI, no chain switch. Funding hires a permanent <strong>Free Company</strong> that boosts
          every room.
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
  actions: ReturnType<typeof useGame>["actions"];
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
          <button className="mini" onClick={onClose}>
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
                  <span>{TIERS[d.tier].icon}</span>
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
          {idle.length === 0 && <p className="muted small">No idle dwellers. Recruit more in the Legion tab.</p>}
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
                <span>{TIERS[d.tier].icon}</span>
                <span className="pn">{d.name}</span>
                <span className="apt">
                  {APTITUDE_ICON[d.aptitude]} {match ? "match" : APTITUDE_LABEL[d.aptitude]}
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
