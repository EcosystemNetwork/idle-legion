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
  if (!operatorId) return json({ error: "operatorId required" }, 400);

  // Launch-grade anti-sybil: the scarce relic requires a verified identity (the
  // connected wallet / Magic address). Anonymous device ids can't claim — and
  // neither can a caller who merely TYPES someone's address: the identity must be
  // backed by a session token, i.e. by a signature from that address. Without
  // that, the supply cap was one `curl` per address anyone could name.
  const claimedIdentity = String(body?.identity || "").slice(0, 200).trim().toLowerCase();
  const identity = await provenIdentity(String(body?.token || ""), claimedIdentity);
  if (!identity) return json({ status: "needs_identity", serial: null });

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });

  const { data, error } = await admin.database.rpc("claim_mirror", {
    p_operator_id: operatorId,
    p_ip: clientIp(req),
    p_identity: identity,
  });
  if (error) return json({ error: "claim failed", detail: error.message }, 500);

  // rpc returns the JSON object built by the SQL function
  return json(data);
}
