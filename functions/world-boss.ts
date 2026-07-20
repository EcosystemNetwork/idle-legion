// Real, shared World Boss for Idle Legion — server-authoritative, trustless payouts.
// Every player hits ONE boss row; damage is durable and the leaderboard is real
// players' contributions. When a cycle resolves (HP hits 0 or the weekly timer
// expires) the FIRST caller to trip the reset snapshots EVERY contributor's final
// rank and writes their reward to world_boss_reward (claimed=false). Players then
// redeem with the `claim` op, which flips claimed→true — so reward amounts are
// computed and gated entirely server-side; the client only receives what the
// server already recorded and hasn't paid yet.
//
// Ops:
//   { op: "state", playerKey }               → { boss, leaderboard, you, pendingReward, resolved? }
//   { op: "hit",   playerKey, name, damage } → same shape, after applying damage
//   { op: "claim", playerKey }               → { reward: {gold,legion,lunchboxes,cycles} }
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
const CONTRIB_CAP = 500;

// ---- integrity guards -------------------------------------------------------
// Damage is still reported by the client (no server-side combat sim), so the
// rate is bounded by two ceilings rather than trust:
//  1. a server-enforced strike cooldown  → can't spam hits
//  2. a per-hit fraction of boss max HP  → can't one-shot the boss
/** Must match the client's WB_HIT_COOLDOWN_MS (8s), minus a little clock slack. */
const HIT_COOLDOWN_MS = 7_500;
/** No single strike may exceed this fraction of the boss's max HP (was 0.5). */
const MAX_HIT_FRACTION = 0.02;

/**
 * SYBIL RESISTANCE — why there is no per-player share cap and no rank table.
 *
 * `player_key` is client-chosen, so any per-key ceiling is evaded by simply
 * using more keys. The previous design made that *profitable twice over*:
 *   - a rank table paying 20k/12k/8k meant one attacker splitting damage across
 *     three keys collected 40k instead of 20k — it paid to Sybil;
 *   - a 40% per-key share cap made it MANDATORY to split in order to claim more
 *     than 40% of a boss you could otherwise have soloed. The cap manufactured
 *     the very behaviour it was meant to stop.
 *
 * Rewards are now a pure function of your share of total damage, with no rank
 * component and no per-key cap. Splitting X damage across N keys yields N shares
 * that sum to exactly the same payout as one key dealing X — Sybil becomes
 * economically neutral, so there is nothing to defend against. Identity
 * verification would also work, but this holds even for anonymous players.
 */
const CYCLE_POOL = { gold: 45_000, legion: 900, lunchboxes: 6 };
/**
 * Contributors below this share get nothing — stops thousands of dust rows
 * (each of which would otherwise cost a row and a claim) without creating a
 * flat per-identity payout that could be farmed.
 */
const MIN_REWARD_SHARE = 0.005;

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

async function leaderboardFor(admin: Admin, week: number, limit: number) {
  const { data } = await admin.database
    .from("world_boss_contrib")
    .select("player_key,name,contributed")
    .eq("week", week)
    .order("contributed", { ascending: false })
    .limit(limit);
  return (data ?? []) as { player_key: string; name: string; contributed: number }[];
}

/** Sum of this player's not-yet-claimed reward rows. */
async function pendingReward(admin: Admin, playerKey: string) {
  const { data } = await admin.database
    .from("world_boss_reward")
    .select("gold,legion,lunchboxes")
    .eq("player_key", playerKey)
    .eq("claimed", false);
  const rows = (data ?? []) as { gold: number; legion: number; lunchboxes: number }[];
  return rows.reduce<{ gold: number; legion: number; lunchboxes: number; cycles: number }>(
    (a, r) => ({ gold: a.gold + Number(r.gold), legion: a.legion + Number(r.legion), lunchboxes: a.lunchboxes + Number(r.lunchboxes), cycles: a.cycles + 1 }),
    { gold: 0, legion: 0, lunchboxes: 0, cycles: 0 },
  );
}

interface Resolved { week: number; rank: number; field: number; tier: number; }

/** Ensure a live boss exists; resolve the cycle (record all rewards) if dead/expired. */
async function ensureBoss(admin: Admin, now: number, playerKey: string) {
  let boss = await loadBoss(admin);
  if (!boss) boss = await seedBoss(admin, now);

  const dead = boss.hp <= 0;
  const expired = now >= Number(boss.ends_at);
  if (!dead && !expired) return { boss, resolved: null as null | Resolved };

  const closing = boss.week;
  const defeatedTier = boss.tier;

  const nextTier = dead ? boss.tier + 1 : boss.tier;
  const maxHp = bossHpForTier(nextTier);
  const nextBoss = { id: 1, tier: nextTier, hp: maxHp, max_hp: maxHp, ends_at: now + WEEK_MS, week: closing + 1 };

  // Guard on the closing week so exactly ONE caller resets it (idempotent).
  const { data: upd } = await admin.database
    .from("world_boss")
    .update(nextBoss)
    .eq("id", 1)
    .eq("week", closing)
    .select("week");
  const iReset = Array.isArray(upd) && upd.length > 0;

  let resolved: Resolved | null = null;
  if (iReset) {
    // Snapshot every contributor and write their server-computed reward.
    // Payout is a pure damage-share of a fixed cycle pool (see CYCLE_POOL): the
    // total paid out is the same no matter how many keys the damage arrives on,
    // which is what makes Sybil pointless rather than merely bounded.
    const all = await leaderboardFor(admin, closing, CONTRIB_CAP);
    const total = all.reduce((sum, r) => sum + Number(r.contributed || 0), 0);
    const rows = total > 0
      ? all
          .map((r, i) => {
            const share = Number(r.contributed || 0) / total;
            return { r, i, share };
          })
          .filter(({ share }) => share >= MIN_REWARD_SHARE)
          .map(({ r, i, share }) => ({
            week: closing,
            player_key: r.player_key,
            rank: i + 1,
            field: all.length,
            gold: Math.floor(CYCLE_POOL.gold * defeatedTier * share),
            legion: Math.floor(CYCLE_POOL.legion * defeatedTier * share * 100) / 100,
            lunchboxes: Math.floor(CYCLE_POOL.lunchboxes * share),
            claimed: false,
            created_at: new Date().toISOString(),
          }))
      : [];
    if (rows.length) await admin.database.from("world_boss_reward").upsert(rows, { onConflict: "week,player_key" });
    const idx = all.findIndex((r) => r.player_key === playerKey);
    if (idx >= 0) resolved = { week: closing, rank: idx + 1, field: all.length, tier: defeatedTier };
  }

  const fresh = (await loadBoss(admin)) ?? nextBoss;
  return { boss: fresh, resolved };
}

async function shape(
  admin: Admin,
  boss: { tier: number; hp: number; max_hp: number; ends_at: number; week: number },
  board: { player_key: string; name: string; contributed: number }[],
  playerKey: string,
  resolved: Resolved | null,
) {
  const leaderboard = board.map((r) => ({ name: r.name, contributed: Number(r.contributed), isYou: r.player_key === playerKey }));
  const idx = board.findIndex((r) => r.player_key === playerKey);
  const pending = await pendingReward(admin, playerKey);
  return {
    boss: { tier: boss.tier, hp: Number(boss.hp), maxHp: Number(boss.max_hp), endsAt: Number(boss.ends_at), week: boss.week },
    leaderboard,
    you: { contributed: idx >= 0 ? Number(board[idx].contributed) : 0, rank: idx >= 0 ? idx + 1 : null },
    pendingReward: pending,
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

  // ---- claim: pay out (and retire) this player's recorded rewards ----
  if (op === "claim") {
    const { data } = await admin.database
      .from("world_boss_reward")
      .select("week,gold,legion,lunchboxes")
      .eq("player_key", playerKey)
      .eq("claimed", false);
    const rows = (data ?? []) as { week: number; gold: number; legion: number; lunchboxes: number }[];
    const reward = rows.reduce(
      (a, r) => ({ gold: a.gold + Number(r.gold), legion: a.legion + Number(r.legion), lunchboxes: a.lunchboxes + Number(r.lunchboxes), cycles: a.cycles + 1 }),
      { gold: 0, legion: 0, lunchboxes: 0, cycles: 0 },
    );
    if (rows.length) {
      // Flip every unclaimed row for this player to claimed.
      await admin.database
        .from("world_boss_reward")
        .update({ claimed: true })
        .eq("player_key", playerKey)
        .eq("claimed", false);
    }
    return json({ reward });
  }

  if (op === "hit") {
    let damage = Number(body.damage) || 0;
    if (!Number.isFinite(damage) || damage <= 0) return json({ error: "damage required" }, 400);

    const { boss, resolved } = await ensureBoss(admin, now, playerKey);

    const { data: prior } = await admin.database
      .from("world_boss_contrib")
      .select("contributed,updated_at")
      .eq("week", boss.week)
      .eq("player_key", playerKey)
      .maybeSingle();

    // (1) Server-enforced strike cooldown — a scripted client can't spam hits.
    const lastAt = prior?.updated_at ? Date.parse(prior.updated_at) : 0;
    if (lastAt && now - lastAt < HIT_COOLDOWN_MS) {
      return json({ error: "cooldown", retryInMs: HIT_COOLDOWN_MS - (now - lastAt) }, 429);
    }

    // (2) Per-hit plausibility ceiling — no one-shotting the boss.
    damage = Math.min(damage, boss.max_hp * MAX_HIT_FRACTION);

    // NOTE: there is deliberately NO per-player share cap here any more.
    // It was strictly counter-productive: because `player_key` is client-chosen,
    // the cap could never actually bind an attacker (rotate keys), while it did
    // bind honest players — and in doing so it made splitting across keys the
    // only way to claim more than 40% of a boss. It manufactured Sybil pressure
    // and defended nothing. With share-proportional payouts (see CYCLE_POOL)
    // there is no advantage to splitting, so no cap is needed. The cooldown and
    // per-hit ceiling still bound the achievable damage RATE.
    const priorTotal = prior ? Number(prior.contributed) : 0;

    const newHp = Math.max(0, Number(boss.hp) - damage);
    await admin.database.from("world_boss").update({ hp: newHp, updated_at: new Date().toISOString() }).eq("id", 1);

    const total = priorTotal + damage;
    await admin.database
      .from("world_boss_contrib")
      .upsert([{ week: boss.week, player_key: playerKey, name, contributed: total, updated_at: new Date().toISOString() }], { onConflict: "week,player_key" });

    const board = await leaderboardFor(admin, boss.week, BOARD_LIMIT);
    return json(await shape(admin, { ...boss, hp: newHp }, board, playerKey, resolved));
  }

  // op === "state"
  const { boss, resolved } = await ensureBoss(admin, now, playerKey);
  const board = await leaderboardFor(admin, boss.week, BOARD_LIMIT);
  return json(await shape(admin, boss, board, playerKey, resolved));
}
