// Shared-context "portal" renderer.
//
// The game shows many small 3D actors at once (a worker kek in every staffed
// room, the Master in the Grand Hall). Giving each one its own canvas would burn
// a WebGL context apiece — browsers cap that around 16 and start evicting the
// oldest, which is exactly the thrash <model-viewer> caused.
//
// Instead there is ONE renderer and ONE canvas, fixed over the viewport, and
// each actor registers a placeholder element. Every frame we walk the portals,
// set the scissor + viewport rectangle to that element's on-screen box, and
// render its little scene there. One context, N views.
//
// Layering: the canvas sits at z-index 8 — above all page content (which tops
// out at 7) but below every modal/overlay (which start at 50), so a dialog still
// covers an actor. It is pointer-events:none, so clicks land on the placeholder
// element and are handled by React as normal.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { detectQuality } from "./engine";

const PIXEL_RATIO_CAP: Record<string, number> = { low: 1, medium: 1.5, high: 2 };

export interface PortalSpec {
  /** Placeholder element whose on-screen box this portal renders into. */
  el: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Per-frame hook (advance mixers, spin the model, …). */
  update?: (dt: number, elapsed: number) => void;
}

export interface PortalHandle {
  dispose: () => void;
}

interface Ctx {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  clock: THREE.Clock;
  portals: Set<PortalSpec>;
  env: THREE.Texture;
  pmrem: THREE.PMREMGenerator;
  raf: number;
  onResize: () => void;
  onVisibility: () => void;
}

let ctx: Ctx | null = null;

function ensureCtx(): Ctx {
  if (ctx) return ctx;

  const quality = detectQuality();
  const renderer = new THREE.WebGLRenderer({
    antialias: quality !== "low",
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality] ?? 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  // We clear the whole canvas once per frame ourselves (see renderAll).
  renderer.autoClear = false;

  const canvas = renderer.domElement;
  Object.assign(canvas.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "8",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(canvas);

  // One shared soft studio environment for every portal scene.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const c: Ctx = {
    renderer,
    canvas,
    clock: new THREE.Clock(),
    portals: new Set(),
    env,
    pmrem,
    raf: 0,
    onResize: () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    },
    onVisibility: () => {
      if (document.hidden) stopLoop();
      else startLoop();
    },
  };
  window.addEventListener("resize", c.onResize);
  document.addEventListener("visibilitychange", c.onVisibility);
  ctx = c;
  return c;
}

function renderAll() {
  const c = ctx;
  if (!c) return;
  const dt = Math.min(c.clock.getDelta(), 0.05);
  const elapsed = c.clock.elapsedTime;
  const W = window.innerWidth;
  const H = window.innerHeight;

  // Clear the whole canvas (scissor off), then draw each portal into its box.
  c.renderer.setScissorTest(false);
  c.renderer.clear();
  c.renderer.setScissorTest(true);

  for (const p of c.portals) {
    const r = p.el.getBoundingClientRect();
    // Skip anything with no area or fully outside the viewport.
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;

    p.update?.(dt, elapsed);

    const bottom = H - r.bottom; // WebGL origin is bottom-left
    c.renderer.setViewport(r.left, bottom, r.width, r.height);
    c.renderer.setScissor(r.left, bottom, r.width, r.height);
    p.camera.aspect = r.width / r.height;
    p.camera.updateProjectionMatrix();
    c.renderer.render(p.scene, p.camera);
  }
}

function loop() {
  if (!ctx) return;
  ctx.raf = requestAnimationFrame(loop);
  renderAll();
}

function startLoop() {
  const c = ctx;
  if (!c || c.raf || c.portals.size === 0 || document.hidden) return;
  c.clock.getDelta(); // discard the gap so animation doesn't jump
  c.raf = requestAnimationFrame(loop);
}

function stopLoop() {
  const c = ctx;
  if (!c) return;
  if (c.raf) cancelAnimationFrame(c.raf);
  c.raf = 0;
}

function teardown() {
  const c = ctx;
  if (!c) return;
  stopLoop();
  window.removeEventListener("resize", c.onResize);
  document.removeEventListener("visibilitychange", c.onVisibility);
  c.env.dispose();
  c.pmrem.dispose();
  c.renderer.dispose();
  c.renderer.forceContextLoss();
  c.canvas.remove();
  ctx = null;
}

/** The shared PMREM environment map, for portal scenes that want reflections. */
export function portalEnvironment(): THREE.Texture {
  return ensureCtx().env;
}

/**
 * Register an actor. The returned handle removes it; when the last portal goes
 * away the shared renderer is torn down entirely, freeing the WebGL context.
 */
export function addPortal(spec: PortalSpec): PortalHandle {
  const c = ensureCtx();
  c.portals.add(spec);
  startLoop();
  let live = true;
  return {
    dispose() {
      if (!live) return;
      live = false;
      c.portals.delete(spec);
      if (c.portals.size === 0) teardown();
    },
  };
}
