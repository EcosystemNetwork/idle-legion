// GameWorld — React mount point for the 3D Underground Kingdom.
//
// Thin wrapper around the raw-Three engine (three/engine) + the procedural
// kingdom scene (three/kingdom): it owns the host <div>, creates the stage once,
// builds the scene, forwards clicks to onEnter, and reflects live state (dweller
// headcount, which buildings are locked).
//
// It also hosts KingdomOverlay, the DOM hotspot layer that makes the map the
// game's primary navigation surface — labels, production-ready pips, locked
// silhouettes, incident alerts and upgrade markers, drawn as real HTML anchored
// to each building's projected screen position.
//
// Lazy-loaded from App so Three.js stays out of the initial bundle. Degrades
// gracefully: no WebGL, or any setup error, falls back to `fallback`.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createStage, webglAvailable } from "../three/engine";
import { buildKingdom, type BuildingDef, type KingdomHandle, type ProjectedBuilding } from "../three/kingdom";
import KingdomOverlay from "./KingdomOverlay";
import type { HotspotState } from "../game/guide";

interface GameWorldProps {
  onEnter: (id: string) => void;
  /** Wandering-kek headcount (usually the player's dweller count). */
  dwellers?: number;
  /** Live per-building status for the hotspot markers. See game/guide.ts. */
  hotspots?: Record<string, HotspotState>;
  /** Rendered instead of the 3D scene when WebGL is unavailable or setup fails. */
  fallback?: ReactNode;
}

export default function GameWorld({ onEnter, dwellers, hotspots, fallback }: GameWorldProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<KingdomHandle | null>(null);
  // Keep the latest onEnter without re-running the (expensive) scene effect.
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  // The overlay's per-frame position writer, handed up via registerApply.
  const applyRef = useRef<((pts: ProjectedBuilding[]) => void) | null>(null);

  const [supported] = useState(() => webglAvailable());
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<BuildingDef | null>(null);

  const registerApply = useCallback((fn: ((pts: ProjectedBuilding[]) => void) | null) => {
    applyRef.current = fn;
  }, []);

  // Build the scene once (per mount).
  useEffect(() => {
    if (!supported) return;
    const host = hostRef.current;
    if (!host) return;

    let stage: ReturnType<typeof createStage> | null = null;
    let handle: KingdomHandle | null = null;
    try {
      // Bloom makes the crystal, torches and building halos glow; the engine
      // skips it on the low tier and drops it if the frame rate can't hold.
      stage = createStage(host, {
        fov: 42,
        far: 200,
        exposure: 1.12,
        bloom: { strength: 0.55, radius: 0.6, threshold: 0.72 },
      });
      handle = buildKingdom(stage, {
        onEnter: (id) => onEnterRef.current(id),
        dwellers,
      });
      handle.onHoverChange(setHover);
      // Indirected through the ref so the overlay can mount/unmount without
      // tearing down the scene.
      handle.onProject((pts) => applyRef.current?.(pts));
      handleRef.current = handle;
      setReady(true);
    } catch (err) {
      console.error("[GameWorld] init failed", err);
      handle?.dispose();
      stage?.dispose();
      setFailed(true);
      return;
    }

    return () => {
      handleRef.current = null;
      handle?.dispose();
      stage?.dispose();
    };
    // dwellers intentionally excluded — its live updates run in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // Push live dweller headcount without rebuilding the scene.
  useEffect(() => {
    handleRef.current?.update({ dwellers });
  }, [dwellers]);

  // Push the locked set so gated buildings render as cold silhouettes.
  const lockedKey = hotspots
    ? Object.keys(hotspots).filter((k) => hotspots[k].status === "locked").sort().join(",")
    : "";
  useEffect(() => {
    handleRef.current?.update({ locked: lockedKey ? lockedKey.split(",") : [] });
  }, [lockedKey]);

  if (!supported || failed) return <>{fallback}</>;

  return (
    <section className="game-world">
      <div ref={hostRef} className="gw-canvas" />
      {!ready && <div className="gw-veil" aria-label="Entering the kingdom…" />}
      {ready && (
        <KingdomOverlay
          states={hotspots ?? {}}
          hoveredId={hover?.id ?? null}
          onEnter={onEnter}
          registerApply={registerApply}
        />
      )}
      <div className="gw-head">
        <h2>Underground Kingdom</h2>
        <span>— Gladiator Kek Empire —</span>
      </div>
      <div className="gw-hint-bar">drag to look around · tap a building to enter</div>
    </section>
  );
}
