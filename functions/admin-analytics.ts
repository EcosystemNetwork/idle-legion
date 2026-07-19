// Admin-only telemetry dashboard read.
// Gated by the ADMIN_DASH_TOKEN secret (sent as `x-admin-token`) because the
// client is a static site with no per-user auth — this shared secret is what
// keeps raw customer data (emails, IPs, cities) out of ordinary players' hands.
// Reads use the admin key to see across every session, bypassing locked RLS.
//
// Two modes:
//   POST {}                    -> full overview (KPIs, series, aggregates, sessions)
//   POST { sessionId: "..." }  -> drill-down: one player's row + recent events
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const HOUR = 3600_000;
const ONLINE_MS = 120_000; // last-seen within 2 min = "online now"

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const expected = Deno.env.get("ADMIN_DASH_TOKEN");
  const given = req.headers.get("x-admin-token");
  if (!expected || given !== expected) return json({ error: "unauthorized" }, 401);

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body = overview */ }

  // ---- drill-down: one player's full picture ----
  if (body?.sessionId) {
    const sid = String(body.sessionId).slice(0, 64);
    const { data: session } = await admin.database
      .from("analytics_sessions").select("*").eq("session_id", sid).maybeSingle();
    const { data: events = [] } = await admin.database
      .from("analytics_events")
      .select("event_name,event_type,created_at,meta")
      .eq("session_id", sid)
      .order("created_at", { ascending: false })
      .limit(1000);
    // Per-player button breakdown: "this player clicked X ×N".
    const counts = new Map<string, { name: string; type: string; count: number }>();
    for (const e of events as any[]) {
      const cur = counts.get(e.event_name);
      if (cur) cur.count++;
      else counts.set(e.event_name, { name: e.event_name, type: e.event_type, count: 1 });
    }
    const buttonCounts = [...counts.values()].sort((a, b) => b.count - a.count);
    const { data: screenTime = [] } = await admin.database
      .from("analytics_screen_time").select("screen,seconds").eq("session_id", sid).order("seconds", { ascending: false });
    return json({ sessionDetail: { session, events, buttonCounts, screenTime } });
  }

  // ---- overview ----
  const { data: sessions = [], error: sErr } = await admin.database
    .from("analytics_sessions")
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(1000);
  if (sErr) return json({ error: "sessions read failed", detail: sErr.message }, 500);

  const { data: events = [], error: eErr } = await admin.database
    .from("analytics_events")
    .select("id,session_id,event_name,event_type,created_at")
    .order("created_at", { ascending: false })
    .limit(8000);
  if (eErr) return json({ error: "events read failed", detail: eErr.message }, 500);

  const sList = sessions as any[];
  const eList = events as any[];
  const sById = new Map(sList.map((s) => [s.session_id, s]));
  const now = Date.now();

  // Click leaderboard: how many times each thing is clicked, across ALL users.
  const nameCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  for (const e of eList) {
    nameCount.set(e.event_name, (nameCount.get(e.event_name) ?? 0) + 1);
    typeCount.set(e.event_type, (typeCount.get(e.event_type) ?? 0) + 1);
  }
  const topEvents = [...nameCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const byType = [...typeCount.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  // 24h activity series — one bucket per hour, zero-filled.
  const buckets: { t: string; count: number }[] = [];
  const startHour = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
  const idx = new Map<number, number>();
  for (let i = 0; i < 24; i++) {
    const t = startHour + i * HOUR;
    idx.set(t, i);
    buckets.push({ t: new Date(t).toISOString(), count: 0 });
  }
  for (const e of eList) {
    const bt = Math.floor(new Date(e.created_at).getTime() / HOUR) * HOUR;
    const i = idx.get(bt);
    if (i !== undefined) buckets[i].count++;
  }

  // Geography.
  const countryCount = new Map<string, number>();
  const ccByCountry = new Map<string, string>();
  for (const s of sList) {
    const key = s.country || "Unknown";
    countryCount.set(key, (countryCount.get(key) ?? 0) + 1);
    if (s.country_code) ccByCountry.set(key, s.country_code);
  }
  const byCountry = [...countryCount.entries()]
    .map(([country, count]) => ({ country, count, code: ccByCountry.get(country) ?? null }))
    .sort((a, b) => b.count - a.count);

  const onlineNow = sList.filter((s) => s.last_seen && now - new Date(s.last_seen).getTime() < ONLINE_MS).length;

  // Average active engagement time across players who have any recorded time.
  const engaged = sList.filter((s) => (s.active_seconds ?? 0) > 0);
  const avgActiveSec = engaged.length
    ? engaged.reduce((a, s) => a + (s.active_seconds ?? 0), 0) / engaged.length
    : 0;

  // Per-screen dwell time across all players.
  const { data: screenRows = [] } = await admin.database
    .from("analytics_screen_time").select("session_id,screen,seconds").limit(20000);
  const scAgg = new Map<string, { seconds: number; sessions: Set<string> }>();
  for (const r of screenRows as any[]) {
    const cur = scAgg.get(r.screen) ?? { seconds: 0, sessions: new Set<string>() };
    cur.seconds += r.seconds ?? 0;
    cur.sessions.add(r.session_id);
    scAgg.set(r.screen, cur);
  }
  const screens = [...scAgg.entries()]
    .map(([screen, v]) => ({ screen, seconds: Math.round(v.seconds), sessions: v.sessions.size, avgSeconds: Math.round(v.seconds / v.sessions.size) }))
    .sort((a, b) => b.seconds - a.seconds);

  // Conversion funnel — count distinct sessions that reached each step.
  // Steps match on the click-label substring (labels carry dynamic cost text).
  const STEPS = [
    { key: "visited", label: "Visited the game", test: (_n: string, _t: string) => true },
    { key: "recruited", label: "Recruited a gladiator", test: (n: string) => /recruit/i.test(n) },
    { key: "fought", label: "Fought the boss", test: (n: string) => /fight/i.test(n) },
    { key: "raided", label: "Launched a raid", test: (n: string) => /march|raid/i.test(n) },
  ];
  const stepHits = STEPS.map(() => new Set<string>());
  for (const e of eList) {
    for (let i = 1; i < STEPS.length; i++) if (STEPS[i].test(e.event_name, e.event_type)) stepHits[i].add(e.session_id);
  }
  const totalSessions = sList.length || 1;
  const funnel = STEPS.map((s, i) => {
    const count = i === 0 ? sList.length : stepHits[i].size;
    return { key: s.key, label: s.label, count, pct: Math.round((count / totalSessions) * 100) };
  });

  // New vs returning + next-day retention.
  const returningPlayers = sList.filter((s) => (s.visits ?? 0) > 1).length;
  const newPlayers = sList.length - returningPlayers;
  const dayAgo = now - 86400_000;
  const eligible = sList.filter((s) => s.first_seen && new Date(s.first_seen).getTime() < dayAgo);
  const retained = eligible.filter((s) => s.last_seen && new Date(s.last_seen).getTime() >= dayAgo).length;
  const retention = {
    newPlayers, returningPlayers,
    returningPct: Math.round((returningPlayers / totalSessions) * 100),
    eligible24h: eligible.length, retained24h: retained,
    retainedPct: eligible.length ? Math.round((retained / eligible.length) * 100) : 0,
  };

  const recent = eList.slice(0, 80).map((e) => {
    const s = sById.get(e.session_id);
    return {
      name: e.event_name, type: e.event_type, at: e.created_at,
      email: s?.email ?? null, city: s?.city ?? null, country: s?.country ?? null,
      code: s?.country_code ?? null, session_id: e.session_id,
    };
  });

  return json({
    totals: {
      sessions: sList.length,
      events: eList.length,
      clicks: typeCount.get("click") ?? 0,
      countries: byCountry.filter((c) => c.country !== "Unknown").length,
      onlineNow,
      avgActiveSec: Math.round(avgActiveSec),
    },
    series: buckets,
    byType,
    topEvents,
    byCountry,
    screens,
    funnel,
    retention,
    sessions: sList,
    recent,
    generatedAt: new Date().toISOString(),
  });
}
