// DOM hotspot markers drawn over the 3D kingdom.
//
// This is what turns the map from scenery into the game's primary navigation.
// Each building gets a real HTML marker — label, live status, tap target —
// anchored to its projected screen position. Doing it in DOM rather than as
// canvas sprites buys crisp type at any camera distance, hover/focus states,
// per-status colour, and accessibility for free.
//
// Performance note: positions come from three's render loop at 60fps and are
// written straight to `style.transform` via refs. React re-renders only when
// the *content* of a marker changes (i.e. when game state changes), which is
// orders of magnitude less often than the camera moves.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { BUILDINGS, type ProjectedBuilding } from "../three/kingdom";
import type { HotspotState, HotspotStatus } from "../game/guide";
import "./kingdom-overlay.css";

/** Icon + accessible verb per status. Colour lives in CSS. */
const STATUS_META: Record<HotspotStatus, { pip: string; verb: string }> = {
  ready: { pip: "●", verb: "ready to collect" },
  incident: { pip: "!", verb: "needs attention now" },
  upgrade: { pip: "▲", verb: "upgrade available" },
  attention: { pip: "◆", verb: "waiting on you" },
  locked: { pip: "🔒", verb: "locked" },
  idle: { pip: "", verb: "" },
};

export interface KingdomOverlayHandle {
  /** Called by GameWorld with each frame's projection. */
  apply: (pts: ProjectedBuilding[]) => void;
}

export default function KingdomOverlay({
  states,
  hoveredId,
  onEnter,
  registerApply,
}: {
  /** Live per-building status, keyed by building id. See game/guide.ts. */
  states: Record<string, HotspotState>;
  /** Building currently under the 3D cursor, so DOM and scene agree. */
  hoveredId: string | null;
  onEnter: (id: string) => void;
  /** Hands the position-writer up to GameWorld, which owns the three handle. */
  registerApply: (apply: ((pts: ProjectedBuilding[]) => void) | null) => void;
}) {
  const nodes = useRef(new Map<string, HTMLDivElement>());

  const apply = useCallback((pts: ProjectedBuilding[]) => {
    for (const p of pts) {
      const el = nodes.current.get(p.id);
      if (!el) continue;
      if (!p.visible) {
        // `visibility` rather than `display` — display:none would force a
        // layout pass on every re-show as buildings orbit past the camera.
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "visible";
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%) scale(${p.scale})`;
      // Nearer buildings must overlap further ones, matching the 3D depth.
      el.style.zIndex = String(1000 - Math.round(p.depth * 10));
      // Fade the far side of the ring so the near markers stay readable.
      el.style.opacity = String(Math.max(0.42, Math.min(1, 1.5 - p.depth / 26)));
    }
  }, []);

  useEffect(() => {
    registerApply(apply);
    return () => registerApply(null);
  }, [apply, registerApply]);

  // Buildings render in a stable order; z-index (set above) handles overlap.
  const items = useMemo(() => BUILDINGS.map((b) => ({ def: b, st: states[b.id] })), [states]);

  return (
    <div className="ko-layer" aria-label="Kingdom buildings">
      {items.map(({ def, st }) => {
        const status = st?.status ?? "idle";
        const meta = STATUS_META[status];
        const locked = status === "locked";
        return (
          <div
            key={def.id}
            ref={(el) => {
              if (el) nodes.current.set(def.id, el);
              else nodes.current.delete(def.id);
            }}
            className={`ko-marker st-${status}${hoveredId === def.id ? " hovered" : ""}`}
          >
            <button
              type="button"
              className="ko-hit"
              onClick={() => onEnter(def.id)}
              aria-label={
                locked
                  ? `${def.name}, locked. ${st?.note ?? ""}`
                  : `${def.name}. ${def.sub}. ${st?.note ?? meta.verb}`
              }
            >
              <span className="ko-name">
                {locked && <span className="ko-lock" aria-hidden>🔒</span>}
                {def.name}
              </span>
              <span className="ko-note">{st?.note ?? def.sub}</span>
            </button>

            {/* Status pip — the at-a-glance read from across the map. */}
            {status !== "idle" && (
              <span className={`ko-pip st-${status}`} aria-hidden>
                {st?.count != null && st.count > 1 && status !== "locked" ? st.count : meta.pip}
              </span>
            )}

            {/* The stalk grounding the marker on its building. */}
            <span className="ko-stalk" aria-hidden />
          </div>
        );
      })}
    </div>
  );
}
