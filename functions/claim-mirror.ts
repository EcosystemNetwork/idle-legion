// Public entrypoint for the day-8 Scrying Mirror claim.
// The global cap is enforced authoritatively in Postgres (claim_mirror, advisory
// locked); this function is just the public door that calls it. Matches the
// telemetry `track` pattern: admin key server-side, CORS-open, POST-only.
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

// Real client IP from the proxy headers (the client can't see or spoof it) —
// feeds the per-IP/day anti-farming guard in claim_mirror().
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
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

  const operatorId = String(body?.operatorId || "").slice(0, 64).trim();
  if (!operatorId) return json({ error: "operatorId required" }, 400);

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  const { data, error } = await admin.database.rpc("claim_mirror", {
    p_operator_id: operatorId,
    p_ip: clientIp(req),
  });
  if (error) return json({ error: "claim failed", detail: error.message }, 500);

  // rpc returns the JSON object built by the SQL function
  return json(data);
}
