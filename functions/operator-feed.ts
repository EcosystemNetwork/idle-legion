// The mirror's secret mission feed. Server won't hand out the missions unless the
// caller actually holds a Scrying Mirror — that's what makes them "secret". Returns
// the operator's serial, the active missions, and which they've already completed.
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
  if (!operatorId) return json({ error: "operatorId required" }, 400);

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  // Gate: no mirror, no visions.
  const { data: mirror } = await admin.database
    .from("scrying_mirrors")
    .select("serial")
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (!mirror) return json({ operator: false, missions: [] });

  const { data: missions } = await admin.database
    .from("operator_missions")
    .select("id,code,kind,title,brief,reward_gold,reward_boxes,reward_gear,sort")
    .eq("active", true)
    .order("sort", { ascending: true });

  const { data: log } = await admin.database
    .from("operator_mission_log")
    .select("mission_id")
    .eq("operator_id", operatorId);

  const done = new Set((log ?? []).map((r: any) => r.mission_id));

  // Never leak the cipher `answer` to the client — completion is checked server-side.
  const feed = (missions ?? []).map((m: any) => ({
    id: m.id,
    code: m.code,
    kind: m.kind,
    title: m.title,
    brief: m.brief,
    rewardGold: m.reward_gold,
    rewardBoxes: m.reward_boxes,
    rewardGear: m.reward_gear,
    completed: done.has(m.id),
  }));

  return json({ operator: true, serial: mirror.serial, missions: feed });
}
