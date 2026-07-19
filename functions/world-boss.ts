// Real, shared World Boss for Idle Legion — server-authoritative.
// Every player hits ONE boss row; damage is durable in Postgres and the
// leaderboard is real players' contributions. Two ops:
//   { op: "state", playerKey }                    → { boss, leaderboard, you, resolved? }
//   { op: "hit",   playerKey, name, damage }      → { boss, leaderboard, you, resolved? }
//
// The cycle resolves (boss escalates a tier, HP resets, week++) when HP hits 0
// or the weekly timer expires; the caller that trips the reset gets `resolved`
// with the rank it finished, so the client can grant that player's payout.
//
// Admin key bypasses the tables' locked RLS (all access flows through here).
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const BASE_HP = 500_000;
const HP_GROWTH = 0.6;
const WEEK_MS = 7 * 86_400_000;
const BOARD_LIMIT = 20;

function bossHpForTier(tier: number): number {
  return Math.floor(BASE_HP * Math.pow(1 + HP_GROWTH, tier - 1));
}

type Admin = ReturnType<typeof createAdminClient>;

async function loadBoss(admin: Admin) {
  const { data } = await admin.database.from("world_boss").select("*").eq("id", 1).maybeSingle();
  return data as
    | { id: number; tier: number; hp: number; max_hp: number; ends_at: number; week: number }
    | null;
}

async function seedBoss(admin: Admin, now: number) {
  const row = { id: 1, tier: 1, hp: BASE_HP, max_hp: BASE_HP, ends_at: now + WEEK_MS, week: 1 };
  await admin.database.from("world_boss").upsert([row], { onConflict: "id" });
  return row;
}

/** Rank rows (desc by contribution) for a given week. */
async function leaderboardFor(admin: Admin, week: number) {
  const { data } = await admin.database
    .from("world_boss_contrib")
    .select("player_key,name,contributed")
    .eq("week", week)
    .order("contributed", { ascending: false })
    .limit(BOARD_LIMIT);
  return (data ?? []) as { player_key: string; name: string; contributed: number }[];
}

/**
 * Ensure a live boss exists; resolve the cycle if it's dead or expired.
 * Returns the current boss plus, when a reset just happened, the caller's
 * finishing rank in the cycle that closed.
 */
async function ensureBoss(admin: Admin, now: number, playerKey: string) {
  let boss = await loadBoss(admin);
  if (!boss) boss = await seedBoss(admin, now);

  const dead = boss.hp <= 0;
  const expired = now >= Number(boss.ends_at);
  if (!dead && !expired) return { boss, resolved: null as null | Resolved };

  // Snapshot the closing week's board so we can tell the caller their rank.
  const closing = boss.week;
  const board = await leaderboardFor(admin, closing);
  const idx = board.findIndex((r) => r.player_key === playerKey);
  const mine = idx >= 0 ? board[idx].contributed : 0;

  const nextTier = dead ? boss.tier + 1 : boss.tier;
  const maxHp = bossHpForTier(nextTier);
  const nextBoss = {
    id: 1,
    tier: nextTier,
    hp: maxHp,
    max_hp: maxHp,
    ends_at: now + WEEK_MS,
    week: closing + 1,
  };
  // Guard on the closing week so only the first caller resets it (idempotent).
  const { data: upd } = await admin.database
    .from("world_boss")
    .update(nextBoss)
    .eq("id", 1)
    .eq("week", closing)
    .select("week");
  const iReset = Array.isArray(upd) && upd.length > 0;

  const resolved: Resolved | null =
    iReset && mine > 0 ? { week: closing, rank: idx + 1, field: board.length, tier: boss.tier } : null;

  const fresh = (await loadBoss(admin)) ?? nextBoss;
  return { boss: fresh, resolved };
}

interface Resolved { week: number; rank: number; field: number; tier: number; }

function shape(
  boss: { tier: number; hp: number; max_hp: number; ends_at: number; week: number },
  board: { player_key: string; name: string; contributed: number }[],
  playerKey: string,
  resolved: Resolved | null,
) {
  const leaderboard = board.map((r) => ({
    name: r.name,
    contributed: Number(r.contributed),
    isYou: r.player_key === playerKey,
  }));
  const idx = board.findIndex((r) => r.player_key === playerKey);
  return {
    boss: {
      tier: boss.tier,
      hp: Number(boss.hp),
      maxHp: Number(boss.max_hp),
      endsAt: Number(boss.ends_at),
      week: boss.week,
    },
    leaderboard,
    you: { contributed: idx >= 0 ? Number(board[idx].contributed) : 0, rank: idx >= 0 ? idx + 1 : null },
    resolved,
  };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const op = String(body.op || "state");
  const playerKey = String(body.playerKey || "").slice(0, 200);
  if (!playerKey) return json({ error: "playerKey required" }, 400);
  const name = String(body.name || "Legion").slice(0, 40);
  const now = Date.now();

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  if (op === "hit") {
    let damage = Number(body.damage) || 0;
    if (damage <= 0) return json({ error: "damage required" }, 400);

    const { boss, resolved } = await ensureBoss(admin, now, playerKey);
    // Anti-cheat clamp: no single strike may exceed half the boss's max HP.
    damage = Math.min(damage, boss.max_hp * 0.5);
    const newHp = Math.max(0, Number(boss.hp) - damage);

    await admin.database.from("world_boss").update({ hp: newHp, updated_at: new Date().toISOString() }).eq("id", 1);

    // Upsert this player's running contribution for the live week.
    const { data: prior } = await admin.database
      .from("world_boss_contrib")
      .select("contributed")
      .eq("week", boss.week)
      .eq("player_key", playerKey)
      .maybeSingle();
    const total = (prior ? Number(prior.contributed) : 0) + damage;
    await admin.database
      .from("world_boss_contrib")
      .upsert([{ week: boss.week, player_key: playerKey, name, contributed: total, updated_at: new Date().toISOString() }],
        { onConflict: "week,player_key" });

    const board = await leaderboardFor(admin, boss.week);
    return json(shape({ ...boss, hp: newHp }, board, playerKey, resolved));
  }

  // op === "state"
  const { boss, resolved } = await ensureBoss(admin, now, playerKey);
  const board = await leaderboardFor(admin, boss.week);
  return json(shape(boss, board, playerKey, resolved));
}
