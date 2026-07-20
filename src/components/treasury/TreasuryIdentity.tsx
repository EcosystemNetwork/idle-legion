// Sign-in, but framed as "opening a treasury account" rather than "connecting
// a wallet".
//
// Order of operations is deliberate: the player has already played, already
// seen what the reward is, and only now meets this. Email is the default and
// the largest target; the wallet path is a quiet secondary for people who
// already have one. The word "wallet" appears exactly once, on that secondary.

import { useState } from "react";
import { usd } from "../../game/economy";

export interface IdentityProps {
  session: { address: string; email?: string | null; method: string } | null;
  busy: boolean;
  /** Unified balance across everything, or null while unknown. */
  totalUsd: number | null;
  /** Per-chain holdings — advanced disclosure only. */
  assets: { tokenType?: string; amountInUSD?: number }[];
  address: string | null;
  canEmail: boolean;
  /** True when the on-chain features are configured at all. */
  canTransact: boolean;
  onEmail: (email: string) => void;
  onWallet: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  /** Why the player is being asked right now — set when a reward triggered it. */
  reason?: string;
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function TreasuryIdentity(p: IdentityProps) {
  const [email, setEmail] = useState("");
  const [advanced, setAdvanced] = useState(false);

  if (!p.session) {
    return (
      <section className="tr-identity signed-out">
        <div className="tr-id-copy">
          <h3>Open your treasury</h3>
          <p className="muted">
            {p.reason ??
              "Everything in the Treasury below is optional. Open an account only when you want to hold value that follows you between devices."}
          </p>
        </div>
        <form
          className="tr-id-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) p.onEmail(email.trim());
          }}
        >
          <label className="tr-id-label" htmlFor="tr-email">
            Your email
          </label>
          <div className="tr-id-row">
            <input
              id="tr-email"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!p.canEmail || p.busy}
              required
            />
            <button type="submit" className="btn buy" disabled={!p.canEmail || p.busy}>
              {p.busy ? "Opening…" : "Continue with email"}
            </button>
          </div>
          <p className="muted small">
            No password, no download. We send you a link and the treasury is yours.
          </p>
        </form>
        <div className="tr-id-alt">
          <button type="button" className="link-btn" disabled={p.busy} onClick={p.onWallet}>
            I already have a crypto wallet
          </button>
        </div>
        <p className="tr-id-safety small">
          🎖️ You can finish the entire game without ever opening one. Gold, land, gear and every
          rank are earned by playing.
        </p>
      </section>
    );
  }

  const bal =
    p.totalUsd == null ? "…" : usd(p.totalUsd);

  return (
    <section className="tr-identity signed-in">
      <div className="tr-bal">
        <span className="tr-bal-cap">Treasury balance</span>
        <b className="tr-bal-v">{bal}</b>
        <span className="muted small">One balance. We handle where it lives.</span>
      </div>
      <div className="tr-id-who">
        <span className="tr-id-name">
          <i className="live-dot" />
          {p.session.email ?? shortAddr(p.session.address)}
        </span>
        <div className="tr-id-btns">
          <button type="button" className="chip-btn" disabled={p.busy} onClick={p.onRefresh}>
            ↻ Refresh
          </button>
          <button type="button" className="chip-btn" disabled={p.busy} onClick={p.onSignOut}>
            Sign out
          </button>
        </div>
      </div>
      <button type="button" className="tx-details-toggle" onClick={() => setAdvanced((a) => !a)}>
        {advanced ? "▾" : "▸"} Advanced account details
      </button>
      {advanced && (
        <dl className="tx-details-body">
          <dt>Sign-in method</dt>
          <dd>{p.session.method === "magic" ? "Email (Magic)" : "Browser wallet"}</dd>
          <dt>Address</dt>
          <dd className="mono">{p.address ?? p.session.address}</dd>
          <dt>Account type</dt>
          <dd>Particle Universal Account · EIP-7702 chain-abstracted EOA</dd>
          <dt>Settlement</dt>
          <dd>USDT on Arbitrum, sourced from any supported chain</dd>
          {p.assets.length > 0 && (
            <>
              <dt>Holdings</dt>
              <dd>
                <ul className="tr-assets">
                  {p.assets.map((a, i) => (
                    <li key={`${a.tokenType ?? "asset"}-${i}`}>
                      <span>{a.tokenType ?? "asset"}</span>
                      <b>{usd(a.amountInUSD ?? 0)}</b>
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          {!p.canTransact && (
            <>
              <dt>Status</dt>
              <dd className="err">
                Transaction keys are not configured in this build — balances and purchases are
                unavailable. Everything else plays normally.
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
