// Admin / debug panel — "see everything" overlay.
// Read-only inspection of the full game + wallet state, plus dev cheat controls.
// Toggle with the 🛠 button (bottom-left) or the ` (backtick) key.
import { useEffect, useMemo, useState } from "react";
import {
  BOSSES,
  GEAR_CATALOG,
  ROOMS,
  TIERS,
  TIER_ORDER,
} from "../game/config";
import {
  currentBoss,
  dwellerMight,
  gearDefOf,
  inventoryGear,
  isOnRaid,
  maxPopulation,
  raidSquadMight,
  roomCapacity,
  roomRate,
  roomStoreCap,
} from "../game/engine";
import type { useGame } from "../hooks/useGame";
import type { useWallet } from "../hooks/useWallet";
import type { GameState, Tier } from "../game/types";
import {
  currentSessionId,
  fetchAdminAnalytics,
  fetchSessionDetail,
  type AdminAnalytics,
  type PlayerSession,
  type SessionDetail,
} from "../lib/telemetry";

type Game = ReturnType<typeof useGame>;
type Wallet = ReturnType<typeof useWallet>;

const num = (n: number, d = 0) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="adm-section">
      <button type="button" className="adm-sec-head" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▾" : "▸"} {title}</span>
        {count != null && <span className="adm-count">{count}</span>}
      </button>
      {open && <div className="adm-sec-body">{children}</div>}
    </div>
  );
}

function Stat({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`adm-stat ${warn ? "warn" : ""}`}>
      <span className="adm-k">{k}</span>
      <span className="adm-v">{v}</span>
    </div>
  );
}

// Inline numeric editor that commits the field via devPatch on change/blur.
function NumField({
  label,
  value,
  onCommit,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  // keep in sync when external value changes and field isn't focused
  const [focused, setFocused] = useState(false);
  if (!focused && draft !== String(value)) setDraft(String(value));
  return (
    <label className="adm-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          const n = Number(draft);
          if (Number.isFinite(n) && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

const ADMIN_TOKEN_KEY = "idle-legion-admin-token";
const rel = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Cross-user telemetry dashboard — reads the InsForge backend (all players'
// clicks, emails, and IP-derived locations). Gated by the admin token.
function TelemetrySection() {
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem(ADMIN_TOKEN_KEY) ?? ""; } catch { return ""; }
  });
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);

  const load = async () => {
    if (!token) { setErr("Enter the admin token"); return; }
    setLoading(true);
    setErr(null);
    try {
      try { localStorage.setItem(ADMIN_TOKEN_KEY, token); } catch { /* ignore */ }
      setData(await fetchAdminAnalytics(token.trim()));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, token]);

  const maxClick = data?.topEvents.reduce((m, e) => Math.max(m, e.count), 0) ?? 0;

  return (
    <Section title="📡 Live telemetry · ALL users" count={data ? data.totals.sessions : "🔒"} defaultOpen>
      <div className="adm-row">
        <input
          type="password"
          className="adm-token"
          placeholder="admin token (x-admin-token)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
        />
        <button className="adm-btn hot" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : data ? "Refresh" : "Connect"}
        </button>
        <label className="adm-auto">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto
        </label>
      </div>
      {err && <p className="adm-note warn">⚠ {err}</p>}

      {data && (
        <>
          <div className="adm-grid">
            <Stat k="Sessions (players)" v={data.totals.sessions} />
            <Stat k="Events tracked" v={num(data.totals.events)} />
            <Stat k="Total clicks" v={num(data.totals.clicks)} />
            <Stat k="Refreshed" v={rel(data.generatedAt)} />
          </div>

          <h5 className="adm-h5">🖱 What everyone clicks (top {Math.min(12, data.topEvents.length)})</h5>
          <div className="adm-bars">
            {data.topEvents.slice(0, 12).map((e) => (
              <div key={e.name} className="adm-bar-row" title={`${e.name} · ${e.count}`}>
                <span className="adm-bar-label">{e.name}</span>
                <span className="adm-bar-track"><i style={{ width: `${maxClick ? (e.count / maxClick) * 100 : 0}%` }} /></span>
                <span className="adm-bar-n">{e.count}</span>
              </div>
            ))}
            {data.topEvents.length === 0 && <p className="adm-note">No events yet.</p>}
          </div>

          <h5 className="adm-h5">🌍 By country</h5>
          <div className="adm-objs">
            {data.byCountry.map((c) => (
              <span key={c.country} className="adm-tag">{c.country} · {c.count}</span>
            ))}
          </div>

          <h5 className="adm-h5">👤 Players ({data.sessions.length})</h5>
          <table className="adm-table">
            <thead><tr><th>Email</th><th>Location</th><th>Clicks</th><th>Wallet</th><th>Last seen</th></tr></thead>
            <tbody>
              {data.sessions.map((s: any) => (
                <tr key={s.session_id} title={`${s.ip ?? "?"} · ${s.isp ?? ""} · ${s.user_agent ?? ""}`}>
                  <td>{s.email ?? <span className="adm-dim">anon</span>}</td>
                  <td>{[s.city, s.country].filter(Boolean).join(", ") || <span className="adm-dim">—</span>}</td>
                  <td>{s.total_clicks}</td>
                  <td>{s.wallet_address ? `${String(s.wallet_address).slice(0, 6)}…` : <span className="adm-dim">—</span>}</td>
                  <td>{s.last_seen ? rel(s.last_seen) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h5 className="adm-h5">⏱ Recent event stream</h5>
          <div className="adm-stream">
            {data.recent.map((r, i) => (
              <div key={i} className="adm-stream-row">
                <span className={`adm-etype adm-etype-${r.type}`}>{r.type}</span>
                <span className="adm-ename">{r.name}</span>
                <span className="adm-dim">{r.email ?? r.city ?? r.session_id.slice(0, 8)}</span>
                <span className="adm-dim">{rel(r.at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="adm-note adm-dim">This device's session id: {currentSessionId().slice(0, 13)}…</p>
    </Section>
  );
}

export default function AdminPanel({
  game,
  wallet,
  onClose,
}: {
  game: Game;
  wallet: Wallet;
  onClose: () => void;
}) {
  const { state, stats, now, actions } = game;
  const patch = actions.devPatch;
  const [rawOpen, setRawOpen] = useState(false);
  const [grantTier, setGrantTier] = useState<Tier>("champion");
  const [grantGearId, setGrantGearId] = useState<string>(GEAR_CATALOG[0]?.id ?? "");

  const inv = inventoryGear(state);
  const boss = currentBoss(state);
  const raw = useMemo(() => JSON.stringify(state, null, 2), [state]);

  const bump = (k: keyof GameState, delta: number) =>
    patch({ [k]: Math.max(0, (state[k] as number) + delta) } as Partial<GameState>);

  const maxAllRooms = () =>
    patch({ rooms: state.rooms.map((r) => ({ ...r, level: 20 })) });

  const healAll = () =>
    patch({
      gold: 10_000_000,
      provisions: 1_000_000,
      lunchboxes: state.lunchboxes + 50,
    });

  return (
    <div className="adm-backdrop" onClick={onClose}>
      <aside className="adm-panel" onClick={(e) => e.stopPropagation()}>
        <header className="adm-head">
          <h3>🛠 Admin · see everything</h3>
          <div className="adm-head-actions">
            <span className="adm-tick">tick {new Date(now).toLocaleTimeString()}</span>
            <button className="chip-btn" onClick={onClose}>✕</button>
          </div>
        </header>

        {/* ---- quick cheats ---- */}
        <div className="adm-cheats">
          <button className="adm-btn" onClick={() => bump("gold", 1_000)}>+1K 🪙</button>
          <button className="adm-btn" onClick={() => bump("gold", 100_000)}>+100K 🪙</button>
          <button className="adm-btn" onClick={() => bump("gold", 1_000_000)}>+1M 🪙</button>
          <button className="adm-btn" onClick={() => bump("provisions", 10_000)}>+10K 🌾</button>
          <button className="adm-btn" onClick={() => bump("lunchboxes", 10)}>+10 🎁</button>
          <button className="adm-btn" onClick={() => bump("renown", 100)}>+100 🏅</button>
          <button className="adm-btn" onClick={maxAllRooms}>Max rooms</button>
          <button className="adm-btn hot" onClick={healAll}>God mode</button>
        </div>

        {/* ---- cross-user telemetry (InsForge backend) ---- */}
        <TelemetrySection />

        {/* ---- derived stats ---- */}
        <Section title="Overview · derived" count={`${num(stats.might)}⚔`}>
          <div className="adm-grid">
            <Stat k="Might" v={`${num(stats.might, 1)} ⚔`} />
            <Stat k="Gold/s" v={`${num(stats.goldPerSec, 2)}`} />
            <Stat k="Prov/s" v={`${num(stats.provisionsPerSec, 2)}`} warn={stats.provisionsPerSec < 0} />
            <Stat k="Population" v={`${stats.population}/${maxPopulation(state)}`} />
            <Stat k="Idle" v={stats.idleCount} />
            <Stat k="Fed" v={stats.fed ? "yes" : "STARVING"} warn={!stats.fed} />
            <Stat k="Raid might" v={num(raidSquadMight(state), 1)} />
            <Stat k="Total raids" v={state.totalRaids} />
            <Stat k="Total boss wins" v={state.totalBossWins} />
            <Stat k="Total gold earned" v={num(state.totalGoldEarned)} />
            <Stat k="Descents" v={state.descents} />
          </div>
        </Section>

        {/* ---- editable resources ---- */}
        <Section title="Resources · editable" defaultOpen>
          <div className="adm-fields">
            <NumField label="Gold" value={state.gold} onCommit={(v) => patch({ gold: v })} />
            <NumField label="Provisions" value={state.provisions} onCommit={(v) => patch({ provisions: v })} />
            <NumField label="Lunchboxes" value={state.lunchboxes} onCommit={(v) => patch({ lunchboxes: v })} />
            <NumField label="Renown" value={state.renown} onCommit={(v) => patch({ renown: v })} />
            <NumField label="War chest $" value={state.warChestUsd} step={0.01} onCommit={(v) => patch({ warChestUsd: v })} />
            <NumField label="Merc boost" value={state.mercenaryBoost} step={0.01} onCommit={(v) => patch({ mercenaryBoost: v })} />
          </div>
        </Section>

        {/* ---- rooms ---- */}
        <Section title="Rooms" count={state.rooms.length}>
          <table className="adm-table">
            <thead>
              <tr><th>Room</th><th>Lv</th><th>Workers</th><th>Stored</th><th>Rate</th><th></th></tr>
            </thead>
            <tbody>
              {state.rooms.map((r) => {
                const def = ROOMS[r.type];
                const cap = roomCapacity(r);
                const storeCap = roomStoreCap(r);
                return (
                  <tr key={r.id}>
                    <td>{def.icon} {def.name}</td>
                    <td>{r.level}</td>
                    <td>{r.workers.length}/{cap}</td>
                    <td>{num(r.stored)}{storeCap ? `/${num(storeCap)}` : ""}</td>
                    <td>{def.produces ? `${num(roomRate(state, r, stats.fed), 1)}/s` : "—"}</td>
                    <td>
                      <button
                        className="adm-mini"
                        onClick={() => patch({ rooms: state.rooms.map((x) => x.id === r.id ? { ...x, level: x.level + 1 } : x) })}
                      >
                        ▲
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* ---- dwellers ---- */}
        <Section title="Dwellers" count={state.dwellers.length} defaultOpen={false}>
          <table className="adm-table">
            <thead>
              <tr><th>Name</th><th>Tier</th><th>Apt</th><th>Lv</th><th>Might</th><th>Where</th></tr>
            </thead>
            <tbody>
              {state.dwellers.map((d) => {
                const where = isOnRaid(state, d.id)
                  ? "raid"
                  : d.roomId
                    ? ROOMS[state.rooms.find((r) => r.id === d.roomId)?.type ?? "hall"].name
                    : "idle";
                return (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{TIERS[d.tier].name}</td>
                    <td>{d.aptitude}</td>
                    <td>{d.level}</td>
                    <td>{num(dwellerMight(d, state))}</td>
                    <td>{where}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* ---- gear ---- */}
        <Section title="Gear · owned" count={state.gear.length} defaultOpen={false}>
          <p className="adm-note">{inv.length} in inventory · {state.gear.length - inv.length} equipped</p>
          <table className="adm-table">
            <thead><tr><th>Name</th><th>Slot</th><th>Rarity</th><th>Might</th><th>Out</th></tr></thead>
            <tbody>
              {state.gear.map((item) => {
                const g = gearDefOf(item);
                return (
                  <tr key={item.id}>
                    <td>{g.name}</td><td>{g.slot}</td><td>{g.rarity}</td><td>+{g.might}</td><td>{g.output || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* ---- arena / raid / incident / objectives ---- */}
        <Section title="Arena & world state" defaultOpen={false}>
          <div className="adm-grid">
            <Stat k="Boss" v={`${boss.name} (#${state.arena.bossIndex})`} />
            <Stat k="Boss HP" v={`${num(state.arena.bossHp)} / ${num(boss.baseHp)}`} />
            <Stat k="Rank" v={`#${state.arena.rank}`} />
            <Stat k="Wins" v={state.arena.wins} />
          </div>
          <div className="adm-cheats">
            <button className="adm-btn" onClick={() => patch({ arena: { ...state.arena, bossHp: 1 } })}>Boss → 1 HP</button>
            <button className="adm-btn" onClick={() => patch({ arena: { ...state.arena, bossHp: boss.baseHp } })}>Boss → full</button>
            <button className="adm-btn" onClick={() => patch({ arena: { ...state.arena, bossIndex: (state.arena.bossIndex + 1) % BOSSES.length } })}>Next boss</button>
            {state.incident && (
              <button className="adm-btn" onClick={() => patch({ incident: null })}>Clear incident 🔥</button>
            )}
            {state.activeRaid && (
              <button className="adm-btn" onClick={() => patch({ activeRaid: { ...state.activeRaid!, endsAt: now } })}>Finish raid</button>
            )}
          </div>
          <p className="adm-note">
            Incident: {state.incident ? `${state.incident.label} (${state.incident.kind})` : "none"} ·
            Raid: {state.activeRaid ? `${state.activeRaid.squad.length} out` : "none"} ·
            Squad: {state.squad.length || "auto"}
          </p>
          <div className="adm-objs">
            {state.objectives.map((o) => (
              <span key={o.id} className="adm-tag">{o.kind} → {num(o.target)} (🎁{o.reward})</span>
            ))}
          </div>
        </Section>

        {/* ---- grant tools ---- */}
        <Section title="Grant tools" defaultOpen={false}>
          <div className="adm-row">
            <select value={grantTier} onChange={(e) => setGrantTier(e.target.value as Tier)}>
              {TIER_ORDER.map((t) => <option key={t} value={t}>{TIERS[t].name}</option>)}
            </select>
            <button className="adm-btn" onClick={() => actions.grantGladiator(grantTier)}>+ Gladiator</button>
            <button className="adm-btn" onClick={() => actions.recruit()}>Recruit (cost)</button>
          </div>
          <div className="adm-row">
            <select value={grantGearId} onChange={(e) => setGrantGearId(e.target.value)}>
              {GEAR_CATALOG.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.rarity}</option>)}
            </select>
            <button className="adm-btn" onClick={() => grantGearId && actions.grantGear(grantGearId)}>+ Gear</button>
          </div>
        </Section>

        {/* ---- wallet ---- */}
        <Section title="Wallet / on-chain" defaultOpen={false}>
          <div className="adm-grid">
            <Stat k="Session" v={wallet.session ? wallet.session.method : "offline"} />
            <Stat k="Address" v={wallet.session?.address ?? "—"} />
            <Stat k="UA / 7702" v={wallet.uaAddress ?? "—"} />
            <Stat k="Total USD" v={wallet.totalUsd == null ? "—" : `$${wallet.totalUsd.toFixed(2)}`} />
            <Stat k="Assets" v={wallet.assets.length} />
            <Stat k="Caps" v={`magic:${wallet.caps.magic ? "✓" : "✗"} particle:${wallet.caps.particle ? "✓" : "✗"}`} />
            <Stat k="Busy" v={wallet.busy ? "yes" : "no"} />
            <Stat k="Last tx" v={wallet.lastTx ? `${wallet.lastTx.amount} USDT` : "—"} />
            <Stat k="Funded on-chain" v={state.fundedOnchain ? "yes" : "no"} />
          </div>
        </Section>

        {/* ---- raw json ---- */}
        <Section title="Raw state JSON" defaultOpen={false}>
          <div className="adm-row">
            <button className="adm-btn" onClick={() => navigator.clipboard?.writeText(raw)}>Copy JSON</button>
            <button className="adm-btn" onClick={() => setRawOpen((o) => !o)}>{rawOpen ? "Hide" : "Show"} ({raw.length}b)</button>
          </div>
          {rawOpen && <pre className="adm-raw">{raw}</pre>}
        </Section>

        {/* ---- danger ---- */}
        <div className="adm-danger">
          <button className="adm-btn danger" onClick={() => { if (confirm("Reset the whole save?")) actions.reset(); }}>
            ⟲ Reset save
          </button>
        </div>
      </aside>
    </div>
  );
}
