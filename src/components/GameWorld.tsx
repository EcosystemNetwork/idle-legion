// GameWorld — React mount point for the 3D Underground Kingdom.
//
// Thin wrapper around the raw-Three engine (three/engine) + the procedural
// kingdom scene (three/kingdom): it owns the host <div>, creates the stage once,
// builds the scene, forwards clicks to onEnter, and reflects live state (dweller
// headcount). Lazy-loaded from App so Three.js stays out of the initial bundle.
//
// Degrades gracefully: no WebGL, or any setup error, falls back to `fallback`
// (the original 2D KingdomMap).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createStage, webglAvailable } from "../three/engine";
import { buildKingdom, type BuildingDef, type KingdomHandle } from "../three/kingdom";

interface GameWorldProps {
  onEnter: (id: string) => void;
  /** Wandering-kek headcount (usually the player's dweller count). */
  dwellers?: number;
  /** Rendered instead of the 3D scene when WebGL is unavailable or setup fails. */
  fallback?: ReactNode;
}

export default function GameWorld({ onEnter, dwellers, fallback }: GameWorldProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<KingdomHandle | null>(null);
  // Keep the latest onEnter without re-running the (expensive) scene effect.
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  const [supported] = useState(() => webglAvailable());
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<BuildingDef | null>(null);

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

  if (!supported || failed) return <>{fallback}</>;

  return (
    <section className="game-world">
      <div ref={hostRef} className="gw-canvas" />
      {!ready && <div className="gw-veil" aria-label="Entering the kingdom…" />}
      <div className="gw-head">
        <h2>Underground Kingdom</h2>
        <span>— Gladiator Kek Empire —</span>
      </div>
      <div className={`gw-tip${hover ? " show" : ""}`}>
        {hover ? (
          <>
            <strong>{hover.name}</strong>
            <em>{hover.sub}</em>
            <span className="gw-enter">click to enter →</span>
          </>
        ) : (
          <span className="gw-hint">drag to look around · click a building to enter</span>
        )}
      </div>
    </section>
  );
}
