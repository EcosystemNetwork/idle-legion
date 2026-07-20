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

    const savedAt = Math.max(0, Number(body.savedAt) || 0);
    const email = body.email ? String(body.email).slice(0, 320) : null;
    const wallet = body.walletAddress ? String(body.walletAddress).slice(0, 128) : null;

    // Last-write-wins: skip a write that's older than what we already hold.
    const { data: prior } = await admin.database
      .from("player_saves")
      .select("saved_at")
      .eq("player_key", playerKey)
      .maybeSingle();
    if (prior && Number(prior.saved_at) > savedAt) {
      return json({ ok: false, stale: true, savedAt: Number(prior.saved_at) });
    }

    const nowIso = new Date().toISOString();
    const row: Record<string, unknown> = {
      player_key: playerKey,
      state,
      saved_at: savedAt,
      updated_at: nowIso,
      ...(email ? { email } : {}),
      ...(wallet ? { wallet_address: wallet } : {}),
      ...(prior ? {} : { created_at: nowIso }),
    };
    const { error } = await admin.database
      .from("player_saves")
      .upsert([row], { onConflict: "player_key" });
    if (error) return json({ error: "save failed", detail: error.message }, 500);
    return json({ ok: true, savedAt });
  }

  return json({ error: "unknown op" }, 400);
}
