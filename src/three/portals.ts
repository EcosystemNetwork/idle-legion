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

/** A registered portal plus its cached layout box (see the rect notes below). */
interface Portal {
  spec: PortalSpec;
  rect: DOMRect | null;
}

interface Ctx {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  clock: THREE.Clock;
  portals: Map<PortalSpec, Portal>;
  env: THREE.Texture;
  /** Kept so the FBO can be freed — disposing only `.texture` leaks the target. */
  envRT: THREE.WebGLRenderTarget;
  pmrem: THREE.PMREMGenerator;
  raf: number;
  /** Layout observers that invalidate cached rects instead of us re-reading. */
  ro: ResizeObserver;
  io: IntersectionObserver;
  /** Set when any cached rect may be stale; refreshed once on the next frame. */
  rectsDirty: boolean;
  /** Timestamp of the last full rect refresh (safety-net re-read). */
  rectsAt: number;
  onResize: () => void;
  onScroll: () => void;
  onVisibility: () => void;
}

let ctx: Ctx | null = null;

// Rects are only re-read when something says they moved (resize / scroll / an
// observer firing), plus this slow safety-net sweep for layout shifts nothing
// observes — a sibling growing above a portal moves it without resizing it.
// 250ms of staleness in that rare case beats a forced reflow per portal per
// frame; the app re-renders 4x/second, so the old code left layout permanently
// dirty and paid ~600 reflows/sec.
const RECT_MAX_AGE_MS = 250;

/** Debounce for tearing the shared context down — see scheduleTeardown. */
const TEARDOWN_DELAY_MS = 1500;
let teardownTimer = 0;

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

  // One shared soft studio environment for every portal scene. The room is a
  // throwaway scene of its own geometry/materials — dispose it once baked.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  room.dispose();

  const c: Ctx = {
    renderer,
    canvas,
    clock: new THREE.Clock(),
    portals: new Map(),
    env: envRT.texture,
    envRT,
    pmrem,
    raf: 0,
    ro: new ResizeObserver((entries) => {
      for (const e of entries) invalidate(e.target as HTMLElement);
    }),
    // A portal crossing the viewport edge means its box moved; re-read next
    // frame. (Scrolling a nested container fires this even where the scroll
    // listener below wouldn't reach.)
    io: new IntersectionObserver(() => markRectsDirty(), { threshold: 0 }),
    rectsDirty: true,
    rectsAt: 0,
    onResize: () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      markRectsDirty();
    },
    // Rects are viewport-relative, so ANY scroll invalidates every one of them.
    // This only flips a flag; the actual re-read happens once, next frame.
    onScroll: () => markRectsDirty(),
    onVisibility: () => {
      if (document.hidden) stopLoop();
      else {
        markRectsDirty();
        startLoop();
      }
    },
  };
  window.addEventListener("resize", c.onResize);
  // Capture + passive so nested scrollers (the room list) invalidate too.
  window.addEventListener("scroll", c.onScroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", c.onVisibility);
  ctx = c;
  return c;
}

function markRectsDirty() {
  if (ctx) ctx.rectsDirty = true;
}

function invalidate(el: HTMLElement) {
  const p = findByEl(el);
  if (p) p.rect = null;
}

function findByEl(el: HTMLElement): Portal | null {
  const c = ctx;
  if (!c) return null;
  for (const p of c.portals.values()) if (p.spec.el === el) return p;
  return null;
}

/** Re-read every portal's box in one go — a single batched layout flush. */
function refreshRects(c: Ctx, now: number) {
  for (const p of c.portals.values()) p.rect = p.spec.el.getBoundingClientRect();
  c.rectsDirty = false;
  c.rectsAt = now;
}

function renderAll() {
  const c = ctx;
  if (!c) return;
  const dt = Math.min(c.clock.getDelta(), 0.05);
  const elapsed = c.clock.elapsedTime;
  const W = window.innerWidth;
  const H = window.innerHeight;

  // All layout reads happen here, before any rendering, and at most once per
  // frame — and usually far less often than that (see RECT_MAX_AGE_MS).
  const now = performance.now();
  let missing = false;
  for (const p of c.portals.values()) if (!p.rect) missing = true;
  if (c.rectsDirty || missing || now - c.rectsAt > RECT_MAX_AGE_MS) refreshRects(c, now);

  // Clear the whole canvas (scissor off), then draw each portal into its box.
  c.renderer.setScissorTest(false);
  c.renderer.clear();
  c.renderer.setScissorTest(true);

  for (const p of c.portals.values()) {
    const r = p.rect;
    if (!r) continue;
    // Skip anything with no area or fully outside the viewport.
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;

    const spec = p.spec;
    spec.update?.(dt, elapsed);

    const bottom = H - r.bottom; // WebGL origin is bottom-left
    c.renderer.setViewport(r.left, bottom, r.width, r.height);
    c.renderer.setScissor(r.left, bottom, r.width, r.height);
    spec.camera.aspect = r.width / r.height;
    spec.camera.updateProjectionMatrix();
    c.renderer.render(spec.scene, spec.camera);
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
  window.removeEventListener("scroll", c.onScroll, { capture: true });
  document.removeEventListener("visibilitychange", c.onVisibility);
  c.ro.disconnect();
  c.io.disconnect();
  // envRT owns both the framebuffer and the texture; disposing the texture
  // alone (as this used to) leaked the render target every teardown cycle.
  c.envRT.dispose();
  c.pmrem.dispose();
  c.renderer.dispose();
  c.renderer.forceContextLoss();
  c.canvas.remove();
  ctx = null;
}

/**
 * Losing the last portal usually means "React is re-running an effect", not
 * "the player left the 3D view": ModelStage's effect re-runs on ANY prop change
 * (a worker going downed flips its anim clip), which unmounts and remounts the
 * portal within the same tick. Destroying and rebuilding a WebGL context for
 * that is ruinously expensive, so wait a beat and only tear down if nothing has
 * come back.
 */
function scheduleTeardown() {
  if (teardownTimer) return;
  teardownTimer = window.setTimeout(() => {
    teardownTimer = 0;
    if (ctx && ctx.portals.size === 0) teardown();
  }, TEARDOWN_DELAY_MS);
}

function cancelTeardown() {
  if (teardownTimer) window.clearTimeout(teardownTimer);
  teardownTimer = 0;
}

/** The shared PMREM environment map, for portal scenes that want reflections. */
export function portalEnvironment(): THREE.Texture {
  return ensureCtx().env;
}

/**
 * Register an actor. The returned handle removes it; once the last portal has
 * stayed away for TEARDOWN_DELAY_MS the shared renderer is torn down entirely,
 * freeing the WebGL context.
 */
export function addPortal(spec: PortalSpec): PortalHandle {
  cancelTeardown();
  const c = ensureCtx();
  c.portals.set(spec, { spec, rect: null });
  c.ro.observe(spec.el);
  c.io.observe(spec.el);
  startLoop();
  let live = true;
  return {
    dispose() {
      if (!live) return;
      live = false;
      // A handle can outlive its context (teardown + recreate). Acting on the
      // CURRENT ctx here would evict a portal that isn't ours and, worse, tear
      // down a live context — blanking every actor on screen.
      if (c !== ctx) return;
      c.portals.delete(spec);
      c.ro.unobserve(spec.el);
      c.io.unobserve(spec.el);
      if (c.portals.size === 0) scheduleTeardown();
    },
  };
}
