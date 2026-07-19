import { createElement, lazy, Suspense, useEffect, useRef, useState } from "react";
import "@google/model-viewer";

// Heavy Three.js Arena boss viewer — code-split so three.js stays out of the
// initial bundle and only loads when a player opens the Arena on a 3D boss.
const BossStage = lazy(() => import("./components/BossStage"));
// Dev/admin "see everything" overlay — code-split so it never ships in the main view.
const AdminPanel = lazy(() => import("./components/AdminPanel"));
import KingdomMap from "./components/KingdomMap";
import {
  APTITUDE_ICON,
  APTITUDE_LABEL,
  BUILDABLE,
  CRATE_IMG,
  DESCEND_MIN_GOLD,
  IMG,
  KEKIUS_MODEL,
  KIT,
  MERCENARY_TIERS,
  MIGHT_PER_LEVEL,
  MILESTONE_EVERY,
  ONCHAIN_LISTINGS,
  OUTPUT_PER_LEVEL,
  RAIDS,
  RAID_ART,
  RARITY_META,
  RENOWN_BOOST_PER,
  ROOMS,
  ROOM_ART,
  TIERS,
  TIER_PORTRAIT,
  xpForLevel,
} from "./game/config";
import {
  ASSET_CATALOG,
  ASSET_TYPE_LABEL,
  assetsByType,
  type AssetType,
} from "./game/assets";
import {
  arenaSquad,
  arenaSquadPower,
  buildCost,
  canDescend,
  currentBoss,
  dwellerById,
  dwellerMight,
  equippedGearDefs,
  formatNum,
  gearDefOf,
  gearSellValue,
  heroSellValue,
  idleDwellers,
  inventoryGear,
  isOnRaid,
  marketRerollCost,
  objectiveLabel,
  objectiveProgress,
  pendingRenown,
  raidSquadMight,
  recruitCost,
  renownBoost,
  roomCapacity,
  roomRate,
  roomStoreCap,
  maxPopulation,
  squadPower,
  upgradeCost,
  xpProgress,
  type Pull,
} from "./game/engine";
import { useGame } from "./hooks/useGame";
import { useWallet } from "./hooks/useWallet";
import type { Dweller, GameState, GearSlot, LevelUpEvent, OfflineSummary, OnchainListing, Room, Tier } from "./game/types";
import "./App.css";
import { burst, centerOf, coinArc, floatText, ring, sfx, shake } from "./fx/juice";
import { MuteButton, useCountUp, useTabTitleEarnings, useUiSounds } from "./fx/react";
import { flush, identify, initTelemetry } from "./lib/telemetry";

const GOLD_CHIP = ".chip-stat.gold";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type Tab = "kingdom" | "stronghold" | "legion" | "arena" | "raids" | "market" | "codex";
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

// A slim XP bar with the fraction-to-next-level. `milestone` glows gold when the
// next level is a milestone, so the payoff is telegraphed before it lands.
function XpBar({ d, showText = false }: { d: Dweller; showText?: boolean }) {
  const frac = xpProgress(d);
  const need = xpForLevel(d.level);
  const nextIsMilestone = (d.level + 1) % MILESTONE_EVERY === 0;
  return (
    <div className={`xp-bar ${nextIsMilestone ? "milestone" : ""}`} title={`${Math.floor(d.xp)} / ${need} XP → Lv ${d.level + 1}`}>
      <i style={{ width: `${frac * 100}%` }} />
      {showText && <b>{Math.floor(d.xp)} / {need} XP</b>}
    </div>
  );
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

// The animated 3D boss (Meshy GLB) rendered via <model-viewer>.
function ModelBoss({ src }: { src: string }) {
  return createElement("model-viewer", {
    src,
    poster: ROOM_ART.quarters, // 2D boss art shown until the 3D model loads (or if WebGL is off)
    alt: "Kekius Maximus — the Master",
    autoplay: true,
    "camera-controls": true,
    "auto-rotate": true,
    "rotation-per-second": "18deg",
    "auto-rotate-delay": 0,
    "interaction-prompt": "none",
    "disable-zoom": true,
    "shadow-intensity": "0.9",
    exposure: "1.15",
    "camera-orbit": "0deg 88deg 2.7m",
    "field-of-view": "30deg",
    loading: "eager",
    reveal: "auto",
    style: { width: "100%", height: "100%", background: "transparent" },
  });
}

// ---------------- App ----------------

export default function App() {
  const game = useGame();
  const { state, stats, error: gameError, now, actions } = game;
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("kingdom");
  const [assignRoomId, setAssignRoomId] = useState<string | null>(null);
  const [heroId, setHeroId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Pull | null>(null);
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);

  useUiSounds();
  useTabTitleEarnings(stats.goldPerSec, stats.fed);

  // Boot telemetry once — global click tracking + batched flush to InsForge.
  useEffect(() => {
    initTelemetry();
    return () => void flush(true);
  }, []);

  // Report the player's identity whenever the wallet session changes.
  useEffect(() => {
    identify({
      email: wallet.session?.email ?? null,
      walletAddress: wallet.session?.address ?? null,
    });
  }, [wallet.session]);

  // Toggle the admin panel with the ` (backtick) key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setAdmin((a) => !a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const assignRoom = assignRoomId ? state.rooms.find((r) => r.id === assignRoomId) : null;
  const hero = heroId ? dwellerById(state, heroId) : null;

  const openBox = () => {
    const pull = game.openLunchbox();
    if (pull) setReveal(pull);
    else sfx.error();
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
            <p className="tagline">They rugged the Surface. So we dug. · Raise a legion, raid the Wastes, stay Kekius — funded on-chain</p>
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
            ["kingdom", "🏰 Kingdom"],
            ["stronghold", "⛏️ Stronghold"],
            ["legion", "🛡️ Legion"],
            ["arena", "⚔️ Arena"],
            ["raids", "🗺️ Raids"],
            ["market", "🏛️ Market"],
            ["codex", "📜 Codex"],
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

      {tab === "kingdom" && <KingdomMap onEnter={(id) => setTab(id as Tab)} />}

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

      {tab === "codex" && <CodexView />}

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

      {state.offlineSummary && (
        <OfflineModal summary={state.offlineSummary} onClose={() => actions.clearOffline()} />
      )}

      <LevelUpLayer events={state.levelUps} onDrain={() => actions.clearLevelUps()} />

      <footer className="foot">
        <p>
          UXMaxx · Universal Accounts track · original Idle Legion build · EIP-7702 chain-abstracted
          EOA · settlement on Arbitrum
        </p>
        <button type="button" className="btn ghost" onClick={() => actions.reset()}>
          Reset save
        </button>
      </footer>

      <MuteButton />

      <button
        type="button"
        className="admin-fab"
        title="Admin panel — see everything ( ` )"
        onClick={() => setAdmin(true)}
      >
        🛠
      </button>

      {admin && (
        <Suspense fallback={null}>
          <AdminPanel game={game} wallet={wallet} onClose={() => setAdmin(false)} />
        </Suspense>
      )}
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
  const goldShown = useCountUp(state.gold);
  return (
    <section className="resources">
      <Chip cls="gold" img={KIT.res.gold} v={formatNum(goldShown)} s={`+${stats.goldPerSec.toFixed(1)}/s`} />
      <Chip
        cls={`prov ${stats.fed ? "" : "warn"}`}
        img={KIT.res.provisions}
        v={formatNum(state.provisions)}
        s={`${stats.provisionsPerSec >= 0 ? "+" : ""}${stats.provisionsPerSec.toFixed(2)}/s${stats.fed ? "" : " · STARVING"}`}
      />
      <Chip cls="pop" icon="🛡️" v={`${stats.population}/${maxPopulation(state)}`} s={`${stats.idleCount} idle`} />
      <Chip cls="might" icon="⚔️" v={`${Math.floor(stats.might)}`} s={`${state.totalRaids} raids`} />
      {state.renown > 0 && (
        <Chip cls="renown" icon="🏅" v={`${state.renown}`} s={`+${Math.round(renownBoost(state) * 100)}% output`} />
      )}
      <button className={`chip-stat gift ${state.lunchboxes > 0 ? "hot" : ""}`} onClick={onOpenBox} disabled={state.lunchboxes <= 0}>
        <span className="ci"><img className="ci-img" src={KIT.res.lunchbox} alt="" /></span>
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
      <button
        type="button"
        className={`collect-all ${anyReady ? "ready" : ""}`}
        disabled={!anyReady}
        onClick={(e) => {
          const c = centerOf(e.currentTarget);
          coinArc(c, GOLD_CHIP, 22);
          ring(c.x, c.y, "#9dfab0", 20);
          onCollectAll();
        }}
      >
        Collect all
      </button>
    </section>
  );
}

function Chip({ cls, icon, img, v, s }: { cls: string; icon?: string; img?: string; v: string; s: string }) {
  return (
    <div className={`chip-stat ${cls}`}>
      <span className="ci">{img ? <img className="ci-img" src={img} alt="" /> : icon}</span>
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
        <span className="sky-sun" aria-hidden />
        <span className="sky-bird b1" aria-hidden />
        <span className="sky-bird b2" aria-hidden />
        <span className="cloud c1" aria-hidden>☁️</span>
        <span className="surface-label">⛰ THE SURFACE</span>
        <span className="cloud c2" aria-hidden>☁️</span>
        <span className="sky-hills" aria-hidden />
      </div>
      <SlaveMarket state={state} actions={actions} />
      <div className="vault-body">
        <div className="vault-strata" aria-hidden />
        <div className="vault-dust" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="mote" />
          ))}
        </div>
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
        <DescendPanel state={state} actions={actions} />
      </div>
    </section>
  );
}

// ---------------- prestige: Descend deeper (Fix #2) ----------------

function DescendPanel({ state, actions }: { state: GameState; actions: Actions }) {
  const [confirm, setConfirm] = useState(false);
  const pending = pendingRenown(state);
  const can = canDescend(state);
  const boost = Math.round(renownBoost(state) * 100);
  const nextBoost = Math.round((state.renown + pending) * RENOWN_BOOST_PER * 100);
  return (
    <div className="descend-panel">
      <div className="dp-head">
        <span className="build-label">⬇ DESCEND DEEPER</span>
        <span className="muted small">
          🏅 {state.renown} Renown · +{boost}% output{state.descents > 0 ? ` · descent #${state.descents}` : ""}
        </span>
      </div>
      <p className="muted small">
        {can ? (
          <>Abandon this stronghold and dig deeper to bank <strong>+{pending} Renown</strong> — a permanent{" "}
          <strong>+{nextBoost}%</strong> to every room, forever. Your run resets; Renown and anything bought on-chain stay.</>
        ) : (
          <>Earn 🪙 {formatNum(DESCEND_MIN_GOLD)} total gold this run to descend (now {formatNum(state.totalGoldEarned)}).</>
        )}
      </p>
      {!confirm ? (
        <button type="button" className="btn" disabled={!can} onClick={() => setConfirm(true)}>
          ⬇ Descend · +{pending} 🏅
        </button>
      ) : (
        <div className="dp-confirm">
          <span className="muted small">Reset the whole run for +{pending} Renown?</span>
          <button type="button" className="btn secondary" onClick={() => setConfirm(false)}>Not yet</button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              actions.descend();
              setConfirm(false);
            }}
          >
            Confirm descent
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- shared squad picker (Fix #4) ----------------

function SquadPicker({ state, actions }: { state: GameState; actions: Actions }) {
  const idle = idleDwellers(state);
  const chosen = new Set(state.squad);
  const picked = idle.filter((d) => chosen.has(d.id));
  const sending = picked.length ? picked : idle;
  const power = Math.floor(squadPower(state, sending));
  return (
    <div className="squad-picker">
      <div className="sp-head">
        <span>
          🎖️ Squad — sending <b>{sending.length}</b> · <b>{power} ⚔</b>
          {picked.length === 0 && idle.length > 0 ? <span className="muted small"> (all idle)</span> : null}
        </span>
        <div className="sp-actions">
          <button type="button" className="chip-btn" disabled={idle.length === 0} onClick={() => actions.selectAllIdle()}>
            All idle
          </button>
          <button type="button" className="chip-btn" disabled={state.squad.length === 0} onClick={() => actions.clearSquad()}>
            Clear
          </button>
        </div>
      </div>
      <div className="sp-row">
        {idle.length === 0 && <span className="muted small">No idle dwellers — recall some from rooms or a raid.</span>}
        {idle.map((d) => {
          const on = chosen.has(d.id);
          return (
            <button
              key={d.id}
              type="button"
              className={`sp-fig apt-${d.aptitude} ${on ? "on" : ""}`}
              style={{ ["--rar" as string]: RARITY[d.tier].color }}
              title={`${d.name} · ${TIERS[d.tier].name} · ${Math.floor(dwellerMight(d, state))}⚔`}
              onClick={() => actions.toggleSquad(d.id)}
            >
              <img src={TIER_PORTRAIT[d.tier]} alt={d.name} loading="lazy" />
              <span className="sp-m">{Math.floor(dwellerMight(d, state))}</span>
              {on && <span className="sp-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- offline earnings (Fix #3) ----------------

function OfflineModal({ summary, onClose }: { summary: OfflineSummary; onClose: () => void }) {
  const h = Math.floor(summary.seconds / 3600);
  const m = Math.floor((summary.seconds % 3600) / 60);
  const away = h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal offline-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>⛏️ While you were away</h3>
          <button className="chip-btn" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">The deep kept digging for <strong>{away}</strong>. Your legion brought in:</p>
        <div className="offline-rows">
          <div className="offline-row"><span>🪙 Sestertii</span><b>+{formatNum(summary.gold)}</b></div>
          <div className="offline-row">
            <span>🌾 Provisions</span>
            <b className={summary.provisions < 0 ? "warn" : ""}>
              {summary.provisions >= 0 ? "+" : "−"}{formatNum(Math.abs(summary.provisions))}
            </b>
          </div>
          {summary.recruits > 0 && (
            <div className="offline-row"><span>🪖 Recruits raised</span><b>+{summary.recruits}</b></div>
          )}
        </div>
        <button type="button" className="btn" onClick={onClose}>Back to the deep</button>
      </div>
    </div>
  );
}

// ---------------- level-up celebration ----------------

// Drains the engine's level-up queue: fires particles/sound for each fresh
// event (staggered), stacks toasts, then clears the queue after a quiet beat.
function LevelUpLayer({ events, onDrain }: { events: LevelUpEvent[]; onDrain: () => void }) {
  const shown = useRef<Set<string>>(new Set());

  // Play juice for events we haven't celebrated yet.
  useEffect(() => {
    const fresh = events.filter((e) => !shown.current.has(e.id));
    if (fresh.length === 0) return;
    const cx = window.innerWidth / 2;
    const cy = Math.min(180, window.innerHeight * 0.22);
    fresh.forEach((e, i) => {
      shown.current.add(e.id);
      window.setTimeout(() => {
        if (e.milestone) {
          shake(9);
          ring(cx, cy, "#ffc233", 26);
          burst(cx, cy, { color: "#ffe08a", count: 34, kind: "shard", power: 8 });
          burst(cx, cy, { color: "#9dfab0", count: 18, kind: "spark", power: 6 });
          floatText(cx, cy - 12, `★ ${e.name} — Lv ${e.to}!`, { color: "#ffd76b", crit: true });
          sfx.legendary();
        } else {
          ring(cx, cy, "#5fe38a", 16);
          burst(cx, cy, { color: "#9dfab0", count: 14, kind: "spark", power: 5 });
          floatText(cx, cy - 8, `${e.name} — Lv ${e.to}`, { color: "#9dfab0", big: true });
          sfx.levelup();
        }
      }, i * 240);
    });
  }, [events]);

  // Clear the queue (and the shown-set) after the last event has had its moment.
  useEffect(() => {
    if (events.length === 0) {
      shown.current.clear();
      return;
    }
    const t = window.setTimeout(onDrain, events.length * 240 + 2400);
    return () => window.clearTimeout(t);
  }, [events, onDrain]);

  if (events.length === 0) return null;
  return (
    <div className="levelup-toasts" aria-live="polite">
      {events.slice(-4).map((e) => (
        <div key={e.id} className={`lv-toast ${e.milestone ? "milestone" : ""}`}>
          <img src={TIER_PORTRAIT[e.tier]} alt="" />
          <div className="lv-body">
            <b>{e.milestone ? "★ " : ""}{e.name} <span className="muted">leveled up!</span></b>
            <span>
              Lv {e.from} → <b>{e.to}</b>
              {e.reward > 0 ? ` · milestone +${e.reward} 🎁` : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlaveMarket({ state, actions }: { state: GameState; actions: Actions }) {
  const rerollCost = marketRerollCost(state);
  const full = state.dwellers.length >= maxPopulation(state);
  return (
    <div className="market">
      <div className="market-head">
        <span className="market-title">⛓️ SLAVE MARKET — fresh meat off the Wastes, buy at the gate</span>
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
  const master =
    room.type === "quarters" ? state.dwellers.find((d) => d.roomId === room.id) : null;

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
      {room.type === "quarters" ? (
        <div className="ch-model">
          <ModelBoss src={KEKIUS_MODEL} />
        </div>
      ) : (
        <img className="ch-art" src={ROOM_ART[room.type]} alt="" aria-hidden loading="lazy" />
      )}
      <div className="ch-glow" aria-hidden />

      <div className="ch-plaque">
        <span className="ch-icon">{def.icon}</span>
        <span className="ch-name">{def.name}</span>
        <span className="ch-lvl">Lv {room.level}</span>
        {def.aptitude && <span className="ch-apt">{APTITUDE_ICON[def.aptitude]}</span>}
      </div>

      {room.type === "quarters" ? (
        <div className="ch-master">
          {master && (
            <button type="button" className="master-plate" onClick={() => onHero(master.id)}>
              <span className="master-crown">👑</span>
              <span className="master-name">{master.name}</span>
              <span className="master-might">{Math.floor(dwellerMight(master, state))} ⚔</span>
              <span className="master-cta">tap to equip</span>
            </button>
          )}
        </div>
      ) : (
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
      )}

      {ready && resImg && (
        <button
          type="button"
          className="bubble"
          onClick={(e) => {
            const c = centerOf(e.currentTarget);
            const res = def.produces;
            if (res === "gold") {
              const coins = Math.min(24, 6 + Math.round(Math.log10(stored + 1) * 6));
              coinArc(c, GOLD_CHIP, coins);
              ring(c.x, c.y, "#ffd76b", 16);
              floatText(c.x, c.y - 8, `+${formatNum(stored)}`, { color: "#ffe08a", big: stored > 100 });
            } else {
              const color = res === "provisions" ? "#5fe38a" : "#ff8a7a";
              burst(c.x, c.y, { color, count: 12, kind: "spark", power: 4 });
              floatText(c.x, c.y - 8, `+${formatNum(stored)}`, { color });
              sfx.collect();
            }
            actions.collect(room.id);
          }}
        >
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
                <XpBar d={d} />
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
  const { state, now, fightBoss, actions } = game;
  const [flash, setFlash] = useState<string | null>(null);
  // Combat → animation triggers for the live 3D boss (see BossStage).
  const [hitToken, setHitToken] = useState(0);
  const [killToken, setKillToken] = useState(0);
  const boss = currentBoss(state);
  const squad = arenaSquad(state);
  const power = Math.floor(arenaSquadPower(state));
  const hpFrac = Math.max(0, state.arena.bossHp) / bossMaxHp(state);
  const cd = Math.max(0, 6000 - (now - state.arena.lastFightAt));
  const onFight = () => {
    const res = fightBoss();
    if (!res) {
      sfx.error();
      return;
    }
    const c = centerOf(document.querySelector(".boss-stage"));
    if (res.killed) {
      setFlash(`💥 ${res.bossName} DEFEATED! +${formatNum(res.reward)}g +🎁`);
      setKillToken((k) => k + 1);
      shake(16);
      ring(c.x, c.y, "#ff3b2f", 30);
      burst(c.x, c.y, { color: "#ff7a3d", count: 40, kind: "shard", power: 9 });
      burst(c.x, c.y, { color: "#ffe08a", count: 24, kind: "spark", power: 7 });
      floatText(c.x, c.y - 20, "DEFEATED!", { color: "#ffd76b", crit: true });
      sfx.boom();
      sfx.legendary();
    } else {
      const crit = res.damage >= power; // a strong roll
      setFlash(`Hit for ${formatNum(res.damage)}!`);
      setHitToken((h) => h + 1);
      shake(crit ? 9 : 4);
      burst(c.x, c.y - 10, { color: crit ? "#ffd76b" : "#ff8a7a", count: crit ? 18 : 10, kind: "spark", power: crit ? 6 : 4 });
      floatText(c.x + (Math.random() * 80 - 40), c.y - 10, `-${formatNum(res.damage)}`, { color: crit ? "#ffd76b" : "#ff9a8a", crit });
      crit ? sfx.crit() : sfx.hit();
    }
  };
  return (
    <section className="panel arena">
      <div className="panel-head">
        <h2>⚔️ The Arena · World Boss · under the ruined Colosseum</h2>
        <div className="rank-chip">🏆 Rank #{state.arena.rank} · {state.arena.wins} wins</div>
      </div>

      <div
        className={`boss-stage${boss.model ? " boss-stage--3d" : ""}`}
        style={boss.model ? undefined : { backgroundImage: `url(${boss.img})` }}
      >
        {boss.model && (
          <Suspense fallback={<div className="boss-3d-spinner" aria-label="Summoning the boss…" />}>
            <BossStage modelUrl={boss.model} poster={boss.img} hitToken={hitToken} killToken={killToken} />
          </Suspense>
        )}
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

      <SquadPicker state={state} actions={actions} />

      <div className="arena-controls">
        <div className="squad-info">
          <div className="squad-power">Squad power <b>{power} ⚔</b></div>
          <span className="muted small">Forge arsenal counts toward every fight.</span>
        </div>
        <button type="button" className="btn big" disabled={cd > 0 || squad.length === 0} onClick={onFight}>
          {cd > 0 ? `Regrouping ${Math.ceil(cd / 1000)}s` : "⚔ FIGHT"}
        </button>
      </div>
      <p className="muted small">
        Pick a squad from your idle heroes (or send all). Beat the boss for gold + a 🎁 lunchbox and climb the ladder. Equip gear in the Legion tab to hit harder.
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
        <h2>🗺️ Raids · the Wastes topside</h2>
        <p className="muted small">
          Squad might: <strong>{Math.floor(squadMight)} ⚔</strong> (Forge arsenal included) · every raid drops a 🎁 lunchbox
        </p>
      </div>
      {!hasWarRoom && <p className="muted small warn">Dig a 🗺️ War Room in the Stronghold to launch raids.</p>}

      {!raid && <SquadPicker state={state} actions={actions} />}

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

        <div className="hm-xp">
          <div className="hm-xp-head">
            <span>Lv {d.level} → {d.level + 1}{(d.level + 1) % MILESTONE_EVERY === 0 ? " · ★ milestone 🎁" : ""}</span>
            <span className="muted small">{Math.floor(d.xp)} / {xpForLevel(d.level)} XP</span>
          </div>
          <XpBar d={d} />
          <div className="hm-xp-preview muted small">
            Each level: <b>+{Math.round(OUTPUT_PER_LEVEL * 100)}%</b> output · <b>+{Math.round(MIGHT_PER_LEVEL * 100)}%</b> might
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

  // rarity of this pull drives how hyped the burst + fanfare is
  const legendary =
    (pull.kind === "gear" && pull.rarity === "legendary") ||
    (pull.kind === "hero" && (pull.dweller.tier === "champion" || pull.dweller.tier === "cavalry"));
  useEffect(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    if (legendary) {
      shake(10);
      ring(cx, cy, color, 26);
      burst(cx, cy, { color, count: 46, kind: "shard", power: 9 });
      burst(cx, cy, { color: "#fff0b0", count: 26, kind: "spark", power: 6 });
      sfx.legendary();
    } else {
      ring(cx, cy, color, 18);
      burst(cx, cy, { color, count: 20, kind: "spark", power: 5 });
      sfx.reveal();
    }
  }, [color, legendary]);

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
          <h2>🏛️ Marketplace · the Bazaar</h2>
          <p className="muted">
            Trade gladiators &amp; gear. The bridges died in the Rug — but the <strong>Universal Account</strong> reaches
            any Chain and settles <strong>cross-chain as USDT on Arbitrum</strong>, the last honest Chain (Particle{" "}
            <code>EIP-7702</code>). Pay from any chain, no bridge, no chain switch. The whole economy of the deep runs
            on-chain.
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

// ---------------- Codex (read-only gallery of the whole classified art set) ----------------

const CODEX_ORDER: AssetType[] = [
  "hero", "boss", "weapon", "armor", "accessory", "mount",
  "room", "raid", "crate", "banner", "icon", "other",
];

function CodexView() {
  const total = ASSET_CATALOG.length;
  return (
    <section className="market codex">
      <div className="market-head">
        <span className="market-title">📜 Codex of the Deep · {total} classified relics</span>
        <span className="muted small">Every asset, typed &amp; priced. Gold = market value · ＄ = on-chain (USDT)</span>
      </div>

      {CODEX_ORDER.map((type) => {
        const items = assetsByType(type);
        if (!items.length) return null;
        return (
          <div key={type} className="codex-group">
            <h3 className="mk-h">{ASSET_TYPE_LABEL[type]} <span className="muted small">· {items.length}</span></h3>
            <div className="codex-grid">
              {items.map((a) => (
                <article
                  key={a.file}
                  className="codex-card"
                  style={{ ["--rar" as string]: RARITY_META[a.rarity].color }}
                  title={a.desc}
                >
                  <img className="codex-img" src={a.img} alt={a.name} loading="lazy" />
                  <div className="codex-body">
                    <div className="codex-name">{a.name}</div>
                    <div className="codex-rar" style={{ color: RARITY_META[a.rarity].color }}>
                      {stars(RARITY_META[a.rarity].stars)} {RARITY_META[a.rarity].name}
                    </div>
                    <div className="codex-price">
                      {a.buyGold > 0 && <span className="cx-gold">🪙 {formatNum(a.buyGold)}</span>}
                      {a.priceUsd > 0 && <span className="cx-usd">＄{a.priceUsd.toFixed(2)}</span>}
                      {a.buyGold === 0 && a.priceUsd === 0 && <span className="muted small">not for sale</span>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
