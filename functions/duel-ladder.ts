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

function shapeOpp(r: Row) {
  return {
    playerKey: r.player_key,
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
  const rating = Math.max(600, Math.round(Number(body.rating) || 1000));
  const power = Math.max(1, Math.round(Number(body.power) || 20));
  const combatClass = ["melee", "ranged", "charge"].includes(body.combatClass) ? body.combatClass : "melee";
  const name = String(body.name || "Legion").slice(0, 40);
  const wins = Math.max(0, Math.round(Number(body.wins) || 0));
  const losses = Math.max(0, Math.round(Number(body.losses) || 0));

  await admin.database.from("duel_ladder").upsert(
    [{ player_key: playerKey, name, rating, power, combat_class: combatClass, wins, losses, updated_at: new Date().toISOString() }],
    { onConflict: "player_key" },
  );

  const opps = await opponentsNear(admin, playerKey, rating);
  const rank = await myRank(admin, rating);
  const { data: totalRows } = await admin.database.from("duel_ladder").select("player_key");
  return json({
    opponents: opps.map(shapeOpp),
    rank,
    field: Array.isArray(totalRows) ? totalRows.length : 1,
  });
}
