// Client-side telemetry for Idle Legion.
// Buffers click/action events and flushes them in batches to the InsForge
// `track` edge function, which geolocates the request IP and stores everything.
// A stable per-browser session id ties a player's events together across visits.
//
// Privacy note: this reports the player's email (once they connect a wallet),
// approximate location (derived server-side from IP), and every click. If you
// ship this to real users you owe them a notice + consent — see the README.

const BASE = (import.meta.env.VITE_INSFORGE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const SESSION_KEY = "idle-legion-session-id";
const FLUSH_MS = 5000;
const MAX_BATCH = 40;

export interface TrackEvent {
  name: string;
  type: "click" | "action" | "pageview" | "session_start";
  ts: number;
  meta?: Record<string, unknown>;
}

let sessionId = "";
let email: string | null = null;
let walletAddress: string | null = null;
let queue: TrackEvent[] = [];
let timer: number | null = null;
let started = false;

function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
      localStorage.setItem(SESSION_KEY, id);
    }
    sessionId = id;
  } catch {
    sessionId = `s-${Date.now()}`;
  }
  return sessionId;
}

export function currentSessionId(): string {
  return getSessionId();
}

// Attach the player's identity — sent with every subsequent flush.
export function identify(next: { email?: string | null; walletAddress?: string | null }) {
  if (next.email !== undefined) email = next.email;
  if (next.walletAddress !== undefined) walletAddress = next.walletAddress;
}

export function track(name: string, type: TrackEvent["type"] = "click", meta?: Record<string, unknown>) {
  if (!name) return;
  queue.push({ name: name.slice(0, 200), type, ts: Date.now(), meta });
  if (queue.length >= MAX_BATCH) void flush();
}

export async function flush(useBeacon = false): Promise<void> {
  if (!BASE || queue.length === 0) return;
  const batch = queue;
  queue = [];
  const payload = JSON.stringify({
    sessionId: getSessionId(),
    email,
    walletAddress,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    events: batch,
  });
  const url = `${BASE}/functions/track`;
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: useBeacon,
    });
  } catch {
    // Best-effort: re-queue so a transient failure doesn't lose the batch.
    queue = batch.concat(queue).slice(-200);
  }
}

// Derive a readable label for a clicked control.
function labelFor(el: Element): string {
  const btn = el.closest("button, a, [role='button']") as HTMLElement | null;
  if (!btn) return "";
  const title = btn.getAttribute("title");
  const aria = btn.getAttribute("aria-label");
  const text = (btn.textContent ?? "").replace(/\s+/g, " ").trim();
  const label = (aria || title || text || btn.tagName.toLowerCase()).slice(0, 80);
  return label;
}

// Install the global listeners + periodic flush. Safe to call once.
export function initTelemetry() {
  if (started || !BASE) return;
  started = true;
  getSessionId();

  track("session_start", "session_start", {
    ua: navigator.userAgent,
    lang: navigator.language,
    screen: `${window.screen?.width}x${window.screen?.height}`,
    referrer: document.referrer || null,
  });
  track(location.pathname || "/", "pageview");

  // Delegated click capture — every button/link the player taps, by label.
  document.addEventListener(
    "click",
    (e) => {
      const label = labelFor(e.target as Element);
      if (label) track(`click:${label}`, "click");
    },
    { capture: true },
  );

  timer = window.setInterval(() => void flush(), FLUSH_MS);

  // Don't lose the tail when the tab closes.
  const finalFlush = () => void flush(true);
  window.addEventListener("pagehide", finalFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finalFlush();
  });
}

export function stopTelemetry() {
  if (timer != null) window.clearInterval(timer);
  timer = null;
  started = false;
}

// ---- admin dashboard read (token-gated) ----

export interface PlayerSession {
  session_id: string;
  email: string | null;
  wallet_address: string | null;
  ip: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  isp: string | null;
  user_agent: string | null;
  total_events: number;
  total_clicks: number;
  first_seen: string;
  last_seen: string;
}

export interface AdminAnalytics {
  totals: { sessions: number; events: number; clicks: number; countries: number; onlineNow: number };
  series: Array<{ t: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  topEvents: Array<{ name: string; count: number }>;
  byCountry: Array<{ country: string; count: number; code: string | null }>;
  sessions: PlayerSession[];
  recent: Array<{ name: string; type: string; at: string; email: string | null; city: string | null; country: string | null; code: string | null; session_id: string }>;
  generatedAt: string;
}

export interface SessionDetail {
  session: PlayerSession | null;
  events: Array<{ event_name: string; event_type: string; created_at: string; meta: Record<string, unknown> | null }>;
}

async function adminPost(token: string, body: Record<string, unknown>) {
  if (!BASE) throw new Error("VITE_INSFORGE_URL not configured");
  const res = await fetch(`${BASE}/functions/admin-analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": token },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("Bad admin token");
  if (!res.ok) throw new Error(`Dashboard read failed (${res.status})`);
  return res.json();
}

export function fetchAdminAnalytics(token: string): Promise<AdminAnalytics> {
  return adminPost(token, {});
}

export function fetchSessionDetail(token: string, sessionId: string): Promise<SessionDetail> {
  return adminPost(token, { sessionId }).then((r) => r.sessionDetail);
}
