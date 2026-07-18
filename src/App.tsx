import { useState } from "react";
import {
  APTITUDE_ICON,
  APTITUDE_LABEL,
  BUILDABLE,
  CRATE_IMG,
  IMG,
  MERCENARY_TIERS,
  ONCHAIN_LISTINGS,
  RAIDS,
  RAID_ART,
  RARITY_META,
  ROOMS,
  ROOM_ART,
  TIERS,
  TIER_PORTRAIT,
  type OnchainListing,
} from "./game/config";
import {
  arenaSquad,
  arenaSquadPower,
  buildCost,
  currentBoss,
  dwellerById,
  dwellerMight,
  equippedGearDefs,
  formatNum,
  gearDefOf,
  gearSellValue,
  heroSellValue,
  inventoryGear,
  isOnRaid,
  marketRerollCost,
  objectiveLabel,
  objectiveProgress,
  raidSquadMight,
  recruitCost,
  roomCapacity,
  roomRate,
  roomStoreCap,
  maxPopulation,
  upgradeCost,
  type Pull,
} from "./game/engine";
import { useGame } from "./hooks/useGame";
import { useWallet } from "./hooks/useWallet";
import type { Dweller, GameState, GearSlot, Room, Tier } from "./game/types";
import "./App.css";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type Tab = "stronghold" | "legion" | "arena" | "raids" | "market";
type Game = ReturnType<typeof useGame>;
type Actions = Game["actions"];
type Stats = Game["stats"];
type Wallet = ReturnType<typeof useWallet>;

const RESOURCE_IMG: Record<string, string> = { gold: IMG.gold, provisions: IMG.provisions };
const SLOT_ICON: Record<GearSlot, string> = { weapon: "⚔️", armor: "🛡️", mount: "🐎" };
const SLOT_LABEL: Record<GearSlot, string> = { weapon: "Weapon", armor: "Armor", mount: "Mount" };
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

// ---------------- character figure (draggable) ----------------

function Figure({ d, onClick }: { d: Dweller; onClick?: () => void }) {
  const delay = (d.id.charCodeAt(d.id.length - 1) % 10) * 0.15;
  const geared = d.equipped.weapon || d.equipped.armor || d.equipped.mount;
  return (
    <button
      type="button"
      className={`fig apt-${d.aptitude}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
      style={{ animationDelay: `${delay}s` }}
      title={`${d.name} · ${TIERS[d.tier].name} · Lv${d.level} · drag to assign`}
      onClick={onClick}
    >
      <img className="fig-img" src={TIER_PORTRAIT[d.tier]} alt={TIERS[d.tier].name} loading="lazy" />
      <span className="fig-lvl">{d.level}</span>
      {geared && <span className="fig-gear">⚔</span>}
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
  const game = useGame();
  const { state, stats, error: gameError, now, actions } = game;
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("stronghold");
  const [assignRoomId, setAssignRoomId] = useState<string | null>(null);
  const [heroId, setHeroId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Pull | null>(null);
  const [email, setEmail] = useState("");

  const assignRoom = assignRoomId ? state.rooms.find((r) => r.id === assignRoomId) : null;
  const hero = heroId ? dwellerById(state, heroId) : null;

  const openBox = () => {
    const pull = game.openLunchbox();
    if (pull) setReveal(pull);
  };

  // Buy a marketplace asset — settles cross-chain as USDT on Arbitrum via UA,
  // then grants the asset in-game. This is the Universal Accounts economy.
  const buyListing = async (l: OnchainListing) => {
    const result = await wallet.fundWarChest(String(l.priceUsd));
    if (!result) return;
    if (l.kind === "hero" && l.tier) actions.grantGladiator(l.tier);
    else if (l.kind === "gear" && l.defId) actions.grantGear(l.defId);
    else if (l.kind === "boost") actions.applyFunding(Number(result.amount) || l.priceUsd, result.transactionId);
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
            <p className="tagline">Collect heroes · Forge gear · Raid & rule the arena — funded on-chain</p>
          </div>
        </div>
        <div className="track-badge">
          <span>Particle UA · EIP-7702</span>
          <span>Arbitrum</span>
          <span>Magic</span>
        </div>
      </header>

      <ResourceBar state={state} stats={stats} wallet={wallet} onCollectAll={actions.collectAll} onOpenBox={openBox} />

      {state.incident && (
        <div className="banner incident" role="alert">
          <span className="incident-icon">🔥</span>
          <strong>{state.incident.label}</strong>
          <span className="muted small">
            fighting it off — {Math.max(0, Math.ceil((state.incident.endsAt - now) / 1000))}s
          </span>
        </div>
      )}

      <nav className="tabs">
        {(
          [
            ["stronghold", "🏰 Stronghold"],
            ["legion", "🛡️ Legion"],
            ["arena", "⚔️ Arena"],
            ["raids", "🗺️ Raids"],
            ["market", "🏛️ Market"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
            {id === "market" && state.mercenaryBoost > 0 && <i className="dot" />}
            {id === "legion" && state.lunchboxes > 0 && <i className="dot gift" />}
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
          onHero={(id) => setHeroId(id)}
          onOpenWarChest={() => setTab("market")}
          onOpenRaids={() => setTab("raids")}
        />
      )}

      {tab === "legion" && (
        <LegionView state={state} actions={actions} onHero={(id) => setHeroId(id)} onOpenBox={openBox} />
      )}

      {tab === "arena" && <ArenaView game={game} />}

      {tab === "raids" && <RaidsView state={state} now={now} actions={actions} />}

      {tab === "market" && (
        <MarketView
          state={state}
          actions={actions}
          wallet={wallet}
          email={email}
          setEmail={setEmail}
          onBuy={buyListing}
          onHero={(id) => setHeroId(id)}
        />
      )}

      {assignRoom && (
        <AssignModal
          room={assignRoom}
          state={state}
          actions={actions}
          onHero={(id) => {
            setAssignRoomId(null);
            setHeroId(id);
          }}
          onClose={() => setAssignRoomId(null)}
        />
      )}

      {hero && <HeroModal d={hero} state={state} actions={actions} onClose={() => setHeroId(null)} />}

      {reveal && (
        <RevealModal
          pull={reveal}
          more={state.lunchboxes}
          onAgain={openBox}
          onClose={() => setReveal(null)}
        />
      )}

      <footer className="foot">
        <p>
          UXMaxx · Universal Accounts track · original Idle Legion build · EIP-7702 chain-abstracted
          EOA · settlement on Arbitrum
        </p>
        <button type="button" className="btn ghost" onClick={() => actions.reset()}>
          Reset save
        </button>
      </footer>
    </div>
  );
}

// ---------------- resource bar ----------------

function ResourceBar({
  state,
  stats,
  wallet,
  onCollectAll,
  onOpenBox,
}: {
  state: GameState;
  stats: Stats;
  wallet: Wallet;
  onCollectAll: () => void;
  onOpenBox: () => void;
}) {
  const anyReady = state.rooms.some((r) => roomStoreCap(r) > 0 && r.stored >= 1);
  return (
    <section className="resources">
      <Chip cls="gold" icon="🪙" v={formatNum(state.gold)} s={`+${stats.goldPerSec.toFixed(1)}/s`} />
      <Chip
        cls={`prov ${stats.fed ? "" : "warn"}`}
        icon="🌾"
        v={formatNum(state.provisions)}
        s={`${stats.provisionsPerSec >= 0 ? "+" : ""}${stats.provisionsPerSec.toFixed(2)}/s${stats.fed ? "" : " · STARVING"}`}
      />
      <Chip cls="pop" icon="🛡️" v={`${stats.population}/${maxPopulation(state)}`} s={`${stats.idleCount} idle`} />
      <Chip cls="might" icon="⚔️" v={`${Math.floor(stats.might)}`} s={`${state.totalRaids} raids`} />
      <button className={`chip-stat gift ${state.lunchboxes > 0 ? "hot" : ""}`} onClick={onOpenBox} disabled={state.lunchboxes <= 0}>
        <span className="ci">🎁</span>
        <span className="cv">
          <b>{state.lunchboxes}</b>
          <small>open crate</small>
        </span>
      </button>
      <Chip
        cls="onchain"
        icon="🔗"
        v={wallet.totalUsd == null ? (wallet.session ? "…" : "—") : `$${wallet.totalUsd.toFixed(2)}`}
        s={wallet.session ? shortAddr(wallet.session.address) : "offline"}
      />
      <button type="button" className={`collect-all ${anyReady ? "ready" : ""}`} disabled={!anyReady} onClick={onCollectAll}>
        Collect all
      </button>
    </section>
  );
}

function Chip({ cls, icon, v, s }: { cls: string; icon: string; v: string; s: string }) {
  return (
    <div className={`chip-stat ${cls}`}>
      <span className="ci">{icon}</span>
      <span className="cv">
        <b>{v}</b>
        <small>{s}</small>
      </span>
    </div>
  );
}

// ---------------- stronghold ----------------

function StrongholdView({
  state,
  stats,
  now,
  actions,
  onAssign,
  onHero,
  onOpenWarChest,
  onOpenRaids,
}: {
  state: GameState;
  stats: Stats;
  now: number;
  actions: Actions;
  onAssign: (roomId: string) => void;
  onHero: (id: string) => void;
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
      <SlaveMarket state={state} actions={actions} />
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
              onHero={onHero}
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

function SlaveMarket({ state, actions }: { state: GameState; actions: Actions }) {
  const rerollCost = marketRerollCost(state);
  const full = state.dwellers.length >= maxPopulation(state);
  return (
    <div className="market">
      <div className="market-head">
        <span className="market-title">⛓️ SLAVE MARKET — buy gladiators at the gate</span>
        <button type="button" className="chip-btn" disabled={state.gold < rerollCost} onClick={() => actions.rerollMarket()}>
          🔄 New stock · 🪙 {formatNum(rerollCost)}
        </button>
      </div>
      <div className="market-row">
        {state.market.map((o) => {
          const r = RARITY[o.tier];
          const canBuy = !full && state.gold >= o.price;
          return (
            <div key={o.id} className="stall" style={{ ["--rar" as string]: r.color }}>
              <div className="stall-portrait">
                <img src={TIER_PORTRAIT[o.tier]} alt={o.name} loading="lazy" />
                <span className="stall-apt">{APTITUDE_ICON[TIERS[o.tier].aptitude]}</span>
                <span className="stall-might">{TIERS[o.tier].might} ⚔</span>
              </div>
              <div className="stall-info">
                <div className="stall-name">{o.name}</div>
                <div className="stall-tier" style={{ color: r.color }}>{TIERS[o.tier].name}</div>
                <div className="gacha-stars stall-stars" style={{ ["--rar" as string]: r.color }}>{stars(r.stars)}</div>
              </div>
              <button type="button" className="btn buy" disabled={!canBuy} onClick={() => actions.buySlave(o.id)}>
                {full ? "Hall full" : `🪙 ${formatNum(o.price)}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chamber({
  room,
  state,
  stats,
  now,
  actions,
  onAssign,
  onHero,
  onOpenWarChest,
  onOpenRaids,
}: {
  room: Room;
  state: GameState;
  stats: Stats;
  now: number;
  actions: Actions;
  onAssign: (roomId: string) => void;
  onHero: (id: string) => void;
  onOpenWarChest: () => void;
  onOpenRaids: () => void;
}) {
  const [over, setOver] = useState(false);
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

  const acceptsDrop = cap > 0 || room.type === "hall";
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    if (room.type === "hall") actions.unassign(id);
    else if (cap > 0) actions.assign(id, room.id);
  };

  return (
    <div
      className={`chamber ${room.type} ${incident ? "on-fire" : ""} ${ready ? "is-ready" : ""} ${over ? "drop-over" : ""}`}
      onDragOver={(e) => {
        if (acceptsDrop) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <img className="ch-art" src={ROOM_ART[room.type]} alt="" aria-hidden loading="lazy" />
      <div className="ch-glow" aria-hidden />

      <div className="ch-plaque">
        <span className="ch-icon">{def.icon}</span>
        <span className="ch-name">{def.name}</span>
        <span className="ch-lvl">Lv {room.level}</span>
        {def.aptitude && <span className="ch-apt">{APTITUDE_ICON[def.aptitude]}</span>}
      </div>

      <div className="ch-stage">
        <div className="crew">
          {workers.map((d) => (
            <Figure key={d.id} d={d} onClick={() => onHero(d.id)} />
          ))}
          {cap > 0 &&
            Array.from({ length: Math.max(0, cap - workers.length) }).map((_, i) => (
              <GhostFigure key={i} onClick={() => onAssign(room.id)} />
            ))}
          {resting.map((d) => (
            <Figure key={d.id} d={d} onClick={() => onHero(d.id)} />
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
            <button type="button" className="chip-btn" title="Rush — risks an incident" onClick={() => actions.rush(room.id)}>
              ⚡
            </button>
          )}
          {cap > 0 && (
            <button type="button" className="chip-btn" title="Auto-staff" onClick={() => actions.autoStaff(room.id)}>
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
            <button type="button" className="chip-btn up" disabled={state.gold < upCost} onClick={() => actions.upgrade(room.id)}>
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
            <button key={type} className={`build-btn ${type}`} disabled={exists || state.gold < cost} onClick={() => actions.build(type)} title={def.description}>
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

// ---------------- legion ----------------

function LegionView({
  state,
  actions,
  onHero,
  onOpenBox,
}: {
  state: GameState;
  actions: Actions;
  onHero: (id: string) => void;
  onOpenBox: () => void;
}) {
  const cost = recruitCost(state);
  const full = state.dwellers.length >= maxPopulation(state);
  const sorted = [...state.dwellers].sort(
    (a, b) => TIERS[b.tier].might - TIERS[a.tier].might || b.level - a.level,
  );
  return (
    <section className="panel legion">
      <Objectives state={state} actions={actions} onOpenBox={onOpenBox} />
      <div className="panel-head">
        <h2>🛡️ The Legion · {state.dwellers.length}/{maxPopulation(state)}</h2>
        <button type="button" className="btn" disabled={full || state.gold < cost} onClick={() => actions.recruit()}>
          {full ? "Hall full" : `Recruit · 🪙 ${formatNum(cost)}`}
        </button>
      </div>
      <div className="hero-grid">
        {sorted.map((d) => {
          const room = d.roomId ? state.rooms.find((r) => r.id === d.roomId) : null;
          const out = isOnRaid(state, d.id);
          const r = RARITY[d.tier];
          const geared = equippedGearDefs(state, d).length;
          return (
            <button
              key={d.id}
              className={`gacha apt-${d.aptitude}`}
              style={{ ["--rar" as string]: r.color }}
              onClick={() => onHero(d.id)}
            >
              <div className="gacha-frame">
                <div className="gacha-top">
                  <span className="gacha-tier">{TIERS[d.tier].name}</span>
                  <span className="gacha-lvl">Lv {d.level}</span>
                </div>
                <div className="gacha-portrait">
                  <img src={TIER_PORTRAIT[d.tier]} alt={TIERS[d.tier].name} loading="lazy" />
                  <span className="gacha-apt">{APTITUDE_ICON[d.aptitude]}</span>
                  <span className="gacha-might">{Math.floor(dwellerMight(d, state))} ⚔</span>
                  {geared > 0 && <span className="gacha-gear">{geared}⚙</span>}
                </div>
                <div className="gacha-name">{d.name}</div>
                <div className="gacha-stars">{stars(r.stars)}</div>
                <div className="gacha-foot">
                  {out ? (
                    <span className="badge raid">On raid</span>
                  ) : room ? (
                    <span className="badge">{ROOMS[room.type].icon} {ROOMS[room.type].name}</span>
                  ) : (
                    <span className="badge idle">Idle · tap to equip</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Objectives({ state, actions, onOpenBox }: { state: GameState; actions: Actions; onOpenBox: () => void }) {
  return (
    <div className="objectives">
      <div className="obj-head">
        <span>🎯 OBJECTIVES</span>
        <button className={`crate-btn ${state.lunchboxes > 0 ? "hot" : ""}`} disabled={state.lunchboxes <= 0} onClick={onOpenBox}>
          🎁 Open Lunchbox · {state.lunchboxes}
        </button>
      </div>
      <div className="obj-row">
        {state.objectives.map((o) => {
          const prog = objectiveProgress(state, o);
          const done = prog >= o.target;
          return (
            <div key={o.id} className={`obj ${done ? "done" : ""}`}>
              <div className="obj-label">{objectiveLabel(o)}</div>
              <div className="obj-bar">
                <i style={{ width: `${Math.min(100, (prog / o.target) * 100)}%` }} />
              </div>
              <div className="obj-foot">
                <span>{formatNum(Math.min(prog, o.target))}/{formatNum(o.target)}</span>
                <button className="chip-btn" disabled={!done} onClick={() => actions.claimObjective(o.id)}>
                  🎁 +{o.reward}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- arena ----------------

function ArenaView({ game }: { game: Game }) {
  const { state, now, fightBoss } = game;
  const [flash, setFlash] = useState<string | null>(null);
  const boss = currentBoss(state);
  const squad = arenaSquad(state);
  const power = Math.floor(arenaSquadPower(state));
  const hpFrac = Math.max(0, state.arena.bossHp) / bossMaxHp(state);
  const cd = Math.max(0, 6000 - (now - state.arena.lastFightAt));
  const onFight = () => {
    const res = fightBoss();
    if (res) setFlash(res.killed ? `💥 ${res.bossName} DEFEATED! +${formatNum(res.reward)}g +🎁` : `Hit for ${formatNum(res.damage)}!`);
  };
  return (
    <section className="panel arena">
      <div className="panel-head">
        <h2>⚔️ The Arena · World Boss</h2>
        <div className="rank-chip">🏆 Rank #{state.arena.rank} · {state.arena.wins} wins</div>
      </div>

      <div className="boss-stage" style={{ backgroundImage: `url(${boss.img})` }}>
        <div className="boss-veil" />
        <div className="boss-body">
          <div className="boss-name">{boss.name}</div>
          <div className="boss-hpbar">
            <i style={{ width: `${hpFrac * 100}%` }} />
            <b>{formatNum(Math.max(0, state.arena.bossHp))} HP</b>
          </div>
          {flash && <div className="boss-flash">{flash}</div>}
        </div>
      </div>

      <div className="arena-controls">
        <div className="squad-info">
          <div className="squad-power">Squad power <b>{power} ⚔</b></div>
          <div className="squad-figs">
            {squad.slice(0, 8).map((d) => (
              <img key={d.id} className="squad-fig" src={TIER_PORTRAIT[d.tier]} alt={d.name} title={`${d.name} · ${Math.floor(dwellerMight(d, state))}⚔`} />
            ))}
            {squad.length === 0 && <span className="muted small">No idle heroes — recall some from rooms/raids.</span>}
          </div>
        </div>
        <button type="button" className="btn big" disabled={cd > 0 || squad.length === 0} onClick={onFight}>
          {cd > 0 ? `Regrouping ${Math.ceil(cd / 1000)}s` : "⚔ FIGHT"}
        </button>
      </div>
      <p className="muted small">
        Idle heroes form your squad. Beat the boss to earn gold + a 🎁 lunchbox and climb the ladder. Equip gear in the Legion tab to hit harder.
      </p>
    </section>
  );
}

function bossMaxHp(state: GameState): number {
  // for the HP bar we track relative to the boss's spawn HP; approximate with current max seen
  const boss = currentBoss(state);
  return Math.max(state.arena.bossHp, boss.baseHp);
}

// ---------------- raids ----------------

function RaidsView({ state, now, actions }: { state: GameState; now: number; actions: Actions }) {
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
        <h2>🗺️ Raids · the Wastes</h2>
        <p className="muted small">
          Idle squad might: <strong>{Math.floor(squadMight)} ⚔</strong> · every raid drops a 🎁 lunchbox
        </p>
      </div>
      {!hasWarRoom && <p className="muted small warn">Dig a 🗺️ War Room in the Stronghold to launch raids.</p>}

      {raid && mission && (
        <div className="active-raid" style={{ backgroundImage: `url(${RAID_ART[mission.id]})` }}>
          <div className="ar-body">
            <span className="ar-icon">{mission.icon}</span>
            <div className="ar-main">
              <strong>{mission.name}</strong>
              <div className="prod-meter big">
                <i style={{ width: `${raidProg * 100}%` }} className={raidDone ? "full" : ""} />
              </div>
              <span className="muted small">{raid.squad.length} out · {raidDone ? "returned!" : `${raidLeft}s`}</span>
            </div>
            <button type="button" className="btn" disabled={!raidDone} onClick={() => actions.claimRaid()}>
              {raidDone ? "Claim loot" : "Marching…"}
            </button>
          </div>
        </div>
      )}

      <div className="stage-grid">
        {RAIDS.map((m) => {
          const locked = squadMight < m.minMight;
          return (
            <article key={m.id} className={`stage ${locked ? "locked" : ""}`} style={{ backgroundImage: `url(${RAID_ART[m.id]})` }}>
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
                <button type="button" className="btn" disabled={locked || Boolean(raid) || !hasWarRoom} onClick={() => actions.startRaid(m.id)}>
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

// ---------------- hero detail modal (equipment) ----------------

function HeroModal({ d, state, actions, onClose }: { d: Dweller; state: GameState; actions: Actions; onClose: () => void }) {
  const [pickSlot, setPickSlot] = useState<GearSlot | null>(null);
  const r = RARITY[d.tier];
  const room = d.roomId ? state.rooms.find((x) => x.id === d.roomId) : null;
  const out = isOnRaid(state, d.id);
  const might = Math.floor(dwellerMight(d, state));
  const inv = inventoryGear(state).filter((g) => (pickSlot ? gearDefOf(g).slot === pickSlot : true));

  const equippedItem = (slot: GearSlot) => {
    const id = d.equipped[slot];
    if (!id) return null;
    const item = state.gear.find((g) => g.id === id);
    return item ? gearDefOf(item) : null;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal hero-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ color: r.color }}>{d.name}</h3>
          <button className="chip-btn" onClick={onClose}>✕</button>
        </div>

        <div className="hm-top">
          <div className="hm-portrait" style={{ ["--rar" as string]: r.color }}>
            <img src={TIER_PORTRAIT[d.tier]} alt={TIERS[d.tier].name} />
          </div>
          <div className="hm-info">
            <div className="hm-tier" style={{ color: r.color }}>
              {TIERS[d.tier].icon} {TIERS[d.tier].name} · {r.name}
            </div>
            <div className="gacha-stars" style={{ ["--rar" as string]: r.color }}>{stars(r.stars)}</div>
            <div className="hm-stats">
              <span>Lv {d.level}</span>
              <span>{APTITUDE_ICON[d.aptitude]} {APTITUDE_LABEL[d.aptitude]}</span>
              <span className="hm-might">{might} ⚔ might</span>
            </div>
            <div className="hm-status">
              {out ? (
                <span className="badge raid">On raid</span>
              ) : room ? (
                <>
                  <span className="badge">{ROOMS[room.type].icon} {ROOMS[room.type].name}</span>
                  <button className="chip-btn" onClick={() => actions.unassign(d.id)}>Recall</button>
                </>
              ) : (
                <span className="badge idle">Idle</span>
              )}
            </div>
          </div>
        </div>

        <h4 className="ml">Equipment</h4>
        <div className="slots">
          {(["weapon", "armor", "mount"] as GearSlot[]).map((slot) => {
            const g = equippedItem(slot);
            return (
              <div key={slot} className="slot-row">
                <button
                  className={`slot ${g ? "filled" : ""}`}
                  style={g ? { ["--rar" as string]: RARITY_META[g.rarity].color } : undefined}
                  onClick={() => setPickSlot(pickSlot === slot ? null : slot)}
                >
                  {g ? <img src={g.img} alt={g.name} /> : <span className="slot-ic">{SLOT_ICON[slot]}</span>}
                </button>
                <div className="slot-info">
                  <div className="slot-label">{SLOT_LABEL[slot]}</div>
                  {g ? (
                    <>
                      <div className="slot-name" style={{ color: RARITY_META[g.rarity].color }}>{g.name}</div>
                      <div className="slot-bonus">+{g.might}⚔ {g.output ? `· +${g.output}/s` : ""}</div>
                    </>
                  ) : (
                    <div className="muted small">empty — tap to equip</div>
                  )}
                </div>
                {g && (
                  <button className="chip-btn" onClick={() => actions.unequip(d.id, slot)}>Unequip</button>
                )}
              </div>
            );
          })}
        </div>

        {pickSlot && (
          <>
            <h4 className="ml">Choose {SLOT_LABEL[pickSlot]} ({inv.length})</h4>
            <div className="gear-picker">
              {inv.length === 0 && <p className="muted small">No {SLOT_LABEL[pickSlot].toLowerCase()} in the armory. Open lunchboxes to find gear.</p>}
              {inv.map((item) => {
                const g = gearDefOf(item);
                return (
                  <button
                    key={item.id}
                    className="gpick"
                    style={{ ["--rar" as string]: RARITY_META[g.rarity].color }}
                    onClick={() => {
                      actions.equip(d.id, item.id);
                      setPickSlot(null);
                    }}
                  >
                    <img src={g.img} alt={g.name} />
                    <span className="gp-name" style={{ color: RARITY_META[g.rarity].color }}>{g.name}</span>
                    <span className="gp-bonus">+{g.might}⚔{g.output ? ` +${g.output}/s` : ""}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- lunchbox reveal ----------------

function RevealModal({ pull, more, onAgain, onClose }: { pull: Pull; more: number; onAgain: () => void; onClose: () => void }) {
  let img = CRATE_IMG;
  let title = "";
  let sub = "";
  let color = "#ffc233";
  if (pull.kind === "gold") {
    img = IMG.gold;
    title = `+${formatNum(pull.gold)} Gold`;
    sub = "Sestertii for the war chest";
    color = "#ffc233";
  } else if (pull.kind === "gear") {
    img = pull.def.img;
    title = pull.def.name;
    sub = `${RARITY_META[pull.rarity].name} ${pull.def.slot} · +${pull.def.might}⚔${pull.def.output ? ` +${pull.def.output}/s` : ""}`;
    color = RARITY_META[pull.rarity].color;
  } else {
    img = TIER_PORTRAIT[pull.dweller.tier];
    title = `${pull.dweller.name} joins!`;
    sub = `${TIERS[pull.dweller.tier].name} · ${RARITY[pull.dweller.tier].name}`;
    color = RARITY[pull.dweller.tier].color;
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal reveal" onClick={(e) => e.stopPropagation()} style={{ ["--rar" as string]: color }}>
        <div className="reveal-burst" />
        <div className="reveal-card">
          <img className="reveal-img" src={img} alt={title} />
        </div>
        <div className="reveal-title" style={{ color }}>{title}</div>
        <div className="reveal-sub">{sub}</div>
        <div className="reveal-actions">
          <button className="btn secondary" onClick={onClose}>Nice</button>
          <button className="btn" disabled={more <= 0} onClick={onAgain}>🎁 Open another · {more}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- marketplace (buy on-chain via UA + sell your assets) ----------------

function MarketView({
  state,
  actions,
  wallet,
  email,
  setEmail,
  onBuy,
  onHero,
}: {
  state: GameState;
  actions: Actions;
  wallet: Wallet;
  email: string;
  setEmail: (v: string) => void;
  onBuy: (l: OnchainListing) => void;
  onHero: (id: string) => void;
}) {
  const inv = inventoryGear(state);
  const canBuy = Boolean(wallet.session && wallet.caps.particle && !wallet.busy);
  const sellable = [...state.dwellers].sort((a, b) => TIERS[b.tier].might - TIERS[a.tier].might);
  return (
    <section className="panel market-view">
      <div className="wc-hero" style={{ backgroundImage: `url(${IMG.chest})` }}>
        <div className="wc-hero-veil" />
        <div className="wc-hero-body">
          <h2>🏛️ Marketplace</h2>
          <p className="muted">
            Trade gladiators &amp; gear. Premium assets settle <strong>cross-chain as USDT on Arbitrum</strong> through
            Particle <strong>Universal Accounts</strong> (<code>EIP-7702</code>) — pay from any chain, no bridge, no chain
            switch. The whole economy runs on-chain.
          </p>
        </div>
      </div>

      {/* wallet */}
      <div className="auth-box">
        {!wallet.session ? (
          <>
            <h3>Connect to trade on-chain</h3>
            {wallet.caps.magic ? (
              <form className="email-row" onSubmit={(e) => { e.preventDefault(); if (email.trim()) void wallet.loginMagic(email.trim()); }}>
                <input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <button type="submit" className="btn" disabled={wallet.busy}>Magic login</button>
              </form>
            ) : (
              <p className="muted small">Set <code>VITE_MAGIC_PUBLISHABLE_KEY</code> for email login.</p>
            )}
            <button type="button" className="btn secondary" disabled={wallet.busy} onClick={() => void wallet.loginInjected()}>
              Connect browser wallet
            </button>
          </>
        ) : (
          <div className="session">
            <div>
              <strong>{wallet.session.method === "magic" ? "Magic" : "Wallet"} · {shortAddr(wallet.session.address)}</strong>
              {wallet.uaAddress && <div className="muted small">UA / 7702 · {shortAddr(wallet.uaAddress)}</div>}
              <div className="muted small">Unified balance: {wallet.totalUsd == null ? "…" : `$${wallet.totalUsd.toFixed(2)}`}</div>
            </div>
            <div className="session-actions">
              <button type="button" className="btn secondary" disabled={wallet.busy} onClick={() => void wallet.refreshBalances()}>Refresh</button>
              <button type="button" className="btn ghost" disabled={wallet.busy} onClick={() => void wallet.logout()}>Logout</button>
            </div>
          </div>
        )}
      </div>

      {/* on-chain buy */}
      <h3 className="mk-h">⚡ On-Chain Bazaar · buy with USDT (Universal Accounts → Arbitrum)</h3>
      {!wallet.caps.particle && (
        <p className="muted small warn">Add Particle keys in <code>.env</code> to enable live on-chain buys. Everything else plays offline.</p>
      )}
      <div className="listing-grid">
        {ONCHAIN_LISTINGS.map((l) => (
          <article key={l.id} className="listing" style={{ ["--rar" as string]: RARITY_META[l.rarity].color }}>
            <img className="listing-img" src={l.img} alt={l.label} loading="lazy" />
            <div className="listing-body">
              <div className="listing-name">{l.label}</div>
              <div className="listing-sub" style={{ color: RARITY_META[l.rarity].color }}>{l.sub}</div>
            </div>
            <button type="button" className="btn buy" disabled={!canBuy} onClick={() => onBuy(l)} title={canBuy ? "" : "Connect a wallet with keys to buy on-chain"}>
              {wallet.busy ? "Routing…" : `＄${l.priceUsd.toFixed(2)} · Buy`}
            </button>
          </article>
        ))}
      </div>
      {wallet.lastTx && (
        <p className="tx-ok">Settled {wallet.lastTx.amount} USDT on Arbitrum · <a href={wallet.lastTx.url} target="_blank" rel="noreferrer">View on UniversalX</a></p>
      )}

      {/* sell */}
      <h3 className="mk-h">💰 Sell your assets → gold</h3>
      <div className="sell-cols">
        <div>
          <h4 className="ml">Gladiators</h4>
          <div className="sell-grid">
            {sellable.map((d) => (
              <div key={d.id} className="sell-item" style={{ ["--rar" as string]: RARITY[d.tier].color }}>
                <img src={TIER_PORTRAIT[d.tier]} alt={d.name} onClick={() => onHero(d.id)} />
                <div className="sell-info">
                  <span className="sell-name">{d.name}</span>
                  <span className="sell-tier" style={{ color: RARITY[d.tier].color }}>{TIERS[d.tier].name} Lv{d.level}</span>
                </div>
                <button type="button" className="chip-btn" disabled={state.dwellers.length <= 1} onClick={() => actions.sellHero(d.id)}>
                  🪙 {formatNum(heroSellValue(d))}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="ml">Gear ({inv.length})</h4>
          <div className="sell-grid">
            {inv.length === 0 && <p className="muted small">No spare gear. Open lunchboxes or buy on-chain.</p>}
            {inv.map((item) => {
              const g = gearDefOf(item);
              return (
                <div key={item.id} className="sell-item" style={{ ["--rar" as string]: RARITY_META[g.rarity].color }}>
                  <img src={g.img} alt={g.name} />
                  <div className="sell-info">
                    <span className="sell-name">{g.name}</span>
                    <span className="sell-tier" style={{ color: RARITY_META[g.rarity].color }}>+{g.might}⚔ {g.slot}</span>
                  </div>
                  <button type="button" className="chip-btn" onClick={() => actions.sellGear(item.id)}>
                    🪙 {formatNum(gearSellValue(item.defId))}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="tiers">
        <h3>Free Company tiers (on-chain boost)</h3>
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

// ---------------- assign modal ----------------

function AssignModal({
  room,
  state,
  actions,
  onHero,
  onClose,
}: {
  room: Room;
  state: GameState;
  actions: Actions;
  onHero: (id: string) => void;
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
          <h3>{def.icon} Staff the {def.name}</h3>
          <button className="chip-btn" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">
          {workers.length}/{cap} slots · {apt ? <>prefers {APTITUDE_ICON[apt]} {APTITUDE_LABEL[apt]} (+25%)</> : "any dweller"}
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
          {idle.length === 0 && <p className="muted small">No idle dwellers. Recruit or open lunchboxes.</p>}
          {idle.map((d) => {
            const match = apt && d.aptitude === apt;
            const full = workers.length >= cap;
            return (
              <button key={d.id} className={`pick ${match ? "match" : ""}`} disabled={full} onClick={() => actions.assign(d.id, room.id)}>
                <img className="pick-img" src={TIER_PORTRAIT[d.tier]} alt="" onClick={(e) => { e.stopPropagation(); onHero(d.id); }} />
                <span className="pn">{d.name}</span>
                <span className="apt">{APTITUDE_ICON[d.aptitude]} {match ? "match!" : APTITUDE_LABEL[d.aptitude]}</span>
                <span className="px">Lv{d.level}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
