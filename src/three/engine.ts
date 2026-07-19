// The shared raw-Three.js render harness every 3D surface in the game sits on.
//
// It owns exactly the boilerplate that is identical for the kingdom, the boss,
// and any future scene, and nothing scene-specific:
//   • a colour-managed, tone-mapped WebGL renderer with a capped pixel ratio
//   • a scene + perspective camera + soft PMREM studio environment
//   • a single RAF loop that fans out to registered per-frame callbacks
//   • automatic pausing when the tab is hidden or the canvas scrolls off-screen
//     (idle games run for hours in a background tab — never burn a GPU there)
//   • container-driven resize
//   • total teardown of every GPU resource on dispose()
//
// Scenes call createStage(host), add their own objects to stage.scene, register
// frame callbacks, and dispose their own assets in the function they return from
// onFrame — the stage disposes the renderer/environment/camera rig itself.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

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

export interface StageOptions {
  /** Vertical FOV in degrees (default 42). */
  fov?: number;
  /** Camera near/far planes. */
  near?: number;
  far?: number;
  /** Tone-mapping exposure (default 1.1). */
  exposure?: number;
  /** Roughness passed to the generated room environment (default 0.06). */
  envRoughness?: number;
  /** Pause the loop when scrolled off-screen (default true). */
  pauseOffscreen?: boolean;
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  /** The element the canvas is mounted in. */
  host: HTMLElement;
  /** Register a per-frame callback; returns an unsubscribe fn. dt is clamped. */
  onFrame: (cb: (dt: number, elapsed: number) => void) => () => void;
  /** Force a resize recompute (also runs automatically via ResizeObserver). */
  resize: () => void;
  /** Begin/stop the RAF loop. Normally driven automatically by visibility/IO. */
  start: () => void;
  stop: () => void;
  /** Tear everything down. Idempotent. */
  dispose: () => void;
}

export function createStage(host: HTMLElement, opts: StageOptions = {}): Stage {
  const {
    fov = 42,
    near = 0.1,
    far = 200,
    exposure = 1.1,
    envRoughness = 0.06,
    pauseOffscreen = true,
  } = opts;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

  const clock = new THREE.Clock();
  const frameCbs = new Set<(dt: number, elapsed: number) => void>();

  let raf = 0;
  let running = false;
  let disposed = false;

  function renderFrame() {
    const dt = Math.min(clock.getDelta(), 0.05); // clamp long gaps (tab wakeups)
    const elapsed = clock.elapsedTime;
    for (const cb of frameCbs) cb(dt, elapsed);
    renderer.render(scene, camera);
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  reconcile(); // kick off if already visible + on-screen

  return {
    scene,
    camera,
    renderer,
    clock,
    host,
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
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

function aspect(host: HTMLElement): number {
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  return w / h;
}
