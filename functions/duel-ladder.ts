// Real, asynchronous PvP ladder for Idle Legion.
// Each player pushes a snapshot of their fighting strength + ELO rating; other
// players' snapshots become live opponents (CoC/Fallout-Shelter style async PvP).
// Ops:
//   { op: "sync", playerKey, name, rating, power, combatClass, wins, losses }
//        → upsert my snapshot, return real opponents near my rating + my rank
//   { op: "top", playerKey }  → the global rating leaderboard
//
// Admin key bypasses the table's locked RLS.
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const OPP_COUNT = 3;
type Admin = ReturnType<typeof createAdminClient>;

// ---- opaque opponent handles -------------------------------------------------
//
// `player_key` is the caller's ARENA SECRET: world-boss `op:"claim"` and this
// endpoint's `op:"sync"` authenticate on nothing else. Returning opponents' raw
// keys handed every caller the credentials to claim their boss rewards and
// overwrite their ladder row — and since each sync returns three more, it walked
// the whole board. Opponents are now exposed as a salted, one-way handle: stable
// enough for a React key, useless as a credential.
const handleCache = new Map<string, string>();
async function oppHandle(playerKey: string): Promise<string> {
  const cached = handleCache.get(playerKey);
  if (cached) return cached;
  const secret = Deno.env.get("API_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`opp:${playerKey}`));
  const hex = Array.from(new Uint8Array(mac).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  handleCache.set(playerKey, hex);
  return hex;
}

type Row = {
  player_key: string;
  name: string;
  rating: number;
  power: number;
  combat_class: string;
  wins: number;
  losses: number;
};

/** Pick up to N opponents bracketed around the caller's rating (excluding self). */
async function opponentsNear(admin: Admin, playerKey: string, rating: number): Promise<Row[]> {
  const { data } = await admin.database
    .from("duel_ladder")
    .select("player_key,name,rating,power,combat_class,wins,losses")
    .neq("player_key", playerKey)
    .order("rating", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];
  if (rows.length <= OPP_COUNT) return rows;
  // Nearest by rating, then take a spread (easier / even / harder).
  rows.sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating));
  const near = rows.slice(0, Math.min(rows.length, OPP_COUNT * 3));
  near.sort((a, b) => a.rating - b.rating);
  const step = Math.max(1, Math.floor(near.length / OPP_COUNT));
  const out: Row[] = [];
  for (let i = 0; i < near.length && out.length < OPP_COUNT; i += step) out.push(near[i]);
  return out;
}

async function myRank(admin: Admin, rating: number): Promise<number> {
  const { data } = await admin.database.from("duel_ladder").select("player_key").gt("rating", rating);
  return (Array.isArray(data) ? data.length : 0) + 1;
}

async function shapeOpp(r: Row) {
  return {
    oppId: await oppHandle(r.player_key),
    name: r.name,
    rating: r.rating,
    power: r.power,
    combatClass: r.combat_class,
    wins: r.wins,
    losses: r.losses,
  };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const op = String(body.op || "sync");
  const playerKey = String(body.playerKey || "").slice(0, 200);
  if (!playerKey) return json({ error: "playerKey required" }, 400);

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  if (op === "top") {
    const { data } = await admin.database
      .from("duel_ladder")
      .select("player_key,name,rating,wins,losses")
      .order("rating", { ascending: false })
      .limit(25);
    const rows = (data ?? []) as Row[];
    return json({
      top: rows.map((r, i) => ({ rank: i + 1, name: r.name, rating: r.rating, wins: r.wins, losses: r.losses, isYou: r.player_key === playerKey })),
    });
  }

  // op === "sync": push my snapshot, return live opponents + my rank.
  //
  // INTEGRITY: rating/wins/losses arrive from the client, so we never store them
  // verbatim — otherwise anyone could post `rating: 99999` and own the global
  // board. The server keeps the prior authoritative row and admits only a delta
  // no larger than perfect play could have produced since the last sync
  // (attacks/day × ELO K-factor). Cheating collapses to "played optimally".
  const DAILY_ATTACKS = 6; // mirrors client PVP_DAILY_ATTACKS
  const K = 32; // ELO K-factor
  const DAY_MS = 86_400_000;
  const nowMs = Date.now();

  const { data: priorRow } = await admin.database
    .from("duel_ladder")
    .select("rating,power,wins,losses,updated_at")
    .eq("player_key", playerKey)
    .maybeSingle();

  const claimedRating = Math.round(Number(body.rating));
  const claimedWins = Math.round(Number(body.wins));
  const claimedLosses = Math.round(Number(body.losses));
  const claimedPower = Math.round(Number(body.power));

  let rating: number;
  let wins: number;
  let losses: number;
  let power: number;

  if (!priorRow) {
    // First sight of this player: always seed at the fixed start rating.
    rating = 1000;
    wins = 0;
    losses = 0;
    power = Math.min(Math.max(1, Number.isFinite(claimedPower) ? claimedPower : 20), 5_000);
  } else {
    const prevRating = Number(priorRow.rating) || 1000;
    const prevWins = Number(priorRow.wins) || 0;
    const prevLosses = Number(priorRow.losses) || 0;
    const prevPower = Number(priorRow.power) || 20;
    const lastAt = priorRow.updated_at ? Date.parse(priorRow.updated_at) : nowMs;
    const days = Math.max(0, (nowMs - lastAt) / DAY_MS);

    // Rating may move at most the perfect-play rate (always ≥1 duel of slack so a
    // legitimate duel right after a sync isn't clipped).
    const budget = Math.max(K, Math.ceil(days * DAILY_ATTACKS * K));
    const target = Number.isFinite(claimedRating) ? claimedRating : prevRating;
    rating = Math.max(600, Math.min(prevRating + budget, Math.max(prevRating - budget, target)));

    // Win/loss counts are monotonic and bounded by the same duel budget.
    const fights = Math.max(1, Math.ceil(days * DAILY_ATTACKS));
    wins = Math.min(prevWins + fights, Math.max(prevWins, Number.isFinite(claimedWins) ? claimedWins : prevWins));
    losses = Math.min(prevLosses + fights, Math.max(prevLosses, Number.isFinite(claimedLosses) ? claimedLosses : prevLosses));

    // Power drives matchmaking — bound its growth by TIME, not per-sync, or a
    // client that syncs in a loop could double it every call.
    const powerCeiling = Math.min(1_000_000, Math.max(50, prevPower * (1 + 2 * days) + 50));
    power = Math.min(Math.max(1, Number.isFinite(claimedPower) ? claimedPower : prevPower), powerCeiling);
  }

  const combatClass = ["melee", "ranged", "charge"].includes(body.combatClass) ? body.combatClass : "melee";
  const name = String(body.name || "Legion").slice(0, 40);

  await admin.database.from("duel_ladder").upsert(
    [{ player_key: playerKey, name, rating, power, combat_class: combatClass, wins, losses, updated_at: new Date().toISOString() }],
    { onConflict: "player_key" },
  );

  const opps = await opponentsNear(admin, playerKey, rating);
  const rank = await myRank(admin, rating);
  const { data: totalRows } = await admin.database.from("duel_ladder").select("player_key");
  return json({
    opponents: await Promise.all(opps.map(shapeOpp)),
    rank,
    field: Array.isArray(totalRows) ? totalRows.length : 1,
  });
}
