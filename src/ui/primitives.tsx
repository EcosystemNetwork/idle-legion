// Reusable UI primitives.
//
// The audit found eight bespoke card styles and twelve button classes doing the
// work of one of each. Everything new is built from this file; existing screens
// migrate to it opportunistically. Each primitive is presentation-only — no game
// state, no engine imports — so it stays cheap to reason about and to restyle.

import type { CSSProperties, ReactNode } from "react";
import "./ui.css";

/* ------------------------------------------------------------------ Panel */

export type PanelTone = "default" | "gold" | "violet" | "danger" | "ready";

export function Panel({
  children,
  tone = "default",
  inset,
  className = "",
  style,
}: {
  children: ReactNode;
  tone?: PanelTone;
  /** Sunken variant — for content nested inside another panel. */
  inset?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`ui-panel tone-${tone}${inset ? " inset" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function PanelHead({
  title,
  sub,
  icon,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-panel-head">
      {icon != null && <span className="ui-panel-icon" aria-hidden>{icon}</span>}
      <div className="ui-panel-titles">
        <h2>{title}</h2>
        {sub != null && <p>{sub}</p>}
      </div>
      {actions != null && <div className="ui-panel-actions">{actions}</div>}
    </header>
  );
}

/* ----------------------------------------------------------------- Button */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "secondary",
  size = "md",
  full,
  icon,
  disabled,
  title,
  onClick,
  className = "",
  type = "button",
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  full?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`ui-btn v-${variant} sz-${size}${full ? " full" : ""} ${className}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {icon != null && <span className="ui-btn-icon" aria-hidden>{icon}</span>}
      {children != null && <span className="ui-btn-label">{children}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ Meter */

/** A labelled progress bar. `tone` drives the fill colour; `full` pulses. */
export function Meter({
  value,
  max,
  tone = "gold",
  label,
  compact,
}: {
  value: number;
  max: number;
  tone?: "gold" | "green" | "violet" | "red";
  label?: ReactNode;
  compact?: boolean;
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className={`ui-meter t-${tone}${frac >= 1 ? " is-full" : ""}${compact ? " compact" : ""}`}
      role="progressbar"
      aria-valuenow={Math.round(frac * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${frac * 100}%` }} />
      {label != null && <b>{label}</b>}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */

export function Badge({
  children,
  tone = "neutral",
  pulse,
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "green" | "violet" | "red" | "cyan";
  pulse?: boolean;
}) {
  return <span className={`ui-badge t-${tone}${pulse ? " pulse" : ""}`}>{children}</span>;
}

/* ------------------------------------------------------------------- Stat */

/** Label / value / sub triplet with tabular numerals so counters don't jitter. */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone,
  onClick,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "gold" | "green" | "violet" | "red" | "cyan";
  onClick?: () => void;
  title?: string;
}) {
  const inner = (
    <>
      {icon != null && <span className="ui-stat-icon" aria-hidden>{icon}</span>}
      <span className="ui-stat-body">
        <span className="ui-stat-label">{label}</span>
        <b className="ui-stat-value">{value}</b>
        {sub != null && <small className="ui-stat-sub">{sub}</small>}
      </span>
    </>
  );
  const cls = `ui-stat${tone ? ` t-${tone}` : ""}`;
  return onClick ? (
    <button type="button" className={`${cls} clickable`} onClick={onClick} title={title}>
      {inner}
    </button>
  ) : (
    <div className={cls} title={title}>{inner}</div>
  );
}

/* ------------------------------------------------------- system states */

/** Nothing here yet — always says what to do about it. */
export function EmptyState({
  icon = "◇",
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state empty">
      <div className="ui-state-icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      {body != null && <p>{body}</p>}
      {action != null && <div className="ui-state-action">{action}</div>}
    </div>
  );
}

/** Something is gated. Names the requirement, never just "locked". */
export function LockedState({
  title,
  requirement,
  action,
}: {
  title: ReactNode;
  requirement: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state locked">
      <div className="ui-state-icon" aria-hidden>🔒</div>
      <h3>{title}</h3>
      <p className="ui-req">{requirement}</p>
      {action != null && <div className="ui-state-action">{action}</div>}
    </div>
  );
}

/** Contextual failure, shown where it happened rather than in a global bar. */
export function ErrorState({
  title = "The deep is unreachable",
  body,
  onRetry,
}: {
  title?: ReactNode;
  body?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-state error" role="alert">
      <div className="ui-state-icon" aria-hidden>⚠</div>
      <h3>{title}</h3>
      {body != null && <p>{body}</p>}
      {onRetry && (
        <div className="ui-state-action">
          <Button variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export function LoadingState({ label = "Descending…" }: { label?: string }) {
  return (
    <div className="ui-state loading" aria-live="polite" aria-busy="true">
      <span className="ui-spinner" aria-hidden />
      <p>{label}</p>
    </div>
  );
}

/** Shimmering placeholder block, sized by the caller. */
export function Skeleton({ h = 16, w = "100%", r = "var(--r-md)" }: { h?: number | string; w?: number | string; r?: string }) {
  return <span className="ui-skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

/** Completion flourish — the "you did it" beat for objectives and milestones. */
export function CompletionState({
  title,
  body,
  action,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state complete">
      <div className="ui-state-icon" aria-hidden>✦</div>
      <h3>{title}</h3>
      {body != null && <p>{body}</p>}
      {action != null && <div className="ui-state-action">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Sheet */

/**
 * A panel that slides over the world and can always be dismissed back to it.
 * Desktop: right-hand pane. Mobile: bottom sheet. This is how every non-Kingdom
 * surface is presented, so the world is never more than one tap away.
 */
export function Sheet({
  open,
  title,
  sub,
  icon,
  tabs,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  /** Optional sub-navigation rendered under the title. */
  tabs?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="ui-sheet-layer">
      <button
        type="button"
        className="ui-sheet-scrim"
        aria-label="Back to the kingdom"
        onClick={onClose}
      />
      <aside className={`ui-sheet${wide ? " wide" : ""}`} role="dialog" aria-label={typeof title === "string" ? title : undefined}>
        <header className="ui-sheet-head">
          <span className="ui-sheet-grip" aria-hidden />
          <div className="ui-sheet-titles">
            {icon != null && <span className="ui-sheet-icon" aria-hidden>{icon}</span>}
            <div>
              <h2>{title}</h2>
              {sub != null && <p>{sub}</p>}
            </div>
          </div>
          <button type="button" className="ui-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {tabs != null && <div className="ui-sheet-tabs">{tabs}</div>}
        <div className="ui-sheet-body">{children}</div>
      </aside>
    </div>
  );
}

/** Pill used for sub-navigation inside a Sheet. */
export function SegItem({
  active,
  onClick,
  children,
  dot,
  locked,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** "attention" = reward waiting, "info" = passive change. */
  dot?: "attention" | "info";
  locked?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`ui-seg${active ? " active" : ""}${locked ? " locked" : ""}`}
      onClick={onClick}
      disabled={locked}
      title={title}
    >
      {children}
      {dot && <i className={`ui-seg-dot ${dot}`} aria-hidden />}
    </button>
  );
}
