// Public telemetry ingest for Idle Legion.
// The client POSTs a batch of events + its identity. We geolocate the request IP
// server-side (the client can't see or spoof it), upsert the session row, and
// append the events. Writes use the admin key, bypassing the tables' locked RLS.
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Pull the real client IP out of the proxy headers.
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

function isPrivate(ip: string): boolean {
  return (
    !ip ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("::ffff:127.")
  );
}

// Free, keyless geo-IP. Best-effort: never let a geo failure drop the event.
async function geolocate(ip: string) {
  if (isPrivate(ip)) return null;
  try {
    const r = await fetch(`https://ipwho.is/${ip}`, {
      signal: AbortSignal.timeout(2500),
    });
    const g = await r.json();
    if (!g?.success) return null;
    return {
      country: g.country ?? null,
      country_code: g.country_code ?? null,
      region: g.region ?? null,
      city: g.city ?? null,
      latitude: typeof g.latitude === "number" ? g.latitude : null,
      longitude: typeof g.longitude === "number" ? g.longitude : null,
      timezone: g.timezone?.id ?? null,
      isp: g.connection?.isp ?? g.connection?.org ?? null,
    };
  } catch {
    return null;
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const sessionId = String(body.sessionId || "").slice(0, 64);
  if (!sessionId) return json({ error: "sessionId required" }, 400);

  const events: any[] = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
  const email = body.email ? String(body.email).slice(0, 320) : null;
  const wallet = body.walletAddress ? String(body.walletAddress).slice(0, 128) : null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;
  const clientTz = body.timezone ? String(body.timezone).slice(0, 64) : null;

  // Engagement time reported by the client this flush (active/tab-focused only).
  // Clamp defensively so a bad clock can't inject a huge span.
  const deltaSec = Math.min(3600, Math.max(0, Number(body.activeMs) / 1000 || 0));
  const newVisit = body.newVisit === true;
  // A login event in the batch stamps last_login.
  const loginEvent = events.find((e) => e?.type === "login");
  const loginTs = loginEvent ? new Date(loginEvent.ts ?? Date.now()).toISOString() : null;

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  const ip = clientIp(req);
  const geo = await geolocate(ip);
  const nowIso = new Date().toISOString();
  const clicks = events.filter((e) => (e?.type ?? "click") === "click").length;

  // Fetch prior rollups so first_seen and running totals survive.
  const { data: prior } = await admin.database
    .from("analytics_sessions")
    .select("total_events,total_clicks,first_seen,active_seconds,visits,last_visit_seconds,last_login")
    .eq("session_id", sessionId)
    .maybeSingle();

  const sessionRow: Record<string, unknown> = {
    session_id: sessionId,
    last_seen: nowIso,
    total_events: (prior?.total_events ?? 0) + events.length,
    total_clicks: (prior?.total_clicks ?? 0) + clicks,
    user_agent: userAgent,
    ip: ip || null,
    timezone: geo?.timezone ?? clientTz,
    // engagement rollups
    active_seconds: (prior?.active_seconds ?? 0) + deltaSec,
    visits: (prior?.visits ?? 0) + (newVisit || !prior ? 1 : 0),
    last_visit_seconds: newVisit ? deltaSec : (prior?.last_visit_seconds ?? 0) + deltaSec,
    last_login: loginTs ?? prior?.last_login ?? null,
    ...(prior ? {} : { first_seen: nowIso }),
    ...(email ? { email } : {}),
    ...(wallet ? { wallet_address: wallet } : {}),
    ...(geo ?? {}),
  };

  const { error: upErr } = await admin.database
    .from("analytics_sessions")
    .upsert([sessionRow], { onConflict: "session_id" });
  if (upErr) return json({ error: "session upsert failed", detail: upErr.message }, 500);

  if (events.length) {
    const rows = events.map((e) => ({
      session_id: sessionId,
      event_name: String(e?.name ?? "unknown").slice(0, 200),
      event_type: String(e?.type ?? "click").slice(0, 40),
      meta: e?.meta ?? null,
      created_at: e?.ts ? new Date(e.ts).toISOString() : nowIso,
    }));
    const { error: evErr } = await admin.database.from("analytics_events").insert(rows);
    if (evErr) return json({ error: "event insert failed", detail: evErr.message }, 500);
  }

  return json({ ok: true, ingested: events.length, geo: geo ? `${geo.city ?? "?"}, ${geo.country ?? "?"}` : null });
}
