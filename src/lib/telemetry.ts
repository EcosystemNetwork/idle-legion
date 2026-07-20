// Client-side telemetry for Idle Legion.
// Buffers click/action events and flushes them in batches to the InsForge
// `track` edge function, which geolocates the request IP and stores everything.
// A stable per-browser session id ties a player's events together across visits.
//
// Privacy: analytics are pseudonymous by default — a random session id, the
// timezone, engagement time and click labels. Email/wallet are NEVER sent
// unless the player explicitly opts in (localStorage `idle-legion-analytics-pii`
// = "on"). Do Not Track and Global Privacy Control are honoured as a hard no,
// and players can opt out entirely (`idle-legion-analytics` = "off").
// Note the server still observes the request IP and geolocates it — disclose
// that to players. See README.

const BASE = (import.meta.env.VITE_INSFORGE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const SESSION_KEY = "idle-legion-session-id";
const OPTOUT_KEY = "idle-legion-analytics"; // "off" = player opted out
const PII_KEY = "idle-legion-analytics-pii"; // "on" = allow identity fields
const FLUSH_MS = 5000;
const MAX_BATCH = 40;
/** A stalled network must not park a fetch forever — see flush(). */
const FLUSH_TIMEOUT_MS = 8000;
/** Hard ceiling on the live queue so a long offline stretch can't grow it. */
const MAX_QUEUE = 500;

// trackingAllowed() runs on every tracked click and hits localStorage, which is
// synchronous and main-thread. Nothing it reads changes except through
// setAnalyticsOptOut, so the answer is memoized and invalidated there.
let allowedCache: boolean | null = null;

/**
 * Honour browser privacy signals and an explicit opt-out. Do Not Track and
 * Global Privacy Control are respected as a hard "no" — nothing is queued,
 * nothing is sent.
 */
export function trackingAllowed(): boolean {
  if (allowedCache === null) allowedCache = computeTrackingAllowed();
  return allowedCache;
}

function computeTrackingAllowed(): boolean {
  if (!BASE) return false;
  try {
    const nav = navigator as Navigator & {
      globalPrivacyControl?: boolean;
      msDoNotTrack?: string;
    };
    const win = window as Window & { doNotTrack?: string };
    if (nav.globalPrivacyControl === true) return false;
    if (nav.doNotTrack === "1" || win.doNotTrack === "1" || nav.msDoNotTrack === "1") return false;
    if (localStorage.getItem(OPTOUT_KEY) === "off") return false;
  } catch {
    /* storage unavailable — fall through to allowed */
  }
  return true;
}

/** Identity fields (email / wallet) are never sent unless explicitly enabled. */
function piiAllowed(): boolean {
  try {
    return localStorage.getItem(PII_KEY) === "on";
  } catch {
    return false;
  }
}

export function analyticsOptedOut(): boolean {
  try {
    return localStorage.getItem(OPTOUT_KEY) === "off";
  } catch {
    return false;
  }
}

/** Player-facing opt-out. Stops the timer and drops anything already queued. */
export function setAnalyticsOptOut(off: boolean) {
  try {
    localStorage.setItem(OPTOUT_KEY, off ? "off" : "on");
  } catch {
    /* ignore */
  }
  allowedCache = null; // the memoized answer just changed
  if (off) {
    queue = [];
    pendingActiveMs = 0;
    pendingScreenMs = {};
    stopTelemetry();
  }
}

export interface TrackEvent {
  name: string;
  type: "click" | "action" | "pageview" | "session_start" | "login";
  ts: number;
  meta?: Record<string, unknown>;
}

let sessionId = "";
let email: string | null = null;
let walletAddress: string | null = null;
let queue: TrackEvent[] = [];
let timer: number | null = null;
let started = false;
let loggedIn = false;

// Engagement (active-time) tracking — only counts while the tab is visible.
let activeStart = 0;        // ms timestamp the current focused stretch began (0 = not active)
let pendingActiveMs = 0;    // active ms accumulated since the last flush
let newVisitPending = false; // true until the first flush of this page load lands
let currentScreen = "stronghold";              // which tab/screen the player is on
let pendingScreenMs: Record<string, number> = {}; // active ms per screen since last flush

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
  if (!name || !trackingAllowed()) return;
  queue.push({ name: name.slice(0, 200), type, ts: Date.now(), meta });
  // Offline/blocked players keep clicking; drop the oldest rather than grow
  // without bound (the re-queue path in flush() is capped the same way).
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= MAX_BATCH) void flush();
}

// Fire a one-time login event the first time the player authenticates.
export function markLogin(nextEmail: string | null, wallet: string | null) {
  identify({ email: nextEmail, walletAddress: wallet });
  if (loggedIn) return;
  loggedIn = true;
  // Never leak identity through event meta — that would bypass the payload
  // gate above. Only record THAT a login happened unless PII is opted in.
  track("login", "login", piiAllowed() ? { email: nextEmail, wallet } : undefined);
  void flush();
}

// Roll the currently-open active stretch into the pending accumulators
// (total engagement + the current screen's dwell).
function harvestActive() {
  if (activeStart) {
    const delta = Date.now() - activeStart;
    pendingActiveMs += delta;
    pendingScreenMs[currentScreen] = (pendingScreenMs[currentScreen] ?? 0) + delta;
    activeStart = document.visibilityState === "visible" ? Date.now() : 0;
  }
}

// Tell telemetry which screen/tab the player switched to. Banks the dwell on the
// previous screen before switching so per-screen time stays accurate.
export function setScreen(name: string) {
  if (name === currentScreen) return;
  harvestActive();
  currentScreen = name;
}

// Only one network flush is allowed in flight. track() calls flush() every 40
// events, so on a stalled connection the old code piled up hung requests that
// head-of-line-blocked the same origin — which also stalled cloud saves.
let flushing = false;

export async function flush(useBeacon = false): Promise<void> {
  harvestActive();
  // Always flush when there's engagement time to report, even with no events.
  if (!trackingAllowed() || (queue.length === 0 && pendingActiveMs < 1000)) return;
  // The pagehide flush must go out even mid-flush, so it bypasses the guard;
  // only ordinary flushes are serialised.
  if (flushing && !useBeacon) return;
  const batch = queue;
  queue = [];
  const activeMs = pendingActiveMs;
  pendingActiveMs = 0;
  const screens = pendingScreenMs;
  pendingScreenMs = {};
  const isNewVisit = newVisitPending;
  newVisitPending = false;
  const payload = JSON.stringify({
    sessionId: getSessionId(),
    // Identity is opt-in only. By default a session is pseudonymous: no email,
    // no wallet address. (The server still sees the request IP — see README.)
    ...(piiAllowed() ? { email, walletAddress } : {}),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    activeMs,
    screens,
    newVisit: isNewVisit,
    events: batch,
  });
  const url = `${BASE}/functions/track`;
  // NOT sendBeacon, deliberately. A beacon is always sent with credentials mode
  // "include", and the ingest gateway answers with `Access-Control-Allow-Origin: *`
  // alongside `Access-Control-Allow-Credentials: true` — a pairing CORS forbids, so
  // the browser drops every beacon response and the pagehide batch never lands. The
  // gateway rewrites that header itself, so the function can't opt out of the
  // wildcard; an uncredentialed keepalive fetch is what we control. `keepalive`
  // gives us the same survives-the-unload guarantee (64KB cap, and a batch is
  // capped at 200 events well under it).
  // The pagehide flush skipped the guard above, so it must not own the flag
  // either — clearing it on the way out would un-serialise a flush still in
  // flight beside it.
  if (!useBeacon) flushing = true;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: useBeacon,
      credentials: "omit",
      // Without this a stalled socket never settles the promise and the batch
      // (plus its engagement time) is stuck forever. On the pagehide path there is
      // no one left to await the result, and arming a timer against a document
      // that's going away can abort an otherwise-deliverable keepalive request.
      signal: useBeacon ? undefined : AbortSignal.timeout(FLUSH_TIMEOUT_MS),
    });
  } catch {
    // Best-effort: re-queue so a transient failure doesn't lose the batch.
    queue = batch.concat(queue).slice(-200);
  } finally {
    if (!useBeacon) flushing = false;
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
  if (started || !trackingAllowed()) return;
  started = true;
  getSessionId();
  newVisitPending = true;
  activeStart = document.visibilityState === "visible" ? Date.now() : 0;

  track("session_start", "session_start", {
    ua: navigator.userAgent,
    lang: navigator.language,
    screen: `${window.screen?.width}x${window.screen?.height}`,
    referrer: document.referrer || null,
  });
  track(location.pathname || "/", "pageview");

  // Delegated click capture — every button/link the player taps, by label.
  document.addEventListener("click", onDocClick, { capture: true });

  timer = window.setInterval(() => void flush(), FLUSH_MS);

  // Don't lose the tail when the tab closes.
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

// Handler refs live at module scope so stopTelemetry can actually remove them.
// stopTelemetry clears `started`, so without this a re-init (opt out, opt back
// in) would stack a second click listener and double-count every click.
function onDocClick(e: Event) {
  const label = labelFor(e.target as Element);
  if (label) track(`click:${label}`, "click");
}

function onPageHide() {
  void flush(true);
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    harvestActive();     // bank the active stretch that just ended
    activeStart = 0;     // pause the engagement clock while hidden
    void flush(true);
  } else {
    activeStart = Date.now(); // resume on refocus
  }
}

export function stopTelemetry() {
  if (timer != null) window.clearInterval(timer);
  timer = null;
  started = false;
  document.removeEventListener("click", onDocClick, { capture: true });
  window.removeEventListener("pagehide", onPageHide);
  document.removeEventListener("visibilitychange", onVisibilityChange);
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
  active_seconds: number;
  visits: number;
  last_visit_seconds: number;
  last_login: string | null;
}

export interface FunnelStep { key: string; label: string; count: number; pct: number }
export interface ScreenStat { screen: string; seconds: number; sessions: number; avgSeconds: number }
export interface Retention {
  newPlayers: number; returningPlayers: number; returningPct: number;
  eligible24h: number; retained24h: number; retainedPct: number;
}

export interface AdminAnalytics {
  totals: { sessions: number; events: number; clicks: number; countries: number; onlineNow: number; avgActiveSec: number };
  series: Array<{ t: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  topEvents: Array<{ name: string; count: number }>;
  byCountry: Array<{ country: string; count: number; code: string | null }>;
  screens: ScreenStat[];
  funnel: FunnelStep[];
  retention: Retention;
  sessions: PlayerSession[];
  recent: Array<{ name: string; type: string; at: string; email: string | null; city: string | null; country: string | null; code: string | null; session_id: string }>;
  generatedAt: string;
}

export interface SessionDetail {
  session: PlayerSession | null;
  events: Array<{ event_name: string; event_type: string; created_at: string; meta: Record<string, unknown> | null }>;
  buttonCounts: Array<{ name: string; type: string; count: number }>;
  screenTime: Array<{ screen: string; seconds: number }>;
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
