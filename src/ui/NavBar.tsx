// The compact four-destination navigation.
//
// Replaces the flat row of up to eleven tabs. Kingdom / Legion / Battle /
// Treasury is the whole surface; every legacy destination still exists as a
// sub-tab inside the Sheet a section opens (see ui/nav.ts for the mapping).
//
// Desktop: a vertical rail down the left edge, out of the world's way.
// Mobile: a bottom bar, thumb-reachable, above the home indicator.
//
// Progressive disclosure is unchanged — a section only appears once at least
// one of its destinations has unlocked, so a fresh legion sees Kingdom and
// Legion and nothing else.

import { SECTIONS, type SectionId, type Tab } from "./nav";
import "./navbar.css";

export interface SectionBadge {
  /** A reward is waiting behind this section. */
  attention?: boolean;
  /** Something changed, but nothing to claim. */
  info?: boolean;
  /** Number shown on the pip, when there's something countable. */
  count?: number;
}

export function NavBar({
  active,
  badges,
  isOpen,
  onSelect,
}: {
  active: SectionId;
  badges: Partial<Record<SectionId, SectionBadge>>;
  /** Whether a given legacy tab has unlocked yet. */
  isOpen: (tab: Tab) => boolean;
  onSelect: (s: SectionId) => void;
}) {
  // A section shows once any destination inside it is reachable. Kingdom is
  // always reachable, so the bar is never empty.
  const visible = SECTIONS.filter((s) => s.tabs.some((t) => isOpen(t.id)));

  return (
    <nav className="navbar" aria-label="Main navigation">
      {visible.map((s) => {
        const b = badges[s.id];
        return (
          <button
            key={s.id}
            type="button"
            className={`nav-item${active === s.id ? " active" : ""}`}
            aria-current={active === s.id ? "page" : undefined}
            onClick={() => onSelect(s.id)}
          >
            <span className="nav-icon" aria-hidden>{s.icon}</span>
            <span className="nav-label">{s.label}</span>
            {(b?.attention || b?.info) && (
              <i className={`nav-pip ${b.attention ? "attention" : "info"}`} aria-hidden>
                {b.count != null && b.count > 1 ? b.count : ""}
              </i>
            )}
          </button>
        );
      })}

      {/* The locked sections stay visible as a single silhouette so the player
          can see the game is bigger than what they've opened — without the
          eleven-dead-tabs problem the old bar had. */}
      {visible.length < SECTIONS.length && (
        <span className="nav-item locked" aria-hidden>
          <span className="nav-icon">🔒</span>
          <span className="nav-label">Soon</span>
        </span>
      )}
    </nav>
  );
}
