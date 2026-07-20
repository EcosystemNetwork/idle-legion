// ---------------------------------------------------------------------------
// BossStage — the live, animated Arena world boss, on the shared 3D engine.
//
// The renderer/scene/camera/loop/disposal boilerplate now lives in three/engine
// (createStage) and three/loaders (loadGLB) — the same harness the 3D Kingdom
// runs on. This file keeps only what is boss-specific: cinematic lighting, the
// contact shadow, camera framing, and the combat → animation state machine.
//
// Combat drives the animation:
//   • hitToken bumps  → play Attack once, then return to Idle (+ a red hit-flash)
//   • killToken bumps → Dead (hold) → Arise → Idle
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createStage, webglAvailable } from "../three/engine";
import { disposeObject, loadGLB } from "../three/loaders";

/** Hit-flash tint. Module-level so the per-frame decay allocates nothing. */
const HIT_COLOR = new THREE.Color(0xff2a1a);

interface BossStageProps {
  modelUrl: string;
  /** 2D boss art shown if WebGL is unavailable or the model fails to load. */
  poster?: string;
  /** Bump to trigger an Attack swing. */
  hitToken: number;
  /** Bump to trigger the death → rise sequence. */
  killToken: number;
  className?: string;
}

/** Imperative handle wired up once the model is live. */
interface BossCtrl {
  attack: () => void;
  die: () => void;
}

export default function BossStage({ modelUrl, poster, hitToken, killToken, className }: BossStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<BossCtrl | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() =>
    webglAvailable() ? "loading" : "error",
  );

  // --- Scene lifecycle: set up once per model, tear down on unmount. --------
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !webglAvailable()) return;

    let disposed = false;
    setStatus("loading");

    const stage = createStage(host, { fov: 38, far: 100, exposure: 1.15, envRoughness: 0.04 });
    const { scene, camera } = stage;

    // Cinematic three-point-ish lighting tuned to the game's dark-vibrant theme.
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x1a1020, 0.55));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9d5bff, 2.0); // purple rim = theme accent
    rim.position.set(-3, 2.5, -2.5);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xff7a3d, 0.7); // warm amber bounce
    fill.position.set(-2, 0.5, 2);
    scene.add(fill);

    const contact = makeContactShadow();
    scene.add(contact);

    const mixer = new THREE.AnimationMixer(scene);
    let root: THREE.Object3D | null = null;
    let hitFlash = 0; // 0..1, decays each frame
    let flashMat: THREE.MeshStandardMaterial | null = null;
    let baseEmissive: THREE.Color | null = null;

    const actions = new Map<string, THREE.AnimationAction>();
    let current: THREE.AnimationAction | null = null;
    // The Dead → Arise hand-off is a timer; it must not outlive the effect.
    let ariseTimer = 0;

    function play(name: string, o: { loop?: boolean; clamp?: boolean; fade?: number } = {}) {
      const next = actions.get(name);
      if (!next) return null;
      const { loop = true, clamp = false, fade = 0.25 } = o;
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = clamp;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.fadeIn(fade).play();
      if (current && current !== next) current.crossFadeTo(next, fade, false);
      current = next;
      return next;
    }

    // Return to a looping Idle after a one-shot finishes — except Dead, which
    // holds on the last frame until the scheduled Arise takes over.
    mixer.addEventListener("finished", (e) => {
      if (disposed) return;
      const finished = (e as unknown as { action: THREE.AnimationAction }).action;
      if (finished.getClip().name === "Dead") return;
      play("Idle", { fade: 0.3 });
    });

    // `box` is measured on the loader's master model, not on this clone — a
    // cloned skeleton doesn't measure the same and yields a degenerate box.
    function frameModel(obj: THREE.Object3D, box: THREE.Box3) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.x -= center.x;
      obj.position.z -= center.z;
      obj.position.y -= box.min.y;

      const height = size.y || 1;
      const target = new THREE.Vector3(0, height * 0.55, 0);
      const dist = height * 1.9;
      camera.position.set(dist * 0.28, height * 0.72, dist);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    }

    // Per-frame: animation + turntable sway + hit-flash decay.
    const unsub = stage.onFrame((dt) => {
      mixer.update(dt);
      if (root) root.rotation.y += dt * 0.25;
      if (hitFlash > 0 && flashMat && baseEmissive) {
        hitFlash = Math.max(0, hitFlash - dt * 3);
        flashMat.emissive.copy(baseEmissive).lerp(HIT_COLOR, hitFlash);
        flashMat.emissiveIntensity = 1 + hitFlash * 2.5;
      }
    });

    // --- Load the model. ---------------------------------------------------
    loadGLB(modelUrl)
      .then(({ scene: model, animations, box }) => {
        if (disposed) return;
        root = model;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.frustumCulled = false; // skinned bounds are unreliable; keep drawn
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && !flashMat) {
              // loadGLB clones the scene graph but SHARES materials with every
              // other actor using this GLB, so the flash gets its own copy —
              // otherwise a boss hit would tint every kek on screen. The clone
              // is identical, so the look is unchanged.
              const own = mat.clone();
              mesh.material = own;
              flashMat = own;
              baseEmissive = own.emissive.clone();
            }
          }
        });
        scene.add(root);
        frameModel(root, box);

        for (const clip of animations) actions.set(clip.name, mixer.clipAction(clip));
        play("Idle", { fade: 0 });

        setStatus("ready");
        const deadDur = actions.get("Dead")?.getClip().duration ?? 1.6;
        ctrlRef.current = {
          attack: () => {
            play("Attack", { loop: false, clamp: false });
            hitFlash = 1;
          },
          die: () => {
            play("Dead", { loop: false, clamp: true, fade: 0.2 });
            if (ariseTimer) window.clearTimeout(ariseTimer);
            ariseTimer = window.setTimeout(() => {
              ariseTimer = 0;
              if (!disposed) play("Arise", { loop: false });
            }, deadDur * 1000 + 500);
          },
        };
      })
      .catch((err) => {
        console.error("[BossStage] load failed", err);
        if (!disposed) setStatus("error");
      });

    // --- Teardown. ---------------------------------------------------------
    return () => {
      disposed = true;
      unsub();
      if (ariseTimer) window.clearTimeout(ariseTimer);
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      ctrlRef.current = null;
      // disposeObject frees this stage's own geometry (the contact shadow) and
      // the cloned flash material, and deliberately skips everything owned by
      // the shared GLB cache — see three/loaders.
      disposeObject(scene);
      stage.dispose();
    };
    // Re-init only when the model source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  // --- Combat → animation. Skip the initial mount so we start on Idle. ------
  const firstHit = useRef(true);
  useEffect(() => {
    if (firstHit.current) {
      firstHit.current = false;
      return;
    }
    ctrlRef.current?.attack();
  }, [hitToken]);

  const firstKill = useRef(true);
  useEffect(() => {
    if (firstKill.current) {
      firstKill.current = false;
      return;
    }
    ctrlRef.current?.die();
  }, [killToken]);

  return (
    <div ref={hostRef} className={`boss-3d${className ? ` ${className}` : ""}`}>
      {status === "loading" && <div className="boss-3d-spinner" aria-label="Summoning the boss…" />}
      {status === "error" && (
        <div className="boss-3d-fallback" style={poster ? { backgroundImage: `url(${poster})` } : undefined} />
      )}
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

/** A cheap soft ground shadow: a radial-gradient texture on a floor plane. */
function makeContactShadow(): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.001;
  return plane;
}
