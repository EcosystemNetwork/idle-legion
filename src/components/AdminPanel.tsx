// Admin / debug panel — "see everything" overlay.
// Read-only inspection of the full game + wallet state, plus dev cheat controls.
// Toggle with the 🛠 button (bottom-left) or the ` (backtick) key.
import { useEffect, useMemo, useRef, useState } from "react";
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
  type SessionDetail,
} from "../lib/telemetry";
import { TEST_GROUPS, listTests, runTests, type TestResult } from "../game/selftest";

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
type DashTab = "overview" | "players" | "live" | "geo" | "insights";
const SCREEN_ICON: Record<string, string> = {
  stronghold: "🏰", legion: "🛡️", arena: "⚔️", raids: "🗺️", market: "🏛️", codex: "📜",
};

const rel = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Flag rendered as an image, not an emoji — regional-indicator flag emoji don't
// render on many Linux/Chrome setups (they fall back to letter-pairs). flagcdn
// gives a real flag image everywhere; unknown/invalid codes show a neutral globe.
function Flag({ code }: { code: string | null | undefined }) {
  if (!code || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) {
    return <span className="adm-flag adm-flag-x" aria-hidden>🌐</span>;
  }
  const cc = code.toLowerCase();
  return (
    <img
      className="adm-flag"
      src={`https://flagcdn.com/w40/${cc}.png`}
      srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      loading="lazy"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
    />
  );
}

// Event types render in a fixed categorical order (validated blue/green/magenta/
// yellow), always paired with the type word so identity is never color-alone.
const ETYPE_COLOR: Record<string, string> = {
  click: "#3987e5", action: "#008300", pageview: "#d55181", session_start: "#c98500", login: "#9085e9",
};
const etColor = (t: string) => ETYPE_COLOR[t] ?? "#8a819c";

// seconds -> "1h 3m" / "4m 12s" / "45s"
const fmtDur = (sec: number | null | undefined) => {
  const s = Math.round(sec ?? 0);
  if (s <= 0) return "0s";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

const shortAddr = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// ---- tiny SVG charts (no deps) ----

// Single-series 24h activity — area+line, gold. No legend (title names it).
function ActivityChart({ series }: { series: AdminAnalytics["series"] }) {
  const w = 460, h = 90, pad = 4;
  const max = Math.max(1, ...series.map((p) => p.count));
  const n = series.length;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2 - 10);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  const peak = series.reduce((m, p, i) => (p.count > series[m].count ? i : m), 0);
  return (
    <div className="adm-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="adm-svg" role="img" aria-label="Events per hour, last 24 hours">
        <defs>
          <linearGradient id="admArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffc233" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#ffc233" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#admArea)" />
        <path d={line} fill="none" stroke="#ffc233" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((p, i) => (
          <rect key={i} x={x(i) - (w / n) / 2} y={0} width={w / n} height={h} fill="transparent">
            <title>{`${new Date(p.t).toLocaleTimeString([], { hour: "2-digit" })} · ${p.count} events`}</title>
          </rect>
        ))}
        {max > 1 && <circle cx={x(peak)} cy={y(series[peak].count)} r="2.5" fill="#fff0b0" />}
      </svg>
      <div className="adm-chart-x"><span>24h ago</span><span>now</span></div>
    </div>
  );
}

// Horizontal magnitude bars — single hue (gold), value labelled at the end.
function BarList({ rows, max, accent = "#ffc233" }: { rows: { key: string; label: React.ReactNode; count: number; title?: string }[]; max: number; accent?: string }) {
  return (
    <div className="adm-bars">
      {rows.map((r) => (
        <div key={r.key} className="adm-bar-row" title={r.title}>
          <span className="adm-bar-label">{r.label}</span>
          <span className="adm-bar-track"><i style={{ width: `${max ? (r.count / max) * 100 : 0}%`, background: accent }} /></span>
          <span className="adm-bar-n">{num(r.count)}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="adm-note">No data yet.</p>}
    </div>
  );
}

// Cross-user telemetry dashboard — reads the InsForge backend (all players'
// clicks, emails, and IP-derived locations). Gated by the admin token.
function TelemetrySection() {
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem(ADMIN_TOKEN_KEY) ?? ""; } catch { return ""; }
  });
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoMs, setAutoMs] = useState(0); // 0 = off
  const [tab, setTab] = useState<DashTab>("overview");
  const [tick, setTick] = useState(0); // re-render for "x ago" + countdown
  const lastAt = useRef(0);

  // Players tab controls
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"last_seen" | "total_clicks" | "total_events" | "email" | "country">("last_seen");
  const [drill, setDrill] = useState<SessionDetail | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [drillErr, setDrillErr] = useState<string | null>(null);

  // Live tab controls
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [paused, setPaused] = useState(false);

  const load = async () => {
    if (!token) { setErr("Enter the admin token"); return; }
    setLoading(true);
    setErr(null);
    try {
      try { localStorage.setItem(ADMIN_TOKEN_KEY, token); } catch { /* ignore */ }
      const d = await fetchAdminAnalytics(token.trim());
      setData(d);
      lastAt.current = Date.now();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh loop (respects pause on the Live tab).
  useEffect(() => {
    if (!autoMs || !token) return;
    const id = window.setInterval(() => { if (!(tab === "live" && paused)) void load(); }, autoMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMs, token, tab, paused]);

  // 1s heartbeat so relative times + the countdown stay live.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  const openDrill = async (id: string) => {
    setDrillId(id);
    setDrill(null);
    setDrillErr(null);
    // On a throw the modal used to sit on "Loading…" forever, with setErr's text
    // rendering behind the backdrop. Keep the failure inside the modal.
    try {
      setDrill(await fetchSessionDetail(token.trim(), id));
    } catch (e) {
      setDrillErr((e as Error).message || "Request failed.");
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const header = ["email", "wallet", "ip", "city", "region", "country", "timezone", "isp", "clicks", "events", "first_seen", "last_seen", "user_agent"];
    const lines = data.sessions.map((s) => [s.email, s.wallet_address, s.ip, s.city, s.region, s.country, s.timezone, s.isp, s.total_clicks, s.total_events, s.first_seen, s.last_seen, s.user_agent].map(csvCell).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `idle-legion-players-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSessions = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    let rows = data.sessions;
    if (needle) rows = rows.filter((s) => [s.email, s.country, s.city, s.wallet_address, s.ip, s.isp].some((f) => (f ?? "").toLowerCase().includes(needle)));
    const dir = sortKey === "email" || sortKey === "country" ? 1 : -1;
    return [...rows].sort((a: any, b: any) => {
      const av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [data, q, sortKey]);

  const liveRows = useMemo(() => {
    if (!data) return [];
    return typeFilter === "all" ? data.recent : data.recent.filter((r) => r.type === typeFilter);
  }, [data, typeFilter]);

  const maxEvent = data?.topEvents[0]?.count ?? 0;
  const maxType = data?.byType[0]?.count ?? 0;
  const maxCountry = data?.byCountry[0]?.count ?? 0;
  const countUntil = autoMs ? Math.max(0, Math.ceil((lastAt.current + autoMs - Date.now()) / 1000)) : 0;

  return (
    <Section title="📡 Live telemetry · ALL users" count={data ? `${data.totals.onlineNow} live` : "🔒"} defaultOpen>
      {/* connection bar */}
      <div className="adm-row">
        <input
          type="password" className="adm-token" placeholder="admin token (x-admin-token)"
          value={token} onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
        />
        <button className="adm-btn hot" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : data ? "↻ Refresh" : "Connect"}
        </button>
        <select className="adm-mini-sel" value={autoMs} onChange={(e) => setAutoMs(Number(e.target.value))} title="Auto-refresh">
          <option value={0}>manual</option>
          <option value={5000}>5s</option>
          <option value={15000}>15s</option>
          <option value={30000}>30s</option>
        </select>
        {autoMs > 0 && data && <span className="adm-count-down">{countUntil}s</span>}
      </div>
      {err && <p className="adm-note warn">⚠ {err}</p>}

      {data && (
        <>
          {/* KPI tiles */}
          <div className="adm-kpis">
            <div className="adm-kpi live">
              <span className="adm-kpi-dot" /><b>{data.totals.onlineNow}</b><small>online now</small>
            </div>
            <div className="adm-kpi"><b>{num(data.totals.sessions)}</b><small>players</small></div>
            <div className="adm-kpi"><b>{num(data.totals.clicks)}</b><small>clicks</small></div>
            <div className="adm-kpi"><b>{num(data.totals.events)}</b><small>events</small></div>
            <div className="adm-kpi"><b>{num(data.totals.countries)}</b><small>countries</small></div>
            <div className="adm-kpi"><b>{fmtDur(data.totals.avgActiveSec)}</b><small>avg time</small></div>
          </div>

          {/* dashboard tabs */}
          <div className="adm-dtabs">
            {(["overview", "players", "live", "geo", "insights"] as DashTab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "overview" ? "📊 Overview" : t === "players" ? `👤 Players` : t === "live" ? "⏱ Live" : t === "geo" ? "🌍 Geo" : "📈 Insights"}
              </button>
            ))}
            <span className="adm-updated">updated {rel(data.generatedAt)}</span>
          </div>

          {tab === "overview" && (
            <>
              <h5 className="adm-h5">Activity · events / hour (24h)</h5>
              <ActivityChart series={data.series} />

              <div className="adm-two">
                <div>
                  <h5 className="adm-h5">🖱 Most-fired events</h5>
                  <BarList
                    max={maxEvent}
                    rows={data.topEvents.slice(0, 10).map((e) => ({ key: e.name, label: e.name, count: e.count, title: `${e.name} · ${e.count}` }))}
                  />
                </div>
                <div>
                  <h5 className="adm-h5">Event mix</h5>
                  <BarList
                    max={maxType}
                    rows={data.byType.map((e) => ({
                      key: e.type,
                      label: <span><i className="adm-swatch" style={{ background: etColor(e.type) }} />{e.type}</span>,
                      count: e.count,
                    }))}
                  />
                </div>
              </div>
            </>
          )}

          {tab === "players" && (
            <>
              <div className="adm-row">
                <input className="adm-token" placeholder="🔎 search email / country / wallet / ip…" value={q} onChange={(e) => setQ(e.target.value)} />
                <select className="adm-mini-sel" value={sortKey} onChange={(e) => setSortKey(e.target.value as any)}>
                  <option value="last_seen">recent</option>
                  <option value="total_clicks">clicks</option>
                  <option value="total_events">events</option>
                  <option value="email">email</option>
                  <option value="country">country</option>
                </select>
                <button className="adm-btn" onClick={exportCsv}>⬇ CSV</button>
              </div>
              <table className="adm-table adm-players">
                <thead><tr><th>Player</th><th>Location</th><th>Clicks</th><th>Time</th><th>Seen</th></tr></thead>
                <tbody>
                  {filteredSessions.map((s) => (
                    <tr key={s.session_id} className="adm-click-row" onClick={() => void openDrill(s.session_id)}
                        title={`${s.ip ?? "?"} · ${s.isp ?? ""}\n${s.visits} visit(s) · ${s.user_agent ?? ""}`}>
                      <td>
                        <div className="adm-pl-email">{s.email ?? <span className="adm-dim">anon player</span>}</div>
                        <div className="adm-dim adm-pl-sub">{s.wallet_address ? shortAddr(s.wallet_address) : s.session_id.slice(0, 12)}</div>
                      </td>
                      <td><Flag code={s.country_code} /> {[s.city, s.country].filter(Boolean).join(", ") || <span className="adm-dim">—</span>}</td>
                      <td>{s.total_clicks}</td>
                      <td title={`${s.visits} visit(s)`}>{fmtDur(s.active_seconds)}</td>
                      <td>{rel(s.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSessions.length === 0 && <p className="adm-note">No players match.</p>}
            </>
          )}

          {tab === "live" && (
            <>
              <div className="adm-row">
                <select className="adm-mini-sel" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">all types</option>
                  <option value="click">click</option>
                  <option value="action">action</option>
                  <option value="pageview">pageview</option>
                  <option value="session_start">session_start</option>
                  <option value="login">login</option>
                </select>
                <button className={`adm-btn ${paused ? "hot" : ""}`} onClick={() => setPaused((p) => !p)}>
                  {paused ? "▶ Resume" : "⏸ Pause"}
                </button>
                <span className="adm-dim adm-small">{liveRows.length} shown{autoMs ? "" : " · turn on auto-refresh"}</span>
              </div>
              <div className="adm-stream">
                {liveRows.map((r, i) => (
                  <div key={i} className="adm-stream-row">
                    <span className="adm-etype" style={{ color: etColor(r.type) }}>{r.type}</span>
                    <span className="adm-ename">{r.name}</span>
                    <span className="adm-dim adm-small"><Flag code={r.code} /> {r.email ?? r.city ?? r.session_id.slice(0, 8)}</span>
                    <span className="adm-dim adm-small">{rel(r.at)}</span>
                  </div>
                ))}
                {liveRows.length === 0 && <p className="adm-note">No events for this filter.</p>}
              </div>
            </>
          )}

          {tab === "geo" && (
            <>
              <h5 className="adm-h5">Players by country</h5>
              <BarList
                max={maxCountry}
                rows={data.byCountry.map((c) => ({ key: c.country, label: <span><Flag code={c.code} /> {c.country}</span>, count: c.count }))}
              />
            </>
          )}

          {tab === "insights" && (
            <>
              <h5 className="adm-h5">Conversion funnel</h5>
              <div className="adm-funnel">
                {data.funnel.map((f, i) => {
                  const prev = i > 0 ? data.funnel[i - 1].count : f.count;
                  const conv = prev > 0 ? Math.round((f.count / prev) * 100) : 0;
                  return (
                    <div key={f.key} className="adm-funnel-step">
                      <div className="adm-funnel-bar" style={{ width: `${Math.max(4, f.pct)}%` }}>
                        <span className="adm-funnel-n">{f.count}</span>
                      </div>
                      <div className="adm-funnel-meta">
                        <span className="adm-funnel-label">{f.label}</span>
                        <span className="adm-dim adm-small">{f.pct}% of all{i > 0 ? ` · ${conv}% from prev` : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="adm-two">
                <div>
                  <h5 className="adm-h5">Time by screen (avg / player)</h5>
                  <div className="adm-bars">
                    {data.screens.map((s) => {
                      const maxAvg = Math.max(1, ...data.screens.map((x) => x.avgSeconds));
                      return (
                        <div key={s.screen} className="adm-bar-row" title={`total ${fmtDur(s.seconds)} · ${s.sessions} player(s)`}>
                          <span className="adm-bar-label">{SCREEN_ICON[s.screen] ?? "•"} {s.screen}</span>
                          <span className="adm-bar-track"><i style={{ width: `${(s.avgSeconds / maxAvg) * 100}%`, background: "#ffc233" }} /></span>
                          <span className="adm-bar-n" style={{ fontSize: 10 }}>{fmtDur(s.avgSeconds)}</span>
                        </div>
                      );
                    })}
                    {data.screens.length === 0 && <p className="adm-note">No screen data yet.</p>}
                  </div>
                </div>
                <div>
                  <h5 className="adm-h5">Retention</h5>
                  <div className="adm-ret">
                    <div className="adm-ret-tile"><b>{data.retention.newPlayers}</b><small>new (1 visit)</small></div>
                    <div className="adm-ret-tile"><b>{data.retention.returningPlayers}</b><small>returning</small></div>
                    <div className="adm-ret-tile"><b>{data.retention.returningPct}%</b><small>return rate</small></div>
                    <div className="adm-ret-tile"><b>{data.retention.retainedPct}%</b><small>day-1 retention</small></div>
                  </div>
                  <p className="adm-note adm-dim adm-small">
                    Day-1 = of {data.retention.eligible24h} player(s) first seen &gt;24h ago, {data.retention.retained24h} came back in the last 24h.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* player drill-down */}
      {drillId && (
        <div className="adm-drill-backdrop" onClick={() => { setDrillId(null); setDrill(null); setDrillErr(null); }}>
          <div className="adm-drill" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{drill?.session?.email ?? "Player"} <span className="adm-dim adm-small"><Flag code={drill?.session?.country_code} /></span></h3>
              <button className="chip-btn" onClick={() => { setDrillId(null); setDrill(null); setDrillErr(null); }}>✕</button>
            </div>
            {drillErr ? (
              <p className="adm-note warn">⚠️ {drillErr}</p>
            ) : !drill ? (
              <p className="adm-note">Loading…</p>
            ) : (
              <>
                <div className="adm-grid">
                  <Stat k="Email" v={drill.session?.email ?? "—"} />
                  <Stat k="Wallet" v={shortAddr(drill.session?.wallet_address ?? null)} />
                  <Stat k="Location" v={[drill.session?.city, drill.session?.region, drill.session?.country].filter(Boolean).join(", ") || "—"} />
                  <Stat k="IP" v={drill.session?.ip ?? "—"} />
                  <Stat k="ISP" v={drill.session?.isp ?? "—"} />
                  <Stat k="Timezone" v={drill.session?.timezone ?? "—"} />
                  <Stat k="Total clicks" v={drill.session?.total_clicks ?? 0} />
                  <Stat k="Active time" v={fmtDur(drill.session?.active_seconds)} />
                  <Stat k="Visits" v={drill.session?.visits ?? 0} />
                  <Stat k="Last visit" v={fmtDur(drill.session?.last_visit_seconds)} />
                  <Stat k="Logged in" v={drill.session?.last_login ? new Date(drill.session.last_login).toLocaleString() : "never"} />
                  <Stat k="First seen" v={drill.session?.first_seen ? new Date(drill.session.first_seen).toLocaleString() : "—"} />
                </div>
                <p className="adm-note adm-dim adm-small">{drill.session?.user_agent}</p>

                {drill.screenTime.length > 0 && (
                  <>
                    <h5 className="adm-h5">⏳ Time by screen</h5>
                    <div className="adm-bars">
                      {drill.screenTime.map((s) => {
                        const mx = Math.max(1, ...drill.screenTime.map((x) => x.seconds));
                        return (
                          <div key={s.screen} className="adm-bar-row">
                            <span className="adm-bar-label">{SCREEN_ICON[s.screen] ?? "•"} {s.screen}</span>
                            <span className="adm-bar-track"><i style={{ width: `${(s.seconds / mx) * 100}%`, background: "#ffc233" }} /></span>
                            <span className="adm-bar-n" style={{ fontSize: 10 }}>{fmtDur(s.seconds)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                <h5 className="adm-h5">🖱 Buttons clicked ({drill.buttonCounts.length})</h5>
                <BarList
                  max={drill.buttonCounts[0]?.count ?? 0}
                  rows={drill.buttonCounts.slice(0, 15).map((b) => ({
                    key: b.name,
                    label: <span><i className="adm-swatch" style={{ background: etColor(b.type) }} />{b.name}</span>,
                    count: b.count,
                  }))}
                />

                <h5 className="adm-h5">Event history ({drill.events.length})</h5>
                <div className="adm-stream adm-drill-stream">
                  {drill.events.map((ev, i) => (
                    <div key={i} className="adm-stream-row">
                      <span className="adm-etype" style={{ color: etColor(ev.event_type) }}>{ev.event_type}</span>
                      <span className="adm-ename">{ev.event_name}</span>
                      <span className="adm-dim adm-small">{rel(ev.created_at)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <p className="adm-note adm-dim adm-small">This device's session id: {currentSessionId().slice(0, 13)}…</p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Self-test suite
// ---------------------------------------------------------------------------

function SelfTestSection() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [only, setOnly] = useState<string | null>(null);
  const [openFail, setOpenFail] = useState(true);
  // Guards setState from landing after the panel closes. It MUST be re-armed on
  // mount, not just cleared on unmount: StrictMode double-invokes effects in dev
  // (mount → unmount → remount), so a cleanup-only ref stays false forever and
  // every result is silently dropped.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const all = useMemo(() => listTests(), []);
  const total = only ? all.filter((c) => c.group === only).length : all.length;

  const run = async (group: string | null) => {
    if (running) return;
    setRunning(true);
    setOnly(group);
    setResults([]);
    try {
      await runTests({
        groups: group ? [group] : undefined,
        onResult: (r) => { if (alive.current) setResults((prev) => [...prev, r]); },
      });
    } catch (err) {
      if (alive.current) {
        setResults((prev) => [...prev, {
          id: "runner", name: "test runner", group: "runner", status: "fail", ms: 0,
          detail: err instanceof Error ? err.message : String(err),
        }]);
      }
    } finally {
      if (alive.current) setRunning(false);
    }
  };

  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const shown = openFail && fail > 0 ? results.filter((r) => r.status !== "pass") : results;

  const badge = running
    ? `${results.length}/${total}…`
    : results.length === 0
      ? `${all.length} tests`
      : fail > 0 ? `${fail} FAILED` : `${pass} passed`;

  return (
    <Section title="🧪 Self-tests" count={badge} defaultOpen={false}>
      <div className="adm-cheats">
        <button className="adm-btn hot" disabled={running} onClick={() => run(null)}>
          {running ? "Running…" : "Run all"}
        </button>
        {TEST_GROUPS.map((g) => (
          <button key={g} className="adm-btn" disabled={running} onClick={() => run(g)}>{g}</button>
        ))}
      </div>

      {results.length > 0 && (
        <>
          <div className="adm-grid">
            <Stat k="Passed" v={pass} />
            <Stat k="Failed" v={fail} warn={fail > 0} />
            <Stat k="Skipped" v={skip} />
            <Stat k="Time" v={`${results.reduce((a, r) => a + r.ms, 0).toFixed(0)} ms`} />
          </div>
          {fail > 0 && (
            <p className="adm-note adm-small">
              <label>
                <input type="checkbox" checked={openFail} onChange={(e) => setOpenFail(e.target.checked)} />
                {" "}hide passing tests
              </label>
            </p>
          )}
        </>
      )}

      <table className="adm-table">
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td style={{ width: 22 }}>
                {r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⏭️"}
              </td>
              <td>
                <div>{r.name}</div>
                {r.detail && (
                  <div className={r.status === "fail" ? "adm-fail-detail" : "adm-dim adm-small"}>
                    {r.detail}
                  </div>
                )}
              </td>
              <td className="adm-dim adm-small" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {r.group} · {r.ms.toFixed(0)}ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {results.length === 0 && !running && (
        <p className="adm-note adm-dim adm-small">
          Runs against this live browser — real saves, real WebGL, real asset URLs.
          Save tests park your save and restore it when they finish.
        </p>
      )}
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

        {/* ---- in-browser test suite ---- */}
        <SelfTestSection />

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
