// The Next Objective card — the five-second answer to "what do I do now?".
//
// There is exactly one of these on screen, always, and it always names both the
// action and what the player gets for it. The directive itself is derived in
// game/guide.ts from state the game already tracks; this file only presents it.
//
// It is deliberately the loudest thing outside the world itself. The old build
// buried the equivalent information three levels down (inside the Legion tab,
// below the summoning panel) and rendered the unlock hint as a greyed-out,
// dashed, cursor:help pill — i.e. styled exactly like something to ignore.

import type { Directive } from "../game/guide";
import { formatNum } from "../game/engine";
import { Button } from "./primitives";
import "./objective.css";

export function NextObjective({
  directive,
  onAct,
  collapsed,
  onToggle,
}: {
  directive: Directive;
  /** Runs the directive: navigates, or fires its in-place action. */
  onAct: (d: Directive) => void;
  /** Minimised to a single line — the player's choice, remembered by the host. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { tone, title, detail, reward, cta, progress } = directive;

  if (collapsed) {
    return (
      <div className={`obj-card collapsed tone-${tone}`}>
        <button type="button" className="obj-expand" onClick={onToggle} aria-label="Expand objective">
          <span className="obj-eyebrow">Next</span>
          <span className="obj-mini-title">{title}</span>
          <span className="obj-caret" aria-hidden>▾</span>
        </button>
        <Button variant="primary" size="sm" onClick={() => onAct(directive)}>
          {cta}
        </Button>
      </div>
    );
  }

  return (
    <div className={`obj-card tone-${tone}`} role="status">
      <div className="obj-main">
        <div className="obj-head">
          <span className="obj-eyebrow">
            {tone === "urgent" ? "Needs you now" : tone === "reward" ? "Ready to claim" : "Next objective"}
          </span>
          {onToggle && (
            <button type="button" className="obj-collapse" onClick={onToggle} aria-label="Collapse objective">
              ▴
            </button>
          )}
        </div>

        <h2 className="obj-title">{title}</h2>
        <p className="obj-detail">{detail}</p>

        {progress && progress.target > 0 && (
          <div className="obj-progress">
            <div className="obj-track">
              <i style={{ width: `${Math.min(100, (progress.value / progress.target) * 100)}%` }} />
            </div>
            <span className="obj-progress-text">
              {formatNum(Math.min(progress.value, progress.target))} / {formatNum(progress.target)}
              {progress.unit ? ` ${progress.unit}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="obj-side">
        <div className="obj-reward">
          <span className="obj-reward-label">Reward</span>
          <strong>{reward}</strong>
        </div>
        <Button variant="primary" size="md" full onClick={() => onAct(directive)}>
          {cta}
        </Button>
      </div>
    </div>
  );
}
