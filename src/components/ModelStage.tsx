// ModelStage — a single animated GLB actor rendered through the shared-context
// portal renderer (three/portals). This is the replacement for <model-viewer>:
// every actor on screen shares ONE WebGL context instead of taking one each.
//
// Used for the room worker keks and the Master in the Grand Hall. The element
// itself is an ordinary sized <div>; the portal renderer draws into its box, and
// clicks land on the div as normal DOM events.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { webglAvailable } from "../three/engine";
import { addPortal, portalEnvironment } from "../three/portals";
import { disposeObject, loadGLB } from "../three/loaders";

export interface ModelStageProps {
  /** GLB url. */
  src: string;
  /** Base looping clip (matched case-insensitively; falls back to first). */
  anim?: string;
  /**
   * Occasional one-shot flourishes layered over `anim` — the actor plays the
   * base loop, drops into a random break every few seconds, then crossfades
   * back. This is what keeps every clip in the GLB in use instead of one.
   */
  breaks?: string[];
  /** Slow turntable spin (degrees/sec). 0 = static. */
  spin?: number;
  /** Vertical framing: how much of the model height to look at (0..1). */
  aim?: number;
  /** Camera distance multiplier relative to model height. */
  zoom?: number;
  fov?: number;
  /** 2D art shown when WebGL is unavailable or the model fails. */
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
}

/** Seconds between idle breaks — jittered so a room full of keks desyncs. */
const breakDelay = () => 3.5 + Math.random() * 6;

export default function ModelStage({
  src,
  anim,
  breaks,
  spin = 0,
  aim = 0.55,
  zoom = 1.9,
  fov = 30,
  poster,
  className,
  style,
  onClick,
  title,
}: ModelStageProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [supported] = useState(() => webglAvailable());
  const [failed, setFailed] = useState(false);

  // Effects can't depend on an array literal without re-running every render.
  const breakKey = (breaks ?? []).join(",");

  useEffect(() => {
    if (!supported) return;
    const el = elRef.current;
    if (!el) return;

    let disposed = false;
    const scene = new THREE.Scene();
    scene.environment = portalEnvironment();
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);

    // Compact key/rim pair — the shared environment does most of the work.
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x1a1020, 0.6));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
    key.position.set(2, 3.5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9d5bff, 1.4);
    rim.position.set(-2.5, 2, -2);
    scene.add(rim);

    const mixer = new THREE.AnimationMixer(scene);
    let root: THREE.Object3D | null = null;
    let base: THREE.AnimationAction | null = null;
    let breakActions: THREE.AnimationAction[] = [];
    let untilBreak = breakDelay();
    let breaking = false;

    const portal = addPortal({
      el,
      scene,
      camera,
      update: (dt) => {
        mixer.update(dt);
        if (root && spin) root.rotation.y += (spin * Math.PI) / 180 * dt;
        if (!breaking && breakActions.length > 0) {
          untilBreak -= dt;
          if (untilBreak <= 0) {
            const brk = breakActions[Math.floor(Math.random() * breakActions.length)];
            breaking = true;
            brk.reset().setLoop(THREE.LoopOnce, 1);
            brk.clampWhenFinished = true;
            brk.play();
            if (base) brk.crossFadeFrom(base, 0.25, true);
          }
        }
      },
    });

    // When a break finishes, ease back into the base loop and re-arm the timer.
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      breaking = false;
      untilBreak = breakDelay();
      if (!base) return;
      base.reset().play();
      base.crossFadeFrom(e.action, 0.3, true);
    };
    mixer.addEventListener("finished", onFinished as never);

    loadGLB(src)
      .then(({ scene: model, animations }) => {
        if (disposed) {
          disposeObject(model);
          return;
        }
        root = model;
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.frustumCulled = false; // skinned bounds are unreliable
        });

        // Drop feet to y=0, recentre, and frame the camera on it.
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        root.position.x -= centre.x;
        root.position.z -= centre.z;
        root.position.y -= box.min.y;
        const height = size.y || 1;
        const target = new THREE.Vector3(0, height * aim, 0);
        camera.position.set(0, height * 0.7, height * zoom);
        camera.lookAt(target);
        scene.add(root);

        const find = (name: string) =>
          animations.find((a) => a.name.toLowerCase() === name.toLowerCase()) ??
          animations.find((a) => a.name.toLowerCase().includes(name.toLowerCase()));

        const clip =
          (anim && find(anim)) ||
          animations.find((a) => /idle/i.test(a.name)) ||
          animations[0];
        if (clip) {
          base = mixer.clipAction(clip);
          base.play();
        }
        breakActions = (breakKey ? breakKey.split(",") : [])
          .map(find)
          .filter((c): c is THREE.AnimationClip => !!c && c !== clip)
          .map((c) => mixer.clipAction(c));
      })
      .catch((err) => {
        console.error("[ModelStage] load failed", src, err);
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      portal.dispose();
      mixer.removeEventListener("finished", onFinished as never);
      mixer.stopAllAction();
      if (root) disposeObject(root);
    };
  }, [src, anim, breakKey, spin, aim, zoom, fov, supported]);

  // Fallback: flat art (or an empty box) when 3D isn't possible.
  if (!supported || failed) {
    return (
      <div
        className={className}
        style={{
          ...style,
          backgroundImage: poster ? `url(${poster})` : undefined,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center bottom",
          cursor: onClick ? "pointer" : undefined,
        }}
        onClick={onClick}
        title={title}
      />
    );
  }

  return (
    <div
      ref={elRef}
      className={className}
      style={{ ...style, cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      title={title}
    />
  );
}
