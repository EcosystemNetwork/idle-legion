// Proof-of-address login for Idle Legion.
//
// WHY THIS EXISTS
// `player_key` used to be `email:<address>` asserted by the client, on endpoints
// that run with the admin key (RLS bypassed). That is a guessable name for a
// privileged record: knowing someone's email was enough to read their full save
// (with email + wallet PII), overwrite their progress, or claim their World Boss
// rewards. No amount of transactional correctness downstream fixes a door with
// no lock.
//
// HOW
// Both supported logins (Magic email OTP and an injected browser wallet) expose
// an ethers Signer, so a single EIP-191 `personal_sign` covers both. The client
// signs a short, timestamped statement; we recover the address from the
// signature and — only if it matches the claimed one — issue a short-lived
// HMAC session token. Downstream functions trust the TOKEN, never the body's key.
//
// This deliberately needs no Magic admin key and no new auth provider: the
// signature IS the proof, and for a Magic user the key behind it is only
// reachable by someone who controls that verified email.
//
//   POST { address, message, signature } → { token, sub, exp }
import { verifyMessage } from "npm:ethers@6";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Tokens are short-lived; the client re-signs on expiry (once per session). */
const TOKEN_TTL_MS = 12 * 3_600_000;
/** How stale a signed statement may be — bounds replay of a captured signature. */
const MESSAGE_MAX_AGE_MS = 10 * 60_000;
/** Exact prefix the client must sign, so a signature from another dapp can't be reused here. */
const STATEMENT = "Idle Legion — prove control of this address to sync your legion.";

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const secret = Deno.env.get("API_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

/** `<b64url(json)>.<hmac>` — a minimal signed token; verified by verifyToken below. */
export async function issueToken(sub: string, now: number): Promise<{ token: string; exp: number }> {
  const exp = now + TOKEN_TTL_MS;
  const body = b64url(new TextEncoder().encode(JSON.stringify({ sub, exp })));
  return { token: `${body}.${await hmac(body)}`, exp };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const address = String(body.address || "").trim();
  const message = String(body.message || "");
  const signature = String(body.signature || "");
  if (!address || !message || !signature) return json({ error: "address, message, signature required" }, 400);

  // The signed statement must be ours and must be fresh, so a signature scraped
  // from elsewhere (or replayed later) is useless.
  if (!message.startsWith(STATEMENT)) return json({ error: "unexpected statement" }, 400);
  const tsMatch = message.match(/issued:\s*(\d+)/);
  const issued = tsMatch ? Number(tsMatch[1]) : NaN;
  const now = Date.now();
  if (!Number.isFinite(issued) || Math.abs(now - issued) > MESSAGE_MAX_AGE_MS) {
    return json({ error: "stale or missing timestamp" }, 400);
  }
  // The message must name the address it claims, so one signature can't be
  // presented as proof for a different account.
  if (!message.toLowerCase().includes(address.toLowerCase())) {
    return json({ error: "message does not bind the address" }, 400);
  }

  let recovered: string;
  try {
    recovered = verifyMessage(message, signature);
  } catch {
    return json({ error: "bad signature" }, 401);
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return json({ error: "signature does not match address" }, 401);
  }

  const sub = `wallet:${recovered.toLowerCase()}`;
  const { token, exp } = await issueToken(sub, now);
  return json({ token, sub, exp });
}
