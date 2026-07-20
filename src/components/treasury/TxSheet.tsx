// The one confirmation surface in the game.
//
// Rules it exists to enforce:
//  1. Before the player commits, they see exactly what leaves, what arrives,
//     the fee, and whether the thing can be traded later. No exceptions.
//  2. The headline is in-world ("Fund the War Chest"); the chain lives behind
//     "View transaction details" and nowhere else.
//  3. Every one of the seven outcome states has real copy, a real illustration
//     of what happened, and one obvious next action.

import { useState } from "react";
import { OWNERSHIP_META, usd } from "../../game/economy";
import type { StatChange } from "../../game/economy";
import type { TreasuryTxApi } from "./useTreasuryTx";

function Changes({ rows }: { rows: StatChange[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="tx-changes">
      <div className="tx-changes-head">If you do this</div>
      {rows.map((c) => (
        <div key={c.label} className="tx-change">
          <span className="tx-change-label">{c.label}</span>
          <span className="tx-change-vals">
            <b className="was">{c.before}</b>
            <span className="arrow" aria-hidden>
              →
            </span>
            <b className={c.better ? "now up" : "now"}>{c.after}</b>
          </span>
          {Math.abs(c.deltaPct) >= 0.5 && (
            <span className={`tx-delta ${c.better ? "up" : "down"}`}>
              {c.deltaPct > 0 ? "+" : ""}
              {Math.round(c.deltaPct)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Details({
  tx,
  addressLine,
}: {
  tx: TreasuryTxApi;
  addressLine: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tx-details">
      <button type="button" className="tx-details-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} View transaction details
      </button>
      {open && (
        <dl className="tx-details-body">
          <dt>Settles as</dt>
          <dd>USDT on Arbitrum</dd>
          <dt>Routed by</dt>
          <dd>Particle Universal Account · EIP-7702 chain-abstracted EOA</dd>
          {addressLine && (
            <>
              <dt>Account</dt>
              <dd className="mono">{addressLine}</dd>
            </>
          )}
          {tx.receipt && (
            <>
              <dt>Transaction</dt>
              <dd className="mono">{tx.receipt.txId}</dd>
              <dt>Explorer</dt>
              <dd>
                <a href={tx.receipt.url} target="_blank" rel="noreferrer">
                  UniversalX activity ↗
                </a>
              </dd>
            </>
          )}
          {tx.detail && (
            <>
              <dt>Error</dt>
              <dd className="mono err">{tx.detail}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

export default function TxSheet({
  tx,
  addressLine,
  onGoToReward,
  onTopUp,
}: {
  tx: TreasuryTxApi;
  /** Shown only inside the details disclosure. */
  addressLine: string | null;
  /** Takes the player straight to the thing they just bought. */
  onGoToReward: () => void;
  /** "Add value" path when the balance is short. */
  onTopUp: () => void;
}) {
  const { phase, intent } = tx;
  if (phase === "idle" || !intent) return null;

  const total = intent.spendUsd + intent.feeUsd;
  const own = OWNERSHIP_META[intent.ownership];
  const secs = tx.quoteMsLeft == null ? null : Math.ceil(tx.quoteMsLeft / 1000);

  return (
    <div className="tx-scrim" role="dialog" aria-modal="true" aria-label={intent.title}>
      <div className={`tx-sheet phase-${phase}`}>
        {phase === "review" && (
          <>
            <header className="tx-head">
              <h3>{intent.title}</h3>
              <button type="button" className="tx-x" onClick={tx.close} aria-label="Close">
                ✕
              </button>
            </header>

            <div className="tx-ledger">
              <div className="tx-line">
                <span>You spend</span>
                <b>{usd(intent.spendUsd)}</b>
              </div>
              <div className="tx-line fee">
                <span>Network fee</span>
                <b>{usd(intent.feeUsd)}</b>
              </div>
              <div className="tx-line total">
                <span>Total</span>
                <b>{usd(total)}</b>
              </div>
              <div className="tx-line get">
                <span>You receive</span>
                <b>
                  {intent.receiveIcon} {intent.receive}
                </b>
              </div>
              <div className="tx-line own">
                <span>Ownership</span>
                <b title={own.note}>
                  {own.icon} {own.label}
                </b>
              </div>
            </div>
            <p className="tx-own-note muted small">{own.note}</p>

            <Changes rows={intent.changes} />

            {intent.note && <p className="tx-note">{intent.note}</p>}

            {secs != null && (
              <p className="tx-quote muted small">
                This price is held for {secs}s. After that we&apos;ll ask again with a fresh one.
              </p>
            )}

            <div className="tx-actions">
              <button type="button" className="btn ghost" onClick={tx.close}>
                Not now
              </button>
              <button type="button" className="btn buy" onClick={() => void tx.confirm()}>
                {intent.action} · {usd(total)}
              </button>
            </div>
            <Details tx={tx} addressLine={addressLine} />
          </>
        )}

        {phase === "approving" && (
          <div className="tx-state">
            <div className="tx-spin" aria-hidden />
            <h3>Awaiting your seal</h3>
            <p>
              Approve the request in your signing app to release {usd(total)} from your treasury.
              Nothing has left yet.
            </p>
            <button type="button" className="btn ghost" onClick={tx.close}>
              Cancel
            </button>
          </div>
        )}

        {phase === "pending" && (
          <div className="tx-state">
            <div className="tx-spin" aria-hidden />
            <h3>The coin is on the road</h3>
            <p>
              Your {usd(total)} is being carried to the treasury. This usually takes a few seconds —
              you can keep playing and we&apos;ll tell you the moment it lands.
            </p>
            <button type="button" className="btn ghost" onClick={tx.close}>
              Keep playing
            </button>
            <Details tx={tx} addressLine={addressLine} />
          </div>
        )}

        {phase === "success" && (
          <div className="tx-state ok">
            <div className="tx-seal" aria-hidden>
              ✓
            </div>
            <h3>It is done</h3>
            <p>
              {usd(tx.receipt?.amountUsd ?? total)} left your treasury. {intent.receive} is yours.
            </p>
            <Changes rows={intent.changes} />
            <div className="tx-actions">
              <button type="button" className="btn ghost" onClick={tx.close}>
                Stay here
              </button>
              <button
                type="button"
                className="btn buy"
                onClick={() => {
                  tx.close();
                  onGoToReward();
                }}
              >
                {intent.rewardLabel} →
              </button>
            </div>
            <Details tx={tx} addressLine={addressLine} />
          </div>
        )}

        {phase === "rejected" && (
          <div className="tx-state warn">
            <div className="tx-seal warn" aria-hidden>
              ↩
            </div>
            <h3>You called it off</h3>
            <p>The request was declined, so nothing left your treasury. Your legion is unchanged.</p>
            <div className="tx-actions">
              <button type="button" className="btn ghost" onClick={tx.close}>
                Close
              </button>
              <button type="button" className="btn buy" onClick={tx.retry}>
                Try again
              </button>
            </div>
          </div>
        )}

        {phase === "insufficient" && (
          <div className="tx-state warn">
            <div className="tx-seal warn" aria-hidden>
              ⌛
            </div>
            <h3>Your treasury is short</h3>
            <p>
              This costs {usd(total)} and your balance doesn&apos;t cover it. Nothing was spent.
              You can add value — or simply keep playing: everything here has a free path.
            </p>
            <div className="tx-actions">
              <button type="button" className="btn ghost" onClick={tx.close}>
                Keep playing
              </button>
              <button
                type="button"
                className="btn buy"
                onClick={() => {
                  tx.close();
                  onTopUp();
                }}
              >
                Add value
              </button>
            </div>
            <Details tx={tx} addressLine={addressLine} />
          </div>
        )}

        {phase === "expired" && (
          <div className="tx-state warn">
            <div className="tx-seal warn" aria-hidden>
              ⏳
            </div>
            <h3>That price has gone stale</h3>
            <p>
              Prices move, and we won&apos;t charge you against an old one. Nothing was spent — ask
              the merchant again for today&apos;s figure.
            </p>
            <div className="tx-actions">
              <button type="button" className="btn ghost" onClick={tx.close}>
                Close
              </button>
              <button type="button" className="btn buy" onClick={tx.retry}>
                Get a fresh price
              </button>
            </div>
          </div>
        )}

        {phase === "offline" && (
          <div className="tx-state warn">
            <div className="tx-seal warn" aria-hidden>
              ⚡
            </div>
            <h3>The roads are cut</h3>
            <p>
              You&apos;re offline, so the treasury can&apos;t be reached. Nothing was spent — your
              stronghold keeps producing, and this will work the moment you&apos;re back.
            </p>
            <div className="tx-actions">
              <button type="button" className="btn ghost" onClick={tx.close}>
                Keep playing
              </button>
              <button type="button" className="btn buy" disabled={!tx.online} onClick={tx.retry}>
                {tx.online ? "Try again" : "Waiting for connection…"}
              </button>
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div className="tx-state warn">
            <div className="tx-seal bad" aria-hidden>
              ✕
            </div>
            <h3>The transfer didn&apos;t go through</h3>
            <p>
              Something went wrong on the way and the transfer was not completed. Nothing was taken
              from your treasury.
            </p>
            <div className="tx-actions">
              <button type="button" className="btn ghost" onClick={tx.close}>
                Close
              </button>
              <button type="button" className="btn buy" onClick={tx.retry}>
                Try again
              </button>
            </div>
            <Details tx={tx} addressLine={addressLine} />
          </div>
        )}
      </div>
    </div>
  );
}
