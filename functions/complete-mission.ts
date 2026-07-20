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

// ---- proof-of-identity ------------------------------------------------------
//
// `identity` (a wallet/Magic address) used to be an unverified string in the
// request body, even though the comments called it "verified". Anyone who knew a
// mirror holder's address could read their operator feed and burn their missions
// — and, since holding a mirror is the gate, get operator access without one.
// It is now only honoured when the caller presents a session token from the
// `auth` function, which is issued solely against a valid EIP-191 signature.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
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

/**
 * The address this caller has actually PROVEN, or "" when unproven. The token's
 * `sub` is `wallet:<lowercase address>`; the body's `identity` is the bare
 * address, so an identity is accepted only when the two agree.
 */
async function provenIdentity(token: string, claimed: string): Promise<string> {
  if (!claimed) return "";
  const claim = await verifyToken(token);
  if (!claim) return "";
  return safeEqual(claim.sub.toLowerCase(), `wallet:${claimed}`) ? claimed : "";
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
  const claimedIdentity = String(body?.identity || "").slice(0, 200).trim().toLowerCase();
  const identity = await provenIdentity(String(body?.token || ""), claimedIdentity);
  const code = String(body?.code || "").slice(0, 64).trim();
  const guess = String(body?.answer || "").slice(0, 200);
  if (!operatorId || !code) return json({ error: "operatorId and code required" }, 400);

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  // Must hold a mirror — resolve by PROVEN identity first (cross-device), then
  // device. An unproven identity is dropped above, so it falls through to the
  // device id and can't borrow someone else's mirror.
  let mirror: { operator_id: string } | null = null;
  if (identity) {
    const { data } = await admin.database
      .from("scrying_mirrors")
      .select("operator_id")
      .eq("claim_identity", identity)
      .maybeSingle();
    mirror = data ?? null;
  }
  if (!mirror) {
    const { data } = await admin.database
      .from("scrying_mirrors")
      .select("operator_id")
      .eq("operator_id", operatorId)
      .maybeSingle();
    mirror = data ?? null;
  }
  if (!mirror) return json({ status: "not_operator" }, 403);

  // Canonical operator id keys the log so completions are stable across devices.
  const canonical = mirror.operator_id;

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
    .eq("operator_id", canonical)
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
    .insert([{ operator_id: canonical, mission_id: mission.id }]);
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
