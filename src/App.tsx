import { createElement, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import "@google/model-viewer";

// Heavy Three.js Arena boss viewer — code-split so three.js stays out of the
// initial bundle and only loads when a player opens the Arena on a 3D boss.
const BossStage = lazy(() => import("./components/BossStage"));
// The 3D Underground Kingdom (flagship scene) — code-split like the boss viewer.
const GameWorld = lazy(() => import("./components/GameWorld"));
// Dev/admin "see everything" overlay — code-split so it never ships in the main view.
const AdminPanel = lazy(() => import("./components/AdminPanel"));
import KingdomMap from "./components/KingdomMap";
import { INTERIOR } from "./game/interiors";
import { RoomFrog } from "./components/RoomScene";
import {
  APTITUDE_ICON,
  APTITUDE_LABEL,
  BUILDABLE,
  CLASS_ICON,
  CLASS_LABEL,
  CRATE_IMG,
  DESCEND_MIN_GOLD,
  GEAR_MAX_LEVEL,
  IMG,
  KEKIUS_MODEL,
  KIT,
  LAND_KIND_META,
  LAND_MIN_MIGHT,
  LAND_SLOTS,
  LAND_YIELD,
  MERCENARY_TIERS,
  MIGHT_PER_LEVEL,
  MILESTONE_EVERY,
  ONCHAIN_LISTINGS,
  OUTPUT_PER_LEVEL,
  PVP_DAILY_ATTACKS,
  RAIDS,
  RAID_ART,
  RARITY_META,
  RENOWN_BOOST_PER,
  ROOMS,
  ROOM_ART,
  TIERS,
  TIER_PORTRAIT,
  WB_HIT_COOLDOWN_MS,
  xpForLevel,
} from "./game/config";
import {
  ASSET_CATALOG,
  ASSET_TYPE_LABEL,
  assetsByType,
  type AssetType,
} from "./game/assets";
import {
  arenaClassEdge,
  arenaSquad,
  arenaSquadPower,
  bankPending,
  bankWithdrawFee,
  buildCost,
  canDescend,
  canSummonWith,
  classMultiplierVs,
  currentBoss,
  dailyAvailable,
  dailyReward,
  dexPrice,
  dwellerById,
  dwellerClass,
  dwellerMaxHp,
  dwellerMight,
  equippedGearDefs,
  formatNum,
  fusionCandidates,
  gearAtMaxLevel,
  gearDefOf,
  gearItemStats,
  gearLevel,
  gearSellValue,
  gearUpgradeCost,
  healSalveCost,
  heroSellValue,
  hpFrac,
  idleDwellers,
  inventoryGear,
  isOnRaid,
  landClaimCost,
  landSlotsLeft,
  landUpgradeCost,
  landYields,
  marketRerollCost,
  objectiveLabel,
  objectiveProgress,
  pendingRenown,
  pvpOpponents,
  pvpRankName,
  quoteGoldToLegion,
  quoteLegionToGold,
  raidSquadMight,
  recruitCost,
  renownBoost,
  roomCapacity,
  roomRate,
  roomStoreCap,
  maxPopulation,
  squadClassEdge,
  squadPower,
  staminaFrac,
  summonCost,
  summonsUsed,
  upgradeCost,
  warChestStoreCap,
  worldBossLeaderboard,
  worldBossName,
  worldBossRank,
  xpProgress,
  type Pull,
} from "./game/engine";
import { useGame } from "./hooks/useGame";
import { useWallet } from "./hooks/useWallet";
import type { CombatClass, Dweller, GameState, GearItem, GearSlot, LandKind, LevelUpEvent, OfflineSummary, OnchainListing, RaidReport, Room, Tier } from "./game/types";
import {
  claimMirror,
  completeMission,
  getCachedMirror,
  operatorFeed,
  rememberMirror,
  type CompleteResult,
  type MirrorStatus,
  type OperatorMission,
} from "./lib/insforge";
import {
  DAY69_JACKPOT,
  JACKPOT_STREAK_DAY,
  MIRROR_SOLDOUT_CONSOLATION,
  MIRROR_STREAK_DAY,
  SCRYING_MIRROR_SUPPLY,
} from "./game/streak";
import { operatorId } from "./lib/insforge";
import {
  ARENA_ONLINE,
  fetchWorldBoss,
  strikeWorldBoss,
  syncLadder,
  type LadderOpponent,
  type WbState,
} from "./lib/arena";
import "./App.css";
import { burst, centerOf, coinArc, floatText, ring, sfx, shake } from "./fx/juice";
import { useCountUp, useTabTitleEarnings, useUiSounds } from "./fx/react";
import { MuteButton } from "./fx/MuteButton";
import { flush, identify, initTelemetry, markLogin, setScreen } from "./lib/telemetry";

const GOLD_CHIP = ".chip-stat.gold";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type Tab = "kingdom" | "stronghold" | "legion" | "arena" | "raids" | "worldboss" | "duels" | "exchange" | "realm" | "market" | "codex" | "operator";
type Game = ReturnType<typeof useGame>;
type Actions = Game["actions"];
type Stats = Game["stats"];
type Wallet = ReturnType<typeof useWallet>;

const RESOURCE_IMG: Record<string, string> = {
  gold: IMG.gold,
  provisions: IMG.provisions,
  salves: KIT.res.crystal,
};
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

// A thin red health bar. `downed` heroes read as a dark, empty bar.
function HpBar({ d }: { d: Dweller }) {
  const frac = hpFrac(d);
  const max = dwellerMaxHp(d);
  return (
    <div className={`vital hp ${d.downed ? "downed" : frac < 0.34 ? "low" : ""}`} title={`${Math.ceil(d.hp)} / ${max} HP`}>
      <i style={{ width: `${frac * 100}%` }} />
    </div>
  );
}

// The rock-paper-scissors class chip (melee ▶ ranged ▶ charge).
function ClassBadge({ cls, small }: { cls: CombatClass; small?: boolean }) {
  return (
    <span className={`class-badge cls-${cls} ${small ? "sm" : ""}`} title={`${CLASS_LABEL[cls]} class`}>
      {CLASS_ICON[cls]}{small ? "" : ` ${CLASS_LABEL[cls]}`}
    </span>
  );
}

/** A ▲/▼/= verdict on a squad's class multiplier vs. an enemy class. */
function classEdgeVerdict(edge: number): { txt: string; cls: string } {
  if (edge >= 1.12) return { txt: `▲ ${Math.round((edge - 1) * 100)}% class edge`, cls: "adv" };
  if (edge <= 0.9) return { txt: `▼ ${Math.round((1 - edge) * 100)}% class penalty`, cls: "dis" };
  return { txt: "= even matchup", cls: "even" };
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
  const hurt = d.downed || d.hp < dwellerMaxHp(d);
  return (
    <button
      type="button"
      className={`fig apt-${d.aptitude} ${d.downed ? "is-downed" : ""}`}
      draggable={!d.downed}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
      style={{ animationDelay: `${delay}s` }}
      title={`${d.name} · ${TIERS[d.tier].name} · Lv${d.level}${d.downed ? " · DOWNED — heal me" : ""}`}
      onClick={onClick}
    >
      <img className="fig-img" src={TIER_PORTRAIT[d.tier]} alt={TIERS[d.tier].name} loading="lazy" />
      <span className="fig-lvl">{d.level}</span>
      {geared && <span className="fig-gear">⚔</span>}
      {d.downed && <span className="fig-down" aria-hidden>✚</span>}
      {hurt && <span className="fig-vitals" aria-hidden><HpBar d={d} /></span>}
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
  const { state, stats, error: gameError, now, actions, syncIdentity } = game;
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("kingdom");
  const [assignRoomId, setAssignRoomId] = useState<string | null>(null);
  const [heroId, setHeroId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Pull | null>(null);
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  // Scrying Mirror / Operator state (ownership lives in localStorage via the lib,
  // decoupled from the game save so it survives descents/resets like an account relic).
  const [mirror, setMirror] = useState<MirrorStatus>(() => getCachedMirror());
  const [mirrorReveal, setMirrorReveal] = useState<
    { status: string; serial?: number | null; remaining?: number; total?: number } | null
  >(null);
  const [mirrorBusy, setMirrorBusy] = useState(false);
  const [jackpot, setJackpot] = useState(false);

  useUiSounds();
  useTabTitleEarnings(stats.goldPerSec, stats.fed);

  // Boot telemetry once — global click tracking + batched flush to InsForge.
  useEffect(() => {
    initTelemetry();
    return () => void flush(true);
  }, []);

  // Report per-screen dwell time as the player switches tabs.
  useEffect(() => {
    setScreen(tab);
  }, [tab]);

  // Report identity + fire a one-time login event when the wallet connects.
  // Also repoint cloud saves at the player's identity so progress roams across
  // devices once signed in (and falls back to the device key when signed out).
  useEffect(() => {
    if (wallet.session) {
      markLogin(wallet.session.email ?? null, wallet.session.address);
      syncIdentity({ email: wallet.session.email ?? null, walletAddress: wallet.session.address });
    } else {
      identify({ email: null, walletAddress: null });
      syncIdentity({ email: null, walletAddress: null });
    }
  }, [wallet.session, syncIdentity]);

  // Attempt the day-8 Scrying Mirror claim. Network-resilient: any failure leaves
  // the streak intact and the retry prompt visible, so a flaky connection or a
  // backend blip never costs the player their relic.
  // Verified identity for anti-sybil binding: the connected wallet/Magic address.
  const walletIdentity = wallet.session?.address?.toLowerCase();

  const attemptMirror = useCallback(async () => {
    if (mirrorBusy || mirror.serial != null || mirror.soldOut) return;
    // The scarce relic requires a verified account (launch-grade anti-sybil).
    if (!walletIdentity) {
      setMirrorReveal({ status: "needs_identity" });
      return;
    }
    setMirrorBusy(true);
    try {
      const res = await claimMirror(walletIdentity);
      setMirror(getCachedMirror());
      if (res.status === "claimed") {
        setMirrorReveal({ status: "claimed", serial: res.serial, remaining: res.remaining, total: res.total });
      } else if (res.status === "sold_out") {
        actions.grantBundle(MIRROR_SOLDOUT_CONSOLATION);
        setMirrorReveal({ status: "sold_out" });
      } else if (res.status === "rate_limited") {
        setMirrorReveal({ status: "rate_limited" });
      } else if (res.status === "needs_identity") {
        setMirrorReveal({ status: "needs_identity" });
      }
      // "already" → we hold it; UI already reflects it, no modal.
    } catch {
      setMirrorReveal({ status: "error" });
    } finally {
      setMirrorBusy(false);
    }
  }, [mirrorBusy, mirror.serial, mirror.soldOut, actions, walletIdentity]);

  // Cross-device ownership sync: when an account connects, ask the mirror whether
  // this identity already holds one (claimed on another device) — no minting.
  useEffect(() => {
    if (!walletIdentity || mirror.serial != null) return;
    let cancelled = false;
    operatorFeed(walletIdentity)
      .then((res) => {
        if (!cancelled && res.operator && res.serial != null) {
          rememberMirror(res.serial);
          setMirror({ serial: res.serial, soldOut: false });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [walletIdentity, mirror.serial]);

  // Claim the daily tribute, then layer on the streak milestones: the day-8
  // Scrying Mirror (async, capped supply) and the day-69 jackpot.
  const handleClaimDaily = useCallback(() => {
    const day = dailyReward(state, now).streak;
    actions.claimDaily();
    if (day === JACKPOT_STREAK_DAY) {
      actions.grantBundle(DAY69_JACKPOT);
      setJackpot(true);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight * 0.4;
      shake(18);
      ring(cx, cy, "#ffc233", 34);
      burst(cx, cy, { color: "#ffe08a", count: 60, kind: "shard", power: 11 });
      sfx.legendary();
    }
    if (day >= MIRROR_STREAK_DAY && mirror.serial == null && !mirror.soldOut) {
      void attemptMirror();
    }
  }, [state, now, actions, mirror.serial, mirror.soldOut, attemptMirror]);

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

      <ResourceBar state={state} stats={stats} wallet={wallet} onCollectAll={actions.collectAll} onOpenBox={openBox} onHealAll={actions.healAll} />

      <DailyBanner state={state} now={now} onClaim={handleClaimDaily} />

      {state.daily.streak >= MIRROR_STREAK_DAY && mirror.serial == null && !mirror.soldOut && (
        <div className="banner mirror-prompt" role="status">
          <span className="daily-icon">🔮</span>
          <strong>The Scrying Mirror awaits</strong>
          <span className="muted small">
            Day {state.daily.streak} reached — a limited relic ({SCRYING_MIRROR_SUPPLY} ever made). Claim yours.
          </span>
          <button type="button" className="btn" disabled={mirrorBusy} onClick={() => void attemptMirror()}>
            {mirrorBusy ? "Scrying…" : "Claim Mirror"}
          </button>
        </div>
      )}

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
            ["worldboss", "🐉 World Boss"],
            ["duels", "🏟️ Duels"],
            ["exchange", "💱 Exchange"],
            ["realm", "🗺️ Realm"],
            ["market", "🏛️ Market"],
            ["codex", "📜 Codex"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
            {id === "market" && state.mercenaryBoost > 0 && <i className="dot" />}
            {id === "legion" && state.lunchboxes > 0 && <i className="dot gift" />}
            {id === "duels" && state.pvp.attacksLeft > 0 && <i className="dot gift" />}
            {id === "worldboss" && state.worldBoss.lastReward && <i className="dot" />}
          </button>
        ))}
        {mirror.serial != null && (
          <button className={`op-tab ${tab === "operator" ? "active" : ""}`} onClick={() => setTab("operator")}>
            🔮 Operator
          </button>
        )}
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

      {tab === "kingdom" && (
        <Suspense fallback={<KingdomMap onEnter={(id) => setTab(id as Tab)} />}>
          <GameWorld
            onEnter={(id) => setTab(id as Tab)}
            dwellers={state.dwellers.length}
            fallback={<KingdomMap onEnter={(id) => setTab(id as Tab)} />}
          />
        </Suspense>
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

      {tab === "worldboss" && <WorldBossView game={game} />}

      {tab === "duels" && <DuelsView state={state} actions={actions} />}

      {tab === "exchange" && <ExchangeView state={state} now={now} actions={actions} />}

      {tab === "realm" && <RealmView state={state} stats={stats} actions={actions} />}

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

      {tab === "operator" && mirror.serial != null && (
        <OperatorView serial={mirror.serial} actions={actions} identity={walletIdentity} />
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

      {state.offlineSummary && (
        <OfflineModal summary={state.offlineSummary} onClose={() => actions.clearOffline()} />
      )}

      {state.raidReport && (
        <RaidReportModal report={state.raidReport} onClose={() => actions.clearRaidReport()} />
      )}

      <LevelUpLayer events={state.levelUps} onDrain={() => actions.clearLevelUps()} />

      {mirrorReveal && (
        <MirrorModal
          reveal={mirrorReveal}
          onClose={() => setMirrorReveal(null)}
          onOperator={() => {
            setMirrorReveal(null);
            setTab("operator");
          }}
          onConnect={() => {
            setMirrorReveal(null);
            setTab("market");
          }}
        />
      )}

      {jackpot && <JackpotModal onClose={() => setJackpot(false)} />}

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
  onHealAll,
}: {
  state: GameState;
  stats: Stats;
  wallet: Wallet;
  onCollectAll: () => void;
  onOpenBox: () => void;
  onHealAll: () => void;
}) {
  const anyReady =
    state.rooms.some((r) => roomStoreCap(r) > 0 && r.stored >= 1) || state.warChest.stored >= 1;
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
      <Chip
        cls={`salves ${stats.woundedCount > 0 && state.salves <= 0 ? "warn" : ""}`}
        img={KIT.res.crystal}
        v={formatNum(state.salves)}
        s={`⛑ ${stats.salvesPerSec >= 0 ? "+" : ""}${stats.salvesPerSec.toFixed(2)}/s`}
      />
      <Chip
        cls="legion-tok"
        icon="💠"
        v={formatNum(state.legion)}
        s={`$LEGION ${stats.legionPerSec > 0 ? `+${stats.legionPerSec.toFixed(2)}/s` : ""}`.trim()}
      />
      <Chip cls="pop" icon="🛡️" v={`${stats.population}/${maxPopulation(state)}`} s={`${stats.idleCount} idle`} />
      <Chip cls="might" icon="⚔️" v={`${Math.floor(stats.might)}`} s={`${state.totalRaids} raids`} />
      {stats.woundedCount > 0 && (
        <button className="chip-stat wounded hot" onClick={onHealAll} title="Heal all wounded with salves">
          <span className="ci">⛑️</span>
          <span className="cv">
            <b>{stats.woundedCount}</b>
            <small>heal all</small>
          </span>
        </button>
      )}
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

function SquadPicker({ state, actions, enemyClass }: { state: GameState; actions: Actions; enemyClass?: CombatClass }) {
  const idle = idleDwellers(state);
  const chosen = new Set(state.squad);
  const picked = idle.filter((d) => chosen.has(d.id));
  const sending = picked.length ? picked : idle;
  const power = Math.floor(squadPower(state, sending));
  const edge = enemyClass ? squadClassEdge(state, sending, enemyClass) : null;
  const verdict = edge != null ? classEdgeVerdict(edge) : null;
  return (
    <div className="squad-picker">
      <div className="sp-head">
        <span>
          🎖️ Squad — sending <b>{sending.length}</b> · <b>{power} ⚔</b>
          {picked.length === 0 && idle.length > 0 ? <span className="muted small"> (all idle)</span> : null}
          {enemyClass && (
            <span className="sp-enemy">
              {" "}vs {CLASS_ICON[enemyClass]} {CLASS_LABEL[enemyClass]}
              {verdict && <b className={`edge-tag ${verdict.cls}`}> {verdict.txt}</b>}
            </span>
          )}
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
        {idle.length === 0 && <span className="muted small">No rested dwellers — recall some from rooms, heal the downed, or let them rest.</span>}
        {idle.map((d) => {
          const on = chosen.has(d.id);
          const cls = dwellerClass(d);
          const counters = enemyClass ? classMultiplierVs(cls, enemyClass) : 1;
          return (
            <button
              key={d.id}
              type="button"
              className={`sp-fig apt-${d.aptitude} ${on ? "on" : ""} ${counters > 1 ? "counters" : counters < 1 ? "countered" : ""}`}
              style={{ ["--rar" as string]: RARITY[d.tier].color }}
              title={`${d.name} · ${TIERS[d.tier].name} · ${CLASS_LABEL[cls]} · ${Math.floor(dwellerMight(d, state))}⚔ · ${Math.round(d.stamina)} stamina`}
              onClick={() => actions.toggleSquad(d.id)}
            >
              <img src={TIER_PORTRAIT[d.tier]} alt={d.name} loading="lazy" />
              <span className="sp-cls">{CLASS_ICON[cls]}</span>
              <span className="sp-m">{Math.floor(dwellerMight(d, state))}</span>
              <span className="sp-sta"><i style={{ width: `${staminaFrac(d) * 100}%` }} /></span>
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
          {summary.salves > 0 && (
            <div className="offline-row"><span>⛑️ Salves stocked</span><b>+{formatNum(summary.salves)}</b></div>
          )}
          {summary.recruits > 0 && (
            <div className="offline-row"><span>🪖 Recruits raised</span><b>+{summary.recruits}</b></div>
          )}
        </div>
        <button type="button" className="btn" onClick={onClose}>Back to the deep</button>
      </div>
    </div>
  );
}

// ---------------- daily-login reward ----------------

function DailyBanner({ state, now, onClaim }: { state: GameState; now: number; onClaim: () => void }) {
  if (!dailyAvailable(state, now)) return null;
  const r = dailyReward(state, now);
  return (
    <div className="banner daily" role="status">
      <span className="daily-icon">🎁</span>
      <strong>Daily tribute ready</strong>
      <span className="muted small">
        Day {r.streak} streak · 🪙 {formatNum(r.gold)}{r.lunchboxes > 0 ? " + 🎁 lunchbox" : ""}
      </span>
      <button type="button" className="btn" onClick={onClaim}>Claim</button>
    </div>
  );
}

// ---------------- Scrying Mirror reveal + day-69 jackpot ----------------

function MirrorModal({
  reveal,
  onClose,
  onOperator,
  onConnect,
}: {
  reveal: { status: string; serial?: number | null; remaining?: number; total?: number };
  onClose: () => void;
  onOperator: () => void;
  onConnect: () => void;
}) {
  useEffect(() => {
    if (reveal.status !== "claimed") return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.4;
    shake(12);
    ring(cx, cy, "#b072ff", 30);
    burst(cx, cy, { color: "#c9a3ff", count: 44, kind: "shard", power: 9 });
    burst(cx, cy, { color: "#fff0b0", count: 20, kind: "spark", power: 6 });
    sfx.legendary();
  }, [reveal.status]);

  let body: React.ReactNode;
  if (reveal.status === "claimed") {
    body = (
      <>
        <div className="mirror-orb" aria-hidden>🔮</div>
        <div className="reveal-title" style={{ color: "#c9a3ff" }}>Scrying Mirror #{reveal.serial}</div>
        <div className="reveal-sub">
          {reveal.remaining != null && reveal.total != null
            ? `${reveal.remaining} of ${reveal.total} mirrors remain.`
            : "A limited relic of the deep."}
          <br />You are now an <strong>Operator</strong> — the mirror will show you secret missions.
        </div>
        <div className="reveal-actions">
          <button className="btn secondary" onClick={onClose}>Later</button>
          <button className="btn" onClick={onOperator}>Open Operator board ▸</button>
        </div>
      </>
    );
  } else if (reveal.status === "sold_out") {
    body = (
      <>
        <div className="mirror-orb dim" aria-hidden>🔮</div>
        <div className="reveal-title">The last mirror is claimed, ser.</div>
        <div className="reveal-sub">
          All {SCRYING_MIRROR_SUPPLY} Scrying Mirrors are gone. A consolation is paid — keep your
          streak alive to <strong>day {JACKPOT_STREAK_DAY}</strong> for the real send.
        </div>
        <div className="reveal-actions"><button className="btn" onClick={onClose}>Onward</button></div>
      </>
    );
  } else if (reveal.status === "rate_limited") {
    body = (
      <>
        <div className="mirror-orb dim" aria-hidden>🔮</div>
        <div className="reveal-title">Too many claims from your network</div>
        <div className="reveal-sub">The deep guards against greed. Try again tomorrow — your streak is safe.</div>
        <div className="reveal-actions"><button className="btn" onClick={onClose}>Understood</button></div>
      </>
    );
  } else if (reveal.status === "needs_identity") {
    body = (
      <>
        <div className="mirror-orb" aria-hidden>🔮</div>
        <div className="reveal-title" style={{ color: "#c9a3ff" }}>Bind the mirror to your name</div>
        <div className="reveal-sub">
          Only {SCRYING_MIRROR_SUPPLY} mirrors exist — one per account. Connect your wallet or Magic
          email to claim yours. Your streak is safe until you do.
        </div>
        <div className="reveal-actions">
          <button className="btn secondary" onClick={onClose}>Later</button>
          <button className="btn" onClick={onConnect}>Connect to claim ▸</button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="mirror-orb dim" aria-hidden>🔮</div>
        <div className="reveal-title">The deep is unreachable</div>
        <div className="reveal-sub">Couldn't reach the mirror. Your streak is safe — try claiming again in a moment.</div>
        <div className="reveal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal reveal mirror-modal" onClick={(e) => e.stopPropagation()} style={{ ["--rar" as string]: "#b072ff" }}>
        {body}
      </div>
    </div>
  );
}

function JackpotModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.4;
    shake(16);
    ring(cx, cy, "#ffc233", 36);
    burst(cx, cy, { color: "#ffe08a", count: 56, kind: "shard", power: 10 });
    burst(cx, cy, { color: "#fff0b0", count: 30, kind: "spark", power: 7 });
    sfx.legendary();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal reveal jackpot-modal" onClick={(e) => e.stopPropagation()} style={{ ["--rar" as string]: "#ffc233" }}>
        <div className="reveal-title" style={{ color: "#ffc233" }}>DAY {JACKPOT_STREAK_DAY} — THE SEND</div>
        <div className="reveal-sub">Sixty-nine days, never sold. Diamond hands only. The deep pays out:</div>
        <div className="offline-rows">
          <div className="offline-row"><span>🪙 Sestertii</span><b>+{formatNum(DAY69_JACKPOT.gold)}</b></div>
          <div className="offline-row"><span>🎁 Lunchboxes</span><b>+{DAY69_JACKPOT.lunchboxes}</b></div>
          <div className="offline-row"><span>👑 Champion gladiator</span><b>+{DAY69_JACKPOT.champions}</b></div>
          <div className="offline-row"><span>⚔️ Grail gear</span><b>×{DAY69_JACKPOT.gear.length}</b></div>
        </div>
        <div className="reveal-actions"><button className="btn" onClick={onClose}>WAGMI</button></div>
      </div>
    </div>
  );
}

// ---------------- Operator board (Scrying Mirror holders only) ----------------

function OperatorView({ serial, actions, identity }: { serial: number; actions: Actions; identity?: string }) {
  const [feed, setFeed] = useState<OperatorMission[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await operatorFeed(identity);
      setFeed(res.missions ?? []);
    } catch {
      setLoadErr("The mirror is clouded — couldn't reach the deep.");
    }
  }, [identity]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doComplete = async (m: OperatorMission) => {
    if (busy) return;
    setBusy(m.code);
    setFlash(null);
    try {
      const res: CompleteResult = await completeMission(m.code, answers[m.code] ?? "", identity);
      if (res.status === "complete" && res.reward) {
        actions.grantBundle({
          gold: res.reward.gold,
          lunchboxes: res.reward.boxes,
          gear: res.reward.gear ? [res.reward.gear] : [],
        });
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight * 0.35;
        ring(cx, cy, "#b072ff", 22);
        burst(cx, cy, { color: "#c9a3ff", count: 24, kind: "spark", power: 6 });
        sfx.reveal();
        setFlash(
          `✓ ${m.title} — +${formatNum(res.reward.gold)}🪙${res.reward.boxes ? ` +${res.reward.boxes}🎁` : ""}${res.reward.gear ? " + gear" : ""}`,
        );
        await refresh();
      } else if (res.status === "wrong") {
        setFlash("✗ The mirror rejects that answer.");
        sfx.error();
        shake(6);
      } else if (res.status === "already_done") {
        setFlash("Already claimed.");
        await refresh();
      } else {
        setFlash("The mirror could not confirm it.");
      }
    } catch {
      setFlash("Couldn't reach the deep. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel operator">
      <div className="op-hero">
        <div className="op-hero-body">
          <h2>🔮 The Scrying Mirror</h2>
          <p className="muted">
            Operator <strong>#{serial}</strong> of {SCRYING_MIRROR_SUPPLY}. The mirror shows what the deep
            hides — secret missions only its holders can see.
          </p>
        </div>
      </div>

      {flash && <div className="op-flash">{flash}</div>}
      {loadErr && (
        <div className="banner error" role="alert">
          {loadErr}
          <button type="button" className="btn ghost" onClick={() => void refresh()}>retry</button>
        </div>
      )}
      {feed == null && !loadErr && <p className="muted small">The mirror is focusing…</p>}
      {feed != null && feed.length === 0 && !loadErr && (
        <p className="muted small">No visions right now. The mirror will show more in time.</p>
      )}

      <div className="op-grid">
        {(feed ?? []).map((m) => (
          <article key={m.id} className={`op-mission ${m.kind} ${m.completed ? "done" : ""}`}>
            <div className="op-kind">{m.kind === "vision" ? "👁 VISION" : "🔑 CIPHER"}</div>
            <h3>{m.title}</h3>
            <p className="op-brief">{m.brief}</p>
            <div className="op-reward muted small">
              Reward: 🪙 {formatNum(m.rewardGold)}
              {m.rewardBoxes ? ` · ${m.rewardBoxes}🎁` : ""}
              {m.rewardGear ? " · ⚔️ gear" : ""}
            </div>
            {m.completed ? (
              <div className="op-done">✓ Completed</div>
            ) : m.kind === "cipher" ? (
              <div className="op-answer">
                <input
                  type="text"
                  value={answers[m.code] ?? ""}
                  placeholder="speak the answer…"
                  onChange={(e) => setAnswers((a) => ({ ...a, [m.code]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") void doComplete(m); }}
                />
                <button type="button" className="btn" disabled={busy === m.code} onClick={() => void doComplete(m)}>
                  {busy === m.code ? "…" : "Decode"}
                </button>
              </div>
            ) : (
              <button type="button" className="btn" disabled={busy === m.code} onClick={() => void doComplete(m)}>
                {busy === m.code ? "…" : "Claim vision"}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------- raid after-action report (exploration log) ----------------

function RaidReportModal({ report, onClose }: { report: RaidReport; onClose: () => void }) {
  const verdict = classEdgeVerdict(report.classEdge);
  const toneIcon: Record<string, string> = { loot: "🪙", fight: "⚔️", wound: "🩸", flavor: "·" };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal raid-report" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>🗺️ {report.missionName} — After-Action</h3>
          <button className="chip-btn" onClick={onClose}>✕</button>
        </div>
        <div className="rr-summary">
          <div className="rr-stat"><b>🪙 {formatNum(report.gold)}</b><span>looted</span></div>
          <div className="rr-stat"><b>+{report.xp} XP</b><span>each</span></div>
          <div className={`rr-stat edge ${verdict.cls}`}><b>{verdict.txt}</b><span>matchup</span></div>
        </div>
        {(report.wounded.length > 0 || report.downed.length > 0 || report.killed.length > 0) && (
          <div className="rr-casualties">
            {report.wounded.length > 0 && <span className="cas wound">🩸 {report.wounded.length} wounded</span>}
            {report.downed.length > 0 && <span className="cas down">🚑 {report.downed.length} downed</span>}
            {report.killed.length > 0 && <span className="cas dead">💀 {report.killed.join(", ")} lost</span>}
          </div>
        )}
        <div className="rr-log">
          {report.log.map((e, i) => {
            const mm = Math.floor(e.t / 60);
            const ss = e.t % 60;
            const stamp = mm > 0 ? `${mm}m${ss.toString().padStart(2, "0")}s` : `${ss}s`;
            return (
              <div key={i} className={`rr-line ${e.tone}`}>
                <span className="rr-time">{stamp}</span>
                <span className="rr-ic">{e.icon || toneIcon[e.tone]}</span>
                <span className="rr-txt">{e.text}</span>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn" onClick={onClose}>Home to the deep</button>
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
  const isVault = room.type === "warchest";
  const cap = roomCapacity(room);
  // The Treasury Vault yields from staked USD into its own pool (state.warChest).
  const storeCap = isVault ? warChestStoreCap(state) : roomStoreCap(room);
  const storedRaw = isVault ? state.warChest.stored : room.stored;
  const rate = roomRate(state, room, stats.fed);
  const stored = Math.floor(storedRaw);
  const ready = storeCap > 0 && stored >= 1;
  const fill = storeCap > 0 ? Math.min(1, storedRaw / storeCap) : 0;
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
        <img className="ch-art" src={INTERIOR[room.type] ?? ROOM_ART[room.type]} alt="" aria-hidden loading="lazy" />
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
          {workers.length > 0 && (
            <div className="ch-worker">
              <RoomFrog anim="Boxing_Practice" size={130} />
            </div>
          )}
          <span className="ch-mood" aria-hidden>
            {incident ? "😡" : !stats.fed ? "😣" : ready || rate > 0 ? "😄" : "🙂"}
          </span>
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
          {def.produces && !isVault && (
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
      <SummoningPanel state={state} actions={actions} />
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
          const hurt = d.downed || d.hp < dwellerMaxHp(d);
          return (
            <button
              key={d.id}
              className={`gacha apt-${d.aptitude} ${d.downed ? "is-downed" : ""}`}
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
                  <span className="gacha-cls" title={CLASS_LABEL[dwellerClass(d)]}>{CLASS_ICON[dwellerClass(d)]}</span>
                  <span className="gacha-might">{Math.floor(dwellerMight(d, state))} ⚔</span>
                  {geared > 0 && <span className="gacha-gear">{geared}⚙</span>}
                  {d.onchain && <span className="gacha-chain" title="On-chain — survives Descend">🔗</span>}
                </div>
                <div className="gacha-name">{d.name}</div>
                <div className="gacha-stars">{stars(r.stars)}</div>
                <XpBar d={d} />
                {hurt && <HpBar d={d} />}
                <div className="gacha-foot">
                  {d.downed ? (
                    <span className="badge downed-badge">🚑 Downed · tap to heal</span>
                  ) : out ? (
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
  const edgeVerdict = classEdgeVerdict(arenaClassEdge(state));
  const bossHpFrac = Math.max(0, state.arena.bossHp) / bossMaxHp(state);
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
      setFlash(`Hit for ${formatNum(res.damage)}!${res.downed.length ? ` 🚑 ${res.downed.join(", ")} down!` : ""}`);
      setHitToken((h) => h + 1);
      shake(crit ? 9 : 4);
      burst(c.x, c.y - 10, { color: crit ? "#ffd76b" : "#ff8a7a", count: crit ? 18 : 10, kind: "spark", power: crit ? 6 : 4 });
      floatText(c.x + (Math.random() * 80 - 40), c.y - 10, `-${formatNum(res.damage)}`, { color: crit ? "#ffd76b" : "#ff9a8a", crit });
      if (crit) sfx.crit();
      else sfx.hit();
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
            <i style={{ width: `${bossHpFrac * 100}%` }} />
            <b>{formatNum(Math.max(0, state.arena.bossHp))} HP</b>
          </div>
          {flash && <div className="boss-flash">{flash}</div>}
        </div>
      </div>

      <SquadPicker state={state} actions={actions} enemyClass={boss.enemyClass} />

      <div className="arena-controls">
        <div className="squad-info">
          <div className="squad-power">Squad power <b>{power} ⚔</b> · <b className={`edge-tag ${edgeVerdict.cls}`}>{edgeVerdict.txt}</b></div>
          <span className="muted small">
            Boss is {CLASS_ICON[boss.enemyClass]} {CLASS_LABEL[boss.enemyClass]} — counter it ({CLASS_ICON[boss.enemyClass === "melee" ? "charge" : boss.enemyClass === "ranged" ? "melee" : "ranged"]} beats it). Forge arsenal counts too; the boss bites back.
          </span>
        </div>
        <button type="button" className="btn big" disabled={cd > 0 || squad.length === 0} onClick={onFight}>
          {cd > 0 ? `Regrouping ${Math.ceil(cd / 1000)}s` : "⚔ FIGHT"}
        </button>
      </div>
      <p className="muted small">
        Pick a squad from your idle heroes (or send all). Class matchup swings damage; a downed hero must be healed with salves before they can fight again. Beat the boss for gold + a 🎁 lunchbox.
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
                  <span className="req" title={`Enemy class: ${CLASS_LABEL[m.enemyClass]} — counter it for bonus loot`}>{CLASS_ICON[m.enemyClass]} {CLASS_LABEL[m.enemyClass]}</span>
                  <span className="req danger" title={`Wound risk`}>{"🩸".repeat(m.danger > 0.5 ? 3 : m.danger > 0.25 ? 2 : 1)}</span>
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
  const cls = dwellerClass(d);
  const maxHp = dwellerMaxHp(d);
  const hurt = d.downed || d.hp < maxHp;
  const healCost = healSalveCost(d);
  const inv = inventoryGear(state).filter((g) => (pickSlot ? gearDefOf(g).slot === pickSlot : true));

  const equippedItemInstance = (slot: GearSlot): GearItem | null => {
    const id = d.equipped[slot];
    if (!id) return null;
    return state.gear.find((g) => g.id === id) ?? null;
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
              <ClassBadge cls={cls} />
              <span className="hm-might">{might} ⚔ might</span>
              {d.onchain && <span className="badge onchain-badge" title="Bought on-chain — survives a Descend">🔗 on-chain</span>}
            </div>
            <div className="hm-status">
              {d.downed ? (
                <span className="badge downed-badge">🚑 Downed</span>
              ) : out ? (
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

        <div className="hm-vitals">
          <div className="hm-vrow">
            <span className="hm-vlabel">❤️ Health</span>
            <div className="vital hp big"><i style={{ width: `${hpFrac(d) * 100}%` }} /></div>
            <span className="hm-vnum">{Math.ceil(d.hp)}/{maxHp}</span>
          </div>
          <div className="hm-vrow">
            <span className="hm-vlabel">⚡ Stamina</span>
            <div className="vital sta big"><i style={{ width: `${staminaFrac(d) * 100}%` }} /></div>
            <span className="hm-vnum">{Math.round(d.stamina)}/100</span>
          </div>
          {hurt && (
            <button
              type="button"
              className="btn heal-btn"
              disabled={state.salves < healCost}
              onClick={() => actions.heal(d.id)}
              title={`Spend ${healCost} salves`}
            >
              {d.downed ? "🚑 Revive" : "⛑️ Heal"} · {healCost} salves{state.salves < healCost ? " (short)" : ""}
            </button>
          )}
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

        <h4 className="ml">Equipment · forge higher, fuse duplicates</h4>
        <div className="slots">
          {(["weapon", "armor", "mount"] as GearSlot[]).map((slot) => {
            const item = equippedItemInstance(slot);
            const g = item ? gearDefOf(item) : null;
            const lvl = item ? gearLevel(item) : 0;
            const scaled = item ? gearItemStats(item) : null;
            const upCost = item ? gearUpgradeCost(item) : 0;
            const maxed = item ? gearAtMaxLevel(item) : false;
            const fuseC = item ? fusionCandidates(state, item.id) : [];
            return (
              <div key={slot} className="slot-row">
                <button
                  className={`slot ${g ? "filled" : ""}`}
                  style={g ? { ["--rar" as string]: RARITY_META[g.rarity].color } : undefined}
                  onClick={() => setPickSlot(pickSlot === slot ? null : slot)}
                >
                  {g ? <img src={g.img} alt={g.name} /> : <span className="slot-ic">{SLOT_ICON[slot]}</span>}
                  {lvl > 0 && <span className="slot-lv">+{lvl}</span>}
                </button>
                <div className="slot-info">
                  <div className="slot-label">{SLOT_LABEL[slot]}</div>
                  {g && item && scaled ? (
                    <>
                      <div className="slot-name" style={{ color: RARITY_META[g.rarity].color }}>
                        {g.name}{lvl > 0 ? ` +${lvl}` : ""}
                      </div>
                      <div className="slot-bonus">
                        +{Math.round(scaled.might)}⚔ {scaled.output ? `· +${scaled.output.toFixed(1)}/s` : ""}
                        <span className="muted small"> · {lvl}/{GEAR_MAX_LEVEL}</span>
                      </div>
                      <div className="slot-forge">
                        <button
                          type="button"
                          className="chip-btn forge"
                          disabled={maxed || state.gold < upCost}
                          title={maxed ? "Max forge level" : `Forge to +${lvl + 1}`}
                          onClick={() => actions.upgradeGear(item.id)}
                        >
                          {maxed ? "MAX" : `▲ Forge · 🪙 ${formatNum(upCost)}`}
                        </button>
                        {fuseC.length > 0 && !maxed && (
                          <button
                            type="button"
                            className="chip-btn fuse"
                            title={`Fuse a duplicate (+2 levels) — ${fuseC.length} in armory`}
                            onClick={() => actions.fuseGear(item.id, fuseC[0].id)}
                          >
                            ⊕ Fuse ×{fuseC.length}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="muted small">empty — tap to equip</div>
                  )}
                </div>
                {item && (
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
                const lvl = gearLevel(item);
                const scaled = gearItemStats(item);
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
                    {lvl > 0 && <span className="gp-lv">+{lvl}</span>}
                    <span className="gp-name" style={{ color: RARITY_META[g.rarity].color }}>{g.name}</span>
                    <span className="gp-bonus">+{Math.round(scaled.might)}⚔{scaled.output ? ` +${scaled.output.toFixed(1)}/s` : ""}</span>
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

// ---------------- Summoning Portal (genetic breeding) ----------------

function SummoningPanel({ state, actions }: { state: GameState; actions: Actions }) {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const now = Date.now();
  const hasPortal = state.rooms.some((r) => r.type === "portal");
  const eligible = state.dwellers.filter((d) => (d.summonsLeft ?? 0) > 0 && !isOnRaid(state, d.id) && !d.downed);
  const pa = (a ? dwellerById(state, a) : null) ?? null;
  const pb = (b ? dwellerById(state, b) : null) ?? null;
  const cost = pa && pb ? summonCost(pa, pb) : null;
  const ready = pa && pb && canSummonWith(state, pa, now) && canSummonWith(state, pb, now);
  const afford = cost ? state.gold >= cost.gold && state.legion >= cost.legion : false;

  if (!hasPortal) {
    return (
      <div className="summon-panel locked">
        <span className="build-label">🌀 SUMMONING PORTAL</span>
        <p className="muted small">Dig a <strong>Summoning Portal</strong> in the Stronghold to breed two gladiators' bloodlines into new-blood — genes, class and all.</p>
      </div>
    );
  }

  const pick = (id: string) => {
    if (a === id) return setA(null);
    if (b === id) return setB(null);
    if (!a) return setA(id);
    if (!b) return setB(id);
    setB(id);
  };

  const doSummon = () => {
    if (!a || !b) return;
    actions.summon(a, b);
    setA(null);
    setB(null);
  };

  const ParentCard = ({ d, slot }: { d: Dweller | null; slot: string }) => (
    <div className={`summon-slot ${d ? "filled" : ""}`}>
      {d ? (
        <>
          <img src={TIER_PORTRAIT[d.tier]} alt={d.name} />
          <div className="ss-info">
            <b>{d.name}</b>
            <span className="muted small">{TIERS[d.tier].name} · Gen {d.gen ?? 0} · {CLASS_ICON[dwellerClass(d)]}{APTITUDE_ICON[d.aptitude]}</span>
            <span className="muted small">{d.summonsLeft ?? 0} summons left · used {summonsUsed(d)}</span>
            {(d.summonReadyAt ?? 0) > now && <span className="warn small">fatigued {Math.ceil(((d.summonReadyAt ?? 0) - now) / 1000)}s</span>}
          </div>
        </>
      ) : (
        <span className="ss-empty">＋ pick {slot}</span>
      )}
    </div>
  );

  return (
    <div className="summon-panel">
      <div className="obj-head">
        <span>🌀 SUMMONING PORTAL · genetics &amp; new-blood</span>
        {cost && <span className="muted small">Cost: 🪙 {formatNum(cost.gold)} + 💠 {formatNum(cost.legion)}</span>}
      </div>
      <div className="summon-slots">
        <ParentCard d={pa} slot="parent A" />
        <span className="summon-x">✕</span>
        <ParentCard d={pb} slot="parent B" />
        <button type="button" className="btn summon-go" disabled={!ready || !afford} onClick={doSummon}>
          {!pa || !pb ? "Pick two" : !ready ? "Fatigued/busy" : !afford ? "Can't afford" : "🌀 Summon"}
        </button>
      </div>
      <p className="muted small">Child inherits a shuffle of both parents' dominant &amp; recessive genes (rare traits can surface), with an 18% chance to mutate up a tier. Each summon fatigues the parents and burns a summon charge.</p>
      <div className="summon-pool">
        {eligible.length === 0 && <span className="muted small">No heroes with summon charges left. Recruit fresh Gen-0 blood.</span>}
        {eligible.map((d) => {
          const on = a === d.id || b === d.id;
          const tired = (d.summonReadyAt ?? 0) > now;
          return (
            <button key={d.id} type="button" className={`summon-mini ${on ? "on" : ""} ${tired ? "tired" : ""}`} style={{ ["--rar" as string]: RARITY[d.tier].color }} onClick={() => pick(d.id)} title={`${d.name} · Gen ${d.gen ?? 0} · ${d.summonsLeft ?? 0} left`}>
              <img src={TIER_PORTRAIT[d.tier]} alt={d.name} />
              <span className="sm-gen">G{d.gen ?? 0}</span>
              <span className="sm-left">{d.summonsLeft ?? 0}</span>
              {on && <span className="sp-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- World Boss (shared co-op + leaderboard) ----------------

/** A stable, human display name for this device's legion on the shared boards. */
function legionName(): string {
  return `Legion ${operatorId().slice(-4).toUpperCase()}`;
}

function WorldBossView({ game }: { game: Game }) {
  const { state, now, actions } = game;
  const wb = state.worldBoss;
  const [flash, setFlash] = useState<string | null>(null);
  // Live server boss (real shared HP + real leaderboard). null → offline fallback.
  const [srv, setSrv] = useState<WbState | null>(null);
  const online = srv != null;

  // Poll the shared boss while this tab is open.
  useEffect(() => {
    if (!ARENA_ONLINE) return;
    let alive = true;
    const pull = () => { void fetchWorldBoss(legionName()).then((r) => { if (alive && r) setSrv(r); }); };
    pull();
    const id = window.setInterval(pull, 6000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const bossClass: CombatClass = (["melee", "ranged", "charge"] as CombatClass[])[((online ? srv!.boss.tier : wb.tier) - 1) % 3];
  const squad = arenaSquad(state);
  const cd = Math.max(0, WB_HIT_COOLDOWN_MS - (now - wb.lastHitAt));

  // Displayed boss/board come from the server when live, else the local sim.
  const dispHp = online ? srv!.boss.hp : Math.max(0, wb.hp);
  const dispMax = online ? srv!.boss.maxHp : wb.maxHp;
  const dispTier = online ? srv!.boss.tier : wb.tier;
  const dispEndsAt = online ? srv!.boss.endsAt : wb.endsAt;
  const board = online ? srv!.leaderboard : worldBossLeaderboard(state);
  const rank = online ? (srv!.you.rank ?? board.length) : worldBossRank(state);
  const myContribution = online ? srv!.you.contributed : wb.contributed;
  const hpFracB = dispMax > 0 ? Math.max(0, dispHp) / dispMax : 0;
  const daysLeft = Math.max(0, (dispEndsAt - now) / 86_400_000);

  const onHit = () => {
    // Local engine handles the economy (stamina/XP/local rewards + cooldown).
    const hit = game.hitWorldBoss();
    if (!hit) { sfx.error(); return; }
    const c = centerOf(document.querySelector(".wb-stage"));
    shake(hit.killed ? 16 : 6);
    burst(c.x, c.y, { color: hit.killed ? "#ff7a3d" : "#ffd76b", count: hit.killed ? 40 : 16, kind: "spark", power: hit.killed ? 9 : 5 });
    floatText(c.x, c.y - 10, `-${formatNum(hit.damage)}`, { color: "#ffd76b", crit: hit.killed });
    setFlash(`Struck for ${formatNum(hit.damage)}!`);
    if (hit.killed) sfx.boom(); else sfx.hit();
    // In LIVE mode, the same damage lands on the real shared boss.
    if (ARENA_ONLINE) {
      void strikeWorldBoss(legionName(), hit.damage).then((r) => {
        if (!r) return;
        setSrv(r);
        if (r.resolved) setFlash(`💥 The realm felled the boss! You placed #${r.resolved.rank} of ${r.resolved.field}.`);
      });
    }
  };

  return (
    <section className="panel worldboss">
      <div className="panel-head">
        <h2>🐉 World Boss · shared raid {online ? <span className="live-badge">🟢 LIVE</span> : <span className="sim-badge">◍ offline sim</span>}</h2>
        <div className="rank-chip">🏆 Rank #{rank} / {board.length} · tier {dispTier}</div>
      </div>

      {wb.lastReward && (
        <div className="banner daily wb-reward" role="status">
          <span className="daily-icon">🏆</span>
          <strong>{wb.lastReward.bossName} down!</strong>
          <span className="muted small">Finished #{wb.lastReward.rank}/{wb.lastReward.field} · 🪙 {formatNum(wb.lastReward.gold)} + 💠 {formatNum(wb.lastReward.legion)}{wb.lastReward.lunchboxes ? ` + ${wb.lastReward.lunchboxes} 🎁` : ""}</span>
          <button type="button" className="btn" onClick={() => actions.clearWorldBossReward()}>Collect</button>
        </div>
      )}

      <div className="wb-stage" style={{ backgroundImage: `url(${currentBoss(state).img})` }}>
        <div className="boss-veil" />
        <div className="boss-body">
          <div className="boss-name">{worldBossName(state)} <ClassBadge cls={bossClass} small /></div>
          <div className="boss-hpbar wb">
            <i style={{ width: `${hpFracB * 100}%` }} />
            <b>{formatNum(Math.max(0, dispHp))} / {formatNum(dispMax)} HP</b>
          </div>
          {flash && <div className="boss-flash">{flash}</div>}
          <div className="muted small">Cycle ends in {daysLeft.toFixed(1)}d · your damage {formatNum(myContribution)}</div>
        </div>
      </div>

      <div className="wb-cols">
        <div className="wb-left">
          <SquadPicker state={state} actions={actions} enemyClass={bossClass} />
          <div className="arena-controls">
            <div className="squad-info">
              <div className="squad-power">Squad <b>{Math.floor(arenaSquadPower(state))} ⚔</b></div>
              <span className="muted small">
                {online
                  ? "Real legions share this boss — every strike is durable on-chain-of-record. Climb the live board before someone else lands the kill."
                  : `Counter ${CLASS_LABEL[bossClass]}; rivals chip the boss 24/7. (Backend offline — showing simulated rivals.)`}
              </span>
            </div>
            <button type="button" className="btn big" disabled={cd > 0 || squad.length === 0 || dispHp <= 0} onClick={onHit}>
              {cd > 0 ? `Rallying ${Math.ceil(cd / 1000)}s` : "🗡️ STRIKE"}
            </button>
          </div>
        </div>
        <div className="wb-board">
          <h4 className="ml">Contribution leaderboard <span className="muted small">{online ? "(real players)" : "(simulated rivals)"}</span></h4>
          {board.map((row, i) => (
            <div key={`${row.name}-${i}`} className={`wb-row ${row.isYou ? "you" : ""}`}>
              <span className="wb-rank">#{i + 1}</span>
              <span className="wb-name">{row.isYou ? "⭐ " : ""}{row.name}</span>
              <span className="wb-dmg">{formatNum(row.contributed)}</span>
            </div>
          ))}
          {board.length === 0 && <p className="muted small">Be the first to strike this cycle.</p>}
        </div>
      </div>
    </section>
  );
}

// ---------------- PvP Duels (ranked ladder) ----------------

function DuelsView({ state, actions }: { state: GameState; actions: Actions }) {
  const pvp = state.pvp;
  const myPower = Math.floor(arenaSquadPower(state));
  const res = pvp.lastResult;
  const squadArr = arenaSquad(state);
  const myClass: CombatClass = squadArr.length
    ? dwellerClass([...squadArr].sort((a, b) => dwellerMight(b, state) - dwellerMight(a, state))[0])
    : "melee";

  // Real opponents from the shared ladder (other players). null → offline sim.
  const [srv, setSrv] = useState<{ opponents: LadderOpponent[]; rank: number; field: number } | null>(null);
  const online = srv != null && srv.opponents.length > 0;

  // Push my snapshot + pull real opponents; re-sync after each duel (rating moves).
  useEffect(() => {
    if (!ARENA_ONLINE) return;
    let alive = true;
    void syncLadder({ name: legionName(), rating: Math.round(pvp.rating), power: myPower, combatClass: myClass, wins: pvp.wins, losses: pvp.losses })
      .then((r) => { if (alive && r) setSrv(r); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvp.wins, pvp.losses, pvp.rating]);

  const simOpps = pvpOpponents(state);

  return (
    <section className="panel duels">
      <div className="panel-head">
        <h2>🏟️ Duels · ranked ladder {online ? <span className="live-badge">🟢 LIVE</span> : <span className="sim-badge">◍ offline sim</span>}</h2>
        <div className="rank-chip">🎖️ {pvpRankName(pvp.rating)} · {Math.round(pvp.rating)}{online ? ` · #${srv!.rank}/${srv!.field}` : ""}</div>
      </div>

      <div className="pvp-stats">
        <div className="pvp-stat"><b>{pvp.wins}</b><span>wins</span></div>
        <div className="pvp-stat"><b>{pvp.losses}</b><span>losses</span></div>
        <div className="pvp-stat"><b>{pvp.streak}</b><span>streak</span></div>
        <div className="pvp-stat"><b>{pvp.attacksLeft}/{PVP_DAILY_ATTACKS}</b><span>duels left</span></div>
        <div className="pvp-stat"><b>{myPower} ⚔</b><span>your squad</span></div>
      </div>

      {res && (
        <div className={`banner ${res.won ? "daily" : "error"} duel-result`} role="status">
          <strong>{res.won ? "⚔️ Victory" : "🩸 Defeat"} vs {res.oppName}</strong>
          <span className="muted small">
            {res.yourPower} vs {res.oppPower} ⚔ · {res.won ? "+" : ""}{res.ratingDelta} rating
            {res.gold ? ` · 🪙 ${formatNum(res.gold)}` : ""}{res.legion ? ` · 💠 ${formatNum(res.legion)}` : ""}
          </span>
          <button type="button" className="btn" onClick={() => actions.clearDuelResult()}>OK</button>
        </div>
      )}

      <SquadPicker state={state} actions={actions} />

      <div className="duel-grid">
        {online
          ? srv!.opponents.map((o) => {
              const edge = classEdgeVerdict(squadClassEdge(state, arenaSquad(state), o.combatClass));
              return (
                <article key={o.playerKey} className="duel-card real">
                  <div className="dc-head">
                    <span className="dc-name">🌐 {o.name}</span>
                    <ClassBadge cls={o.combatClass} small />
                  </div>
                  <div className="dc-meta">
                    <span>🎖️ {o.rating}</span>
                    <span>{o.power} ⚔</span>
                    <span>{o.wins}W/{o.losses}L</span>
                    <span className={`edge-tag ${edge.cls}`}>{edge.txt}</span>
                  </div>
                  <button type="button" className="btn" disabled={pvp.attacksLeft <= 0 || squadArr.length === 0}
                    onClick={() => actions.duelReal({ name: o.name, rating: o.rating, power: o.power, combatClass: o.combatClass })}>
                    {pvp.attacksLeft <= 0 ? "No duels left" : "⚔ Challenge"}
                  </button>
                </article>
              );
            })
          : simOpps.map((o) => {
              const edge = classEdgeVerdict(squadClassEdge(state, arenaSquad(state), o.combatClass));
              return (
                <article key={o.id} className="duel-card">
                  <div className="dc-head">
                    <span className="dc-name">{o.name}</span>
                    <ClassBadge cls={o.combatClass} small />
                  </div>
                  <div className="dc-meta">
                    <span>🎖️ {o.rating}</span>
                    <span>{o.power} ⚔</span>
                    <span className={`edge-tag ${edge.cls}`}>{edge.txt}</span>
                  </div>
                  <button type="button" className="btn" disabled={pvp.attacksLeft <= 0 || squadArr.length === 0} onClick={() => actions.duel(o.id)}>
                    {pvp.attacksLeft <= 0 ? "No duels left" : "⚔ Challenge"}
                  </button>
                </article>
              );
            })}
      </div>
      <p className="muted small">
        {online
          ? "🌐 These are REAL rival legions pulled from the shared ladder — beating a higher-rated player pays more rating & gold (ELO). Your result syncs back to the global board."
          : "Win probability follows an ELO curve; class matchup swings the fight. Duels refresh daily. (Backend offline — showing simulated opponents.)"}
      </p>
    </section>
  );
}

// ---------------- Exchange (DEX + Bank) ----------------

function ExchangeView({ state, now, actions }: { state: GameState; now: number; actions: Actions }) {
  const [goldIn, setGoldIn] = useState("");
  const [legionIn, setLegionIn] = useState("");
  const [stakeAmt, setStakeAmt] = useState("");
  const price = dexPrice(state);
  const gN = Number(goldIn) || 0;
  const lN = Number(legionIn) || 0;
  const outLegion = quoteGoldToLegion(state, gN);
  const outGold = quoteLegionToGold(state, lN);
  const pending = bankPending(state, now);
  const fee = bankWithdrawFee(state, now);
  const sN = Number(stakeAmt) || 0;

  return (
    <section className="panel exchange">
      <div className="panel-head">
        <h2>💱 Exchange · DEX &amp; Bank</h2>
        <div className="rank-chip">💠 1 gold ≈ {price.toFixed(3)} $LEGION</div>
      </div>

      <div className="xc-cols">
        <div className="xc-card">
          <h4 className="ml">⇄ Swap (constant-product AMM · 0.3% fee)</h4>
          <div className="swap-row">
            <input type="number" min="0" placeholder="gold in" value={goldIn} onChange={(e) => setGoldIn(e.target.value)} />
            <span className="swap-arrow">→ 💠 {formatNum(outLegion)}</span>
            <button type="button" className="btn" disabled={gN <= 0 || gN > state.gold} onClick={() => { actions.swapGoldForLegion(gN); setGoldIn(""); }}>Swap gold→$LEGION</button>
          </div>
          <div className="swap-row">
            <input type="number" min="0" placeholder="$LEGION in" value={legionIn} onChange={(e) => setLegionIn(e.target.value)} />
            <span className="swap-arrow">→ 🪙 {formatNum(outGold)}</span>
            <button type="button" className="btn secondary" disabled={lN <= 0 || lN > state.legion} onClick={() => { actions.swapLegionForGold(lN); setLegionIn(""); }}>Swap $LEGION→gold</button>
          </div>
          <p className="muted small">Pool: 🪙 {formatNum(state.dex.poolGold)} / 💠 {formatNum(state.dex.poolLegion)}. Big swaps move the price (slippage).</p>
        </div>

        <div className="xc-card">
          <h4 className="ml">🏦 Bank · stake $LEGION for real yield</h4>
          <div className="bank-stats">
            <div><b>{formatNum(state.bank.staked)}</b><span>staked 💠</span></div>
            <div><b>{formatNum(pending)}</b><span>pending yield</span></div>
            <div><b>{Math.round(fee * 100)}%</b><span>withdraw fee</span></div>
          </div>
          <div className="swap-row">
            <input type="number" min="0" placeholder="amount" value={stakeAmt} onChange={(e) => setStakeAmt(e.target.value)} />
            <button type="button" className="btn" disabled={sN <= 0 || sN > state.legion} onClick={() => { actions.stakeLegion(sN); setStakeAmt(""); }}>Stake</button>
            <button type="button" className="btn secondary" disabled={sN <= 0 || sN > state.bank.staked} onClick={() => { actions.unstakeLegion(sN); setStakeAmt(""); }}>Unstake</button>
          </div>
          <button type="button" className="btn" disabled={pending < 1} onClick={() => actions.claimBankYield()}>Claim {formatNum(pending)} 💠 yield</button>
          <p className="muted small">Emissions accrue every second. Withdrawal fee decays 25%→8%→4%→0 the longer you stay staked — anti-mercenary, DeFi-Kingdoms style.</p>
        </div>
      </div>
    </section>
  );
}

// ---------------- Realm (Land / territories) ----------------

const LAND_ALL: LandKind[] = ["gold", "provisions", "salves", "legion", "might"];

function RealmView({ state, stats, actions }: { state: GameState; stats: Stats; actions: Actions }) {
  const [kind, setKind] = useState<LandKind>("gold");
  const claimCost = landClaimCost(state);
  const slots = landSlotsLeft(state);
  const gated = stats.might < LAND_MIN_MIGHT;
  const y = landYields(state);
  return (
    <section className="panel realm">
      <div className="panel-head">
        <h2>🗺️ The Realm · territory</h2>
        <div className="rank-chip">{state.land.length}/{LAND_SLOTS} parcels</div>
      </div>
      <p className="muted small">
        Scarce parcels that yield forever. Claiming costs 💠 $LEGION and is gated by might ({LAND_MIN_MIGHT}+) — the realm answers only to strength.
        Realm yield now: 🪙 {y.gold.toFixed(1)}/s · 🌾 {y.provisions.toFixed(1)}/s · ⛑ {y.salves.toFixed(1)}/s · 💠 {y.legion.toFixed(2)}/s · ⚔ +{Math.round(y.might)}.
      </p>

      <div className="realm-grid">
        {state.land.map((p) => {
          const meta = LAND_KIND_META[p.kind];
          const upCost = landUpgradeCost(p);
          const isMight = p.kind === "might";
          return (
            <article key={p.id} className={`parcel k-${p.kind}`}>
              <div className="parcel-top"><span className="parcel-ic">{meta.icon}</span><span className="parcel-lvl">Lv {p.level}</span></div>
              <div className="parcel-name">{meta.name}</div>
              <div className="parcel-yield muted small">
                {isMight ? `+${Math.round(LAND_YIELD.might * p.level)} ⚔ might` : `+${(LAND_YIELD[p.kind] * p.level).toFixed(2)}/s`}
              </div>
              <button type="button" className="chip-btn up" disabled={state.gold < upCost} onClick={() => actions.upgradeLand(p.id)}>▲ 🪙 {formatNum(upCost)}</button>
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
          <span className="build-label">STAKE A NEW CLAIM</span>
          <div className="claim-kinds">
            {LAND_ALL.map((k) => (
              <button key={k} type="button" className={`chip-btn ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
                {LAND_KIND_META[k].icon} {LAND_KIND_META[k].name}
              </button>
            ))}
          </div>
          <button type="button" className="btn" disabled={gated || state.legion < claimCost} onClick={() => actions.claimLand(kind)} title={gated ? `Need ${LAND_MIN_MIGHT} might` : ""}>
            {gated ? `🔒 need ${LAND_MIN_MIGHT} ⚔` : `Claim · 💠 ${formatNum(claimCost)}`}
          </button>
        </div>
      )}
    </section>
  );
}
