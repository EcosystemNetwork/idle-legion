// One state machine for every transaction the game can ask a player to make.
//
// Every purchase, every War Chest funding, every future flow routes through
// here so the player sees the same seven states in the same order with the same
// words. Nothing calls `wallet.fundWarChest` directly any more.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ownership, StatChange } from "../../game/economy";

/** How long a shown price stays honest before we make the player re-confirm. */
export const QUOTE_TTL_MS = 90_000;

export type TxPhase =
  /** Nothing in flight. */
  | "idle"
  /** Sheet open, player is reading what they'd spend and get. */
  | "review"
  /** Waiting for the player to approve in their signer. */
  | "approving"
  /** Approved and settling. */
  | "pending"
  | "success"
  /** Player declined the approval prompt. */
  | "rejected"
  | "insufficient"
  /** Price went stale while the sheet sat open. */
  | "expired"
  | "offline"
  | "failed";

/** A terminal phase the sheet renders as an outcome rather than a step. */
export const TERMINAL: TxPhase[] = [
  "success",
  "rejected",
  "insufficient",
  "expired",
  "offline",
  "failed",
];

export interface TxIntent {
  /** Stable id so repeat opens of the same thing reset cleanly. */
  id: string;
  /** In-world headline. "Fund the War Chest", not "Send USDT". */
  title: string;
  /** Verb on the confirm button. Diegetic. */
  action: string;
  /** What leaves the player's treasury, before fee. */
  spendUsd: number;
  /** Network cost, always shown on its own line. */
  feeUsd: number;
  /** What lands in the game, in plain words. */
  receive: string;
  receiveIcon?: string;
  ownership: Ownership;
  changes: StatChange[];
  /** Optional caveat shown above the buttons. */
  note?: string;
  /** Where the player is taken after success: "Your new gladiator". */
  rewardLabel: string;
  /** Runs after settlement — grants the in-game asset. */
  onSettled?: (txId: string, amountUsd: number) => void;
}

export interface TxRecord {
  id: string;
  title: string;
  amountUsd: number;
  at: number;
  txId: string | null;
  url: string | null;
  status: "settled" | "failed";
}

const LEDGER_KEY = "il.treasury.ledger.v1";

function loadLedger(): TxRecord[] {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as TxRecord[]) : [];
  } catch {
    return [];
  }
}

function saveLedger(rows: TxRecord[]) {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(rows.slice(0, 50)));
  } catch {
    /* a full quota shouldn't break a purchase */
  }
}

/** Map a raw signer/SDK error onto one of the states we have copy for. */
export function classifyError(message: string): TxPhase {
  const m = message.toLowerCase();
  if (/reject|denied|declin|user cancel|cancelled by user/.test(m)) return "rejected";
  if (/insufficient|not enough|exceeds balance|balance too low/.test(m)) return "insufficient";
  if (/expired|stale quote|quote no longer/.test(m)) return "expired";
  if (/network|offline|fetch failed|timed out|timeout/.test(m)) return "offline";
  return "failed";
}

export interface TreasuryTxApi {
  phase: TxPhase;
  intent: TxIntent | null;
  /** Milliseconds left on the shown price; null when no sheet is open. */
  quoteMsLeft: number | null;
  /** Settled transaction, for the success screen and the "details" disclosure. */
  receipt: { txId: string; amountUsd: number; url: string } | null;
  /** Raw error text — only ever shown inside "View transaction details". */
  detail: string | null;
  online: boolean;
  ledger: TxRecord[];
  open: (intent: TxIntent) => void;
  confirm: () => Promise<void>;
  /** Re-arm the same intent with a fresh price after an expiry or failure. */
  retry: () => void;
  close: () => void;
}

/**
 * `send` is injected rather than imported so the sheet can be driven by the
 * real wallet in the app and by a stub in tests/storybook.
 */
export function useTreasuryTx(send: (amountUsd: string) => Promise<
  { transactionId: string; amount: string; explorerUrl: string } | null
>, readError: () => string | null): TreasuryTxApi {
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [intent, setIntent] = useState<TxIntent | null>(null);
  const [quotedAt, setQuotedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [receipt, setReceipt] = useState<TreasuryTxApi["receipt"]>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [ledger, setLedger] = useState<TxRecord[]>(loadLedger);
  const inFlight = useRef(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Only tick while a price is actually on screen — no idle timers.
  useEffect(() => {
    if (phase !== "review" || quotedAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase, quotedAt]);

  const quoteMsLeft =
    phase === "review" && quotedAt != null
      ? Math.max(0, quotedAt + QUOTE_TTL_MS - now)
      : null;

  // A price the player has been staring at for 90 seconds is not a price we
  // should charge them at. Bounce to a re-quote rather than silently proceed.
  useEffect(() => {
    if (phase === "review" && quoteMsLeft === 0) setPhase("expired");
  }, [phase, quoteMsLeft]);

  const open = useCallback((next: TxIntent) => {
    setIntent(next);
    setReceipt(null);
    setDetail(null);
    setQuotedAt(Date.now());
    setNow(Date.now());
    setPhase(navigator.onLine ? "review" : "offline");
  }, []);

  const retry = useCallback(() => {
    setDetail(null);
    setQuotedAt(Date.now());
    setNow(Date.now());
    setPhase(navigator.onLine ? "review" : "offline");
  }, []);

  const close = useCallback(() => {
    setPhase("idle");
    setIntent(null);
    setQuotedAt(null);
    setDetail(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!intent || inFlight.current) return;
    if (!navigator.onLine) {
      setPhase("offline");
      return;
    }
    inFlight.current = true;
    // "approving" is the signature prompt; "pending" is settlement. They are
    // different waits with different anxieties, so they get different screens.
    setPhase("approving");
    try {
      const total = intent.spendUsd + intent.feeUsd;
      const promise = send(total.toFixed(2));
      // The signer prompt resolves first in practice; flip to pending as soon
      // as we've handed off so the copy stops saying "check your app".
      const flip = setTimeout(() => setPhase("pending"), 1200);
      const result = await promise;
      clearTimeout(flip);
      if (!result) {
        const msg = readError() ?? "The treasury could not complete that transfer.";
        setDetail(msg);
        setPhase(classifyError(msg));
        setLedger((rows) => {
          const next = [
            {
              id: `${intent.id}-${Date.now()}`,
              title: intent.title,
              amountUsd: total,
              at: Date.now(),
              txId: null,
              url: null,
              status: "failed" as const,
            },
            ...rows,
          ];
          saveLedger(next);
          return next;
        });
        return;
      }
      setPhase("pending");
      const amountUsd = Number(result.amount) || total;
      intent.onSettled?.(result.transactionId, amountUsd);
      setReceipt({
        txId: result.transactionId,
        amountUsd,
        url: result.explorerUrl,
      });
      setLedger((rows) => {
        const next = [
          {
            id: `${intent.id}-${Date.now()}`,
            title: intent.title,
            amountUsd,
            at: Date.now(),
            txId: result.transactionId,
            url: result.explorerUrl,
            status: "settled" as const,
          },
          ...rows,
        ];
        saveLedger(next);
        return next;
      });
      setPhase("success");
    } catch (e) {
      const msg = (e as Error).message ?? "Unknown failure";
      setDetail(msg);
      setPhase(classifyError(msg));
    } finally {
      inFlight.current = false;
    }
  }, [intent, send, readError]);

  return {
    phase,
    intent,
    quoteMsLeft,
    receipt,
    detail,
    online,
    ledger,
    open,
    confirm,
    retry,
    close,
  };
}
