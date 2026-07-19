// Complete a secret operator mission. Verifies the caller holds a mirror, that the
// mission exists & is active, and (for ciphers) that the answer is right — all
// server-side, so the reward can be trusted by the game client. Idempotent: a
// mission already in the log can't be farmed twice.
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

// Normalize a cipher answer: lowercase, strip everything but a-z0-9.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const operatorId = String(body?.operatorId || "").slice(0, 64).trim();
  const code = String(body?.code || "").slice(0, 64).trim();
  const guess = String(body?.answer || "").slice(0, 200);
  if (!operatorId || !code) return json({ error: "operatorId and code required" }, 400);

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  // Must hold a mirror.
  const { data: mirror } = await admin.database
    .from("scrying_mirrors")
    .select("serial")
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (!mirror) return json({ status: "not_operator" }, 403);

  const { data: mission } = await admin.database
    .from("operator_missions")
    .select("id,kind,answer,reward_gold,reward_boxes,reward_gear,active")
    .eq("code", code)
    .maybeSingle();
  if (!mission || !mission.active) return json({ status: "unknown_mission" }, 404);

  // Already done? Idempotent — no double reward.
  const { data: prior } = await admin.database
    .from("operator_mission_log")
    .select("id")
    .eq("operator_id", operatorId)
    .eq("mission_id", mission.id)
    .maybeSingle();
  if (prior) return json({ status: "already_done" });

  // Ciphers must be answered correctly.
  if (mission.kind === "cipher") {
    if (!mission.answer || norm(guess) !== mission.answer) {
      return json({ status: "wrong" });
    }
  }

  const { error: logErr } = await admin.database
    .from("operator_mission_log")
    .insert([{ operator_id: operatorId, mission_id: mission.id }]);
  // Unique violation → someone double-submitted; treat as already done.
  if (logErr) return json({ status: "already_done" });

  return json({
    status: "complete",
    reward: {
      gold: mission.reward_gold,
      boxes: mission.reward_boxes,
      gear: mission.reward_gear,
    },
  });
}
