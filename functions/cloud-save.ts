// Per-player cloud save for Idle Legion.
// The client POSTs its full game state keyed by a stable player identity; we
// mirror it to Postgres so progress survives a cleared cache and roams across
// devices for a signed-in player. Two ops:
//   { op: "load", playerKey }                 → { found, state, savedAt }
//   { op: "save", playerKey, state, savedAt } → { ok, savedAt }
//
// Writes use the admin key, bypassing the table's locked RLS. Ordering is
// last-write-wins by the client-supplied `savedAt` (ms): a save older than what
// we already hold is ignored, so a device that has been offline can't stomp
// fresher progress written elsewhere.
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** Upper bounds for a plausible save. Generous — this catches the absurd, not the
 *  merely lucky. */
const CEIL: Record<string, number> = {
  gold: 1e15,
  legion: 1e12,
  provisions: 1e12,
  salves: 1e9,
  lunchboxes: 1e6,
  renown: 1e6,
  descents: 1e5,
  // Paid-tier fields: these drive the mercenary boost and the "funded" badge, so
  // an unbounded forgery here is the one that would read as real spend.
  warChestUsd: 1e7,
  mercenaryBoost: 100,
  totalGoldEarned: 1e15,
};

function finiteInRange(v: unknown, max: number): boolean {
  if (v == null) return true; // absent is fine (older saves / optional fields)
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max;
}

/** Returns a reason string when the state is implausible, else null. */
function validateState(s: Record<string, unknown>): string | null {
  for (const [key, max] of Object.entries(CEIL)) {
    if (!finiteInRange(s[key], max)) return `${key} out of range`;
  }
  if (Array.isArray(s.dwellers) && s.dwellers.length > 500) return "roster too large";
  if (Array.isArray(s.gear) && s.gear.length > 5_000) return "armory too large";
  if (Array.isArray(s.land) && s.land.length > 64) return "too many parcels";
  const bank = s.bank as Record<string, unknown> | undefined;
  if (bank && !finiteInRange(bank.staked, CEIL.legion)) return "bank.staked out of range";
  return null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Guard against a runaway payload — a legit save is a few KB of jsonb.
const MAX_STATE_BYTES = 512 * 1024;

// ---- session-token verification (issued by the `auth` function) --------------

/**
 * Keys that name a real-world identity, and are therefore guessable by anyone
 * who knows the player's email or address. These require proof; anonymous
 * `device:<random>` keys do not (nothing to guess).
 */
function isIdentityKey(key: string): boolean {
  return /^(email|wallet|magic):/i.test(key);
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Constant-time-ish compare so a token can't be brute-forced byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify `<b64url(json)>.<hmac>` against the server secret. Null = not valid. */
async function verifyToken(token: string): Promise<{ sub: string; exp: number } | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const secret = Deno.env.get("API_KEY") ?? "";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (!safeEqual(expected, sig)) return null;
    const claim = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (typeof claim?.sub !== "string" || typeof claim?.exp !== "number") return null;
    if (Date.now() > claim.exp) return null; // expired
    return { sub: claim.sub, exp: claim.exp };
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

  const op = String(body.op || "");
  const playerKey = String(body.playerKey || "").slice(0, 200);
  if (!playerKey) return json({ error: "playerKey required" }, 400);

  // ---- AUTHORISATION ---------------------------------------------------------
  // Identity-shaped keys (`email:` / `wallet:` / `magic:`) are GUESSABLE, and this
  // handler runs with the admin key. Anyone who knew a player's email could read
  // their full save (with email + wallet PII) or overwrite their progress. Those
  // keys now require a session token from the `auth` function, which is only
  // issued against a verified EIP-191 signature from that address.
  //
  // Anonymous `device:` keys stay open: they're high-entropy random ids that are
  // never published, so there is no name for an attacker to guess, and requiring
  // a wallet just to play offline would be hostile.
  const claim = await verifyToken(String(body.token || ""));
  if (isIdentityKey(playerKey)) {
    if (!claim) return json({ error: "authentication required for this account" }, 401);
    if (claim.sub.toLowerCase() !== playerKey.toLowerCase()) {
      return json({ error: "token does not match this account" }, 403);
    }
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  // ---- load ----
  if (op === "load") {
    const { data, error } = await admin.database
      .from("player_saves")
      .select("state,saved_at")
      .eq("player_key", playerKey)
      .maybeSingle();
    if (error) return json({ error: "load failed", detail: error.message }, 500);
    if (!data) return json({ found: false, state: null, savedAt: null });
    return json({ found: true, state: data.state, savedAt: Number(data.saved_at) || 0 });
  }

  // ---- save ----
  if (op === "save") {
    const state = body.state;
    if (state == null || typeof state !== "object") return json({ error: "state required" }, 400);
    if (JSON.stringify(state).length > MAX_STATE_BYTES) return json({ error: "state too large" }, 413);

    // INTEGRITY: the save is client-authored, so bound it. This can't make a
    // single-player save "honest" (only a server-side sim could), but it rejects
    // the absurd — Infinity/NaN/1e308 gold, impossible rosters — so a forged save
    // can't poison analytics or the shared systems it feeds. Competitive standing
    // deliberately does NOT come from here: the world-boss contribution and the
    // duel ladder keep their own server-owned rows.
    // NB: no monotonicity checks — Descend (prestige) legitimately resets
    // lifetime totals, and a player-initiated reset legitimately zeroes them.
    const bad = validateState(state);
    if (bad) return json({ error: "state rejected", reason: bad }, 422);

    // Clamp to (now + small skew allowance). `savedAt` is a client wall clock
    // and ordering is last-write-wins, so an unclamped far-future stamp — from a
    // device with a broken clock or a forged request — wins forever: every
    // honest save afterwards looks "stale" and is rejected, freezing that
    // account's cloud copy permanently with no recovery path.
    const CLOCK_SKEW_MS = 60_000;
    const savedAt = Math.min(
      Math.max(0, Math.floor(Number(body.savedAt) || 0)),
      Date.now() + CLOCK_SKEW_MS,
    );
    const email = body.email ? String(body.email).slice(0, 320) : null;
    const wallet = body.walletAddress ? String(body.walletAddress).slice(0, 128) : null;

    // Last-write-wins, enforced as ONE conditional upsert (see
    // save_player_state). Reading saved_at and then writing let two devices both
    // pass the freshness check and the slower write land last — silently
    // replacing newer progress with older, and leaving saved_at claiming the
    // older stamp so the newer device would never re-push. The RPC's
    // `WHERE saved_at <= excluded.saved_at` makes that impossible, and it also
    // coalesces the identity columns so a not-yet-signed-in device can't null
    // out an address we already learned.
    const { data, error } = await admin.database.rpc("save_player_state", {
      p_key: playerKey,
      p_state: state,
      p_saved_at: savedAt,
      p_email: email,
      p_wallet: wallet,
    });
    if (error) {
      console.error("[cloud-save] save failed", error.message);
      return json({ error: "save failed" }, 500);
    }
    const r = (data ?? {}) as { ok?: boolean; stale?: boolean; savedAt?: number };
    if (!r.ok) return json({ ok: false, stale: r.stale === true, savedAt: Number(r.savedAt) || 0 });
    return json({ ok: true, savedAt: Number(r.savedAt) || savedAt });
  }

  return json({ error: "unknown op" }, 400);
}
