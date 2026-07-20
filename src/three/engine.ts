// The shared raw-Three.js render harness every 3D surface in the game sits on.
//
// It owns exactly the boilerplate that is identical for the kingdom, the boss,
// and any future scene, and nothing scene-specific:
//   • a colour-managed, tone-mapped WebGL renderer with a capped pixel ratio
//   • a scene + perspective camera + soft PMREM studio environment
//   • an optional bloom post-processing chain (EffectComposer)
//   • a single RAF loop that fans out to registered per-frame callbacks
//   • automatic pausing when the tab is hidden or the canvas scrolls off-screen
//     (idle games run for hours in a background tab — never burn a GPU there)
//   • an adaptive quality governor: picks a tier from device capability, then
//     downgrades (bloom off, pixel ratio down) if the frame rate can't hold up
//   • container-driven resize + total teardown of GPU resources on dispose()
//
// Scenes call createStage(host), add their own objects to stage.scene, register
// frame callbacks, and dispose their own assets; the stage disposes the
// renderer/environment/composer itself.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** True when the browser can give us a WebGL context at all. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

export type QualityTier = "low" | "medium" | "high";

/** Cheap capability guess: core count + a coarse-pointer (mobile) signal. */
export function detectQuality(): QualityTier {
  try {
    const cores = navigator.hardwareConcurrency || 4;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    if (coarse || cores <= 4) return "low";
    if (cores <= 8) return "medium";
    return "high";
  } catch {
    return "medium";
  }
}

const PIXEL_RATIO_CAP: Record<QualityTier, number> = { low: 1, medium: 1.5, high: 2 };

export interface BloomOptions {
  strength?: number;
  radius?: number;
  threshold?: number;
}

export interface StageOptions {
  /** Vertical FOV in degrees (default 42). */
  fov?: number;
  near?: number;
  far?: number;
  /** Tone-mapping exposure (default 1.1). */
  exposure?: number;
  /** Roughness passed to the generated room environment (default 0.04 — the
   *  PMREM sample budget clips above this). */
  envRoughness?: number;
  /** Pause the loop when scrolled off-screen (default true). */
  pauseOffscreen?: boolean;
  /** Add a bloom pass. Ignored on the "low" tier. */
  bloom?: BloomOptions | false;
  /** Force a quality tier instead of detecting one. */
  quality?: QualityTier;
  /** Disable the adaptive FPS downgrade (default false — governor on). */
  fixedQuality?: boolean;
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  host: HTMLElement;
  /** The tier currently in effect (may drop below the initial one at runtime). */
  quality: QualityTier;
  /** Register a per-frame callback; returns an unsubscribe fn. dt is clamped. */
  onFrame: (cb: (dt: number, elapsed: number) => void) => () => void;
  resize: () => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

export function createStage(host: HTMLElement, opts: StageOptions = {}): Stage {
  const {
    fov = 42,
    near = 0.1,
    far = 200,
    exposure = 1.1,
    envRoughness = 0.04,
    pauseOffscreen = true,
    bloom,
    fixedQuality = false,
  } = opts;

  let quality: QualityTier = opts.quality ?? detectQuality();

  const renderer = new THREE.WebGLRenderer({
    antialias: quality !== "low",
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality]));
  renderer.setSize(host.clientWidth || 1, host.clientHeight || 1, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, aspect(host), near, far);

  // Soft image-based lighting without shipping an HDR file.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), envRoughness);
  scene.environment = envRT.texture;

  // --- Optional bloom chain. Skipped entirely on the low tier. --------------
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  if (bloom && quality !== "low") {
    composer = new EffectComposer(renderer);
    composer.setSize(host.clientWidth || 1, host.clientHeight || 1);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(host.clientWidth || 1, host.clientHeight || 1),
      bloom.strength ?? 0.6,
      bloom.radius ?? 0.5,
      bloom.threshold ?? 0.75,
    );
    composer.addPass(bloomPass);
    // OutputPass applies tone mapping + sRGB conversion at the end of the chain.
    composer.addPass(new OutputPass());
  }

  const clock = new THREE.Clock();
  const frameCbs = new Set<(dt: number, elapsed: number) => void>();

  let raf = 0;
  let running = false;
  let disposed = false;

  // --- Adaptive quality governor. -------------------------------------------
  // Sample the frame rate over 2s windows; if we can't hold ~40fps, step the
  // tier down once (bloom off, then pixel ratio down). One-way, so it can never
  // oscillate between tiers.
  let fpsFrames = 0;
  let fpsElapsed = 0;
  function govern(dt: number) {
    if (fixedQuality || quality === "low") return;
    fpsFrames++;
    fpsElapsed += dt;
    if (fpsElapsed < 2) return;
    const fps = fpsFrames / fpsElapsed;
    fpsFrames = 0;
    fpsElapsed = 0;
    if (fps >= 40) return;
    quality = quality === "high" ? "medium" : "low";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality]));
    if (quality === "low" && bloomPass) bloomPass.enabled = false;
    resize();
  }

  function renderFrame() {
    const dt = Math.min(clock.getDelta(), 0.05); // clamp long gaps (tab wakeups)
    const elapsed = clock.elapsedTime;
    for (const cb of frameCbs) cb(dt, elapsed);
    if (composer && bloomPass?.enabled !== false) composer.render(dt);
    else renderer.render(scene, camera);
    govern(dt);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    renderFrame();
  }
  function start() {
    if (running || disposed) return;
    running = true;
    clock.getDelta(); // discard the accumulated gap so motion doesn't jump
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // --- Auto pause/resume on visibility + on-screen state. -------------------
  let onScreen = true;
  function reconcile() {
    if (disposed) return;
    if (!document.hidden && onScreen) start();
    else stop();
  }
  const onVisibility = () => reconcile();
  document.addEventListener("visibilitychange", onVisibility);

  let io: IntersectionObserver | null = null;
  if (pauseOffscreen) {
    io = new IntersectionObserver(
      ([e]) => {
        onScreen = e.isIntersecting;
        reconcile();
      },
      { threshold: 0.01 },
    );
    io.observe(host);
  }

  // --- Resize with the container. -------------------------------------------
  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    bloomPass?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  reconcile(); // kick off if already visible + on-screen

  const stage: Stage = {
    scene,
    camera,
    renderer,
    clock,
    host,
    get quality() {
      return quality;
    },
    onFrame(cb) {
      frameCbs.add(cb);
      return () => frameCbs.delete(cb);
    },
    resize,
    start,
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      ro.disconnect();
      frameCbs.clear();
      composer?.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return stage;
}

function aspect(host: HTMLElement): number {
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  return w / h;
}
