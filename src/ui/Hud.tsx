// The permanent HUD.
//
// Three resources, and nothing else. The audit counted eleven chips in the old
// bar — Gold, Provisions, Salves, $LEGION, Population, Might, Wounded, Renown,
// Crates, on-chain Balance and Collect-all — which at 390px was six wrapped
// rows of chrome above a game that hadn't started yet.
//
// What survives up top is what a player acts on second to second:
//   Gold        — every decision is priced in it
//   Provisions  — the one resource that can go NEGATIVE and throttle everything
//   Might       — the gate on every raid, boss and territory
// Everything else moved into the Treasury drawer below, one tap away.

import { useState } from "react";
import type { GameState, DerivedStats } from "../game/types";
import { formatNum, maxPopulation, renownBoost } from "../game/engine";
import { KIT } from "../game/config";
import { Button, Stat } from "./primitives";
import "./hud.css";

export interface HudWallet {
  totalUsd: number | null;
  address: string | null;
  connected: boolean;
}

export function Hud({
  state,
  stats,
  goldShown,
  wallet,
  anyReady,
  onCollectAll,
  onOpenCrate,
  onHealAll,
  onConnect,
}: {
  state: GameState;
  stats: DerivedStats;
  /** Count-up animated gold, so the headline number rolls rather than jumps. */
  goldShown: number;
  wallet: HudWallet;
  anyReady: boolean;
  onCollectAll: () => void;
  onOpenCrate: () => void;
  onHealAll: () => void;
  onConnect: () => void;
}) {
  const [open, setOpen] = useState(false);

  // The drawer's badge count: things in there that actually want attention.
  const pending =
    (state.lunchboxes > 0 ? 1 : 0) +
    (stats.woundedCount > 0 ? 1 : 0) +
    (state.legion > 0 ? 0 : 0);

  return (
    <header className={`hud${open ? " drawer-open" : ""}`}>
      <div className="hud-bar">
        <div className="hud-res">
          <Stat
            tone="gold"
            icon={<img src={KIT.res.gold} alt="" />}
            label="Gold"
            value={formatNum(goldShown)}
            sub={`+${stats.goldPerSec.toFixed(1)}/s`}
            title="Sestertii — the price of everything"
          />
          <Stat
            tone={stats.fed ? "green" : "red"}
            icon={<img src={KIT.res.provisions} alt="" />}
            label={stats.fed ? "Provisions" : "Starving"}
            value={formatNum(state.provisions)}
            sub={`${stats.provisionsPerSec >= 0 ? "+" : ""}${stats.provisionsPerSec.toFixed(2)}/s`}
            title={
              stats.fed
                ? "Feeds the legion. Runs dry and every room slows to a crawl."
                : "Out of provisions — every room is producing at a crawl."
            }
          />
          <Stat
            tone="red"
            icon="⚔️"
            label="Might"
            value={formatNum(Math.floor(stats.might))}
            sub={`${state.totalRaids} raids`}
            title="Your legion's total combat power — gates raids, bosses and land"
          />
        </div>

        <div className="hud-actions">
          {/* Primary CTA #1. Only ever appears when it would do something. */}
          <Button
            variant="primary"
            size="sm"
            className={`hud-collect${anyReady ? " ready" : ""}`}
            disabled={!anyReady}
            onClick={onCollectAll}
          >
            Collect all
          </Button>

          <button
            type="button"
            className={`hud-treasury${open ? " open" : ""}`}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="hud-drawer"
          >
            <span className="ht-icon" aria-hidden>🪙</span>
            <span className="ht-label">Treasury</span>
            <span className="ht-caret" aria-hidden>{open ? "▴" : "▾"}</span>
            {pending > 0 && !open && <i className="ht-dot" aria-hidden />}
          </button>
        </div>
      </div>

      {/* ---- the expandable panel: everything the HUD used to shout ---- */}
      {open && (
        <div className="hud-drawer" id="hud-drawer">
          <div className="hd-grid">
            <Stat
              tone="violet"
              icon="💠"
              label="$LEGION"
              value={formatNum(state.legion)}
              sub={stats.legionPerSec > 0 ? `+${stats.legionPerSec.toFixed(2)}/s` : "—"}
            />
            <Stat
              tone="cyan"
              icon={<img src={KIT.res.crystal} alt="" />}
              label="Salves"
              value={formatNum(state.salves)}
              sub={`${stats.salvesPerSec >= 0 ? "+" : ""}${stats.salvesPerSec.toFixed(2)}/s`}
            />
            <Stat
              icon="🛡️"
              label="Population"
              value={`${stats.population}/${maxPopulation(state)}`}
              sub={`${stats.idleCount} idle`}
            />
            {state.renown > 0 && (
              <Stat
                tone="gold"
                icon="🏅"
                label="Renown"
                value={formatNum(state.renown)}
                sub={`+${Math.round(renownBoost(state) * 100)}% output`}
              />
            )}
            <Stat
              tone={state.lunchboxes > 0 ? "gold" : undefined}
              icon={<img src={KIT.res.lunchbox} alt="" />}
              label="Crates"
              value={formatNum(state.lunchboxes)}
              sub={state.lunchboxes > 0 ? "tap to open" : "none yet"}
              onClick={state.lunchboxes > 0 ? onOpenCrate : undefined}
            />
            {stats.woundedCount > 0 && (
              <Stat
                tone="red"
                icon="⛑️"
                label="Wounded"
                value={formatNum(stats.woundedCount)}
                sub={state.salves > 0 ? "tap to heal all" : "no salves"}
                onClick={state.salves > 0 ? onHealAll : undefined}
              />
            )}
          </div>

          <div className="hd-wallet">
            <Stat
              tone="cyan"
              icon="🔗"
              label="On-chain"
              value={wallet.totalUsd == null ? (wallet.connected ? "…" : "—") : `$${wallet.totalUsd.toFixed(2)}`}
              sub={
                wallet.connected && wallet.address
                  ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                  : "not connected"
              }
            />
            {!wallet.connected && (
              <Button variant="ghost" size="sm" onClick={onConnect}>
                Connect
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
