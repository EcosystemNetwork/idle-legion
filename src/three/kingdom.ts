// The 3D Underground Kingdom — the game's flagship scene, built procedurally on
// the shared raw-Three engine (see engine.ts). No building GLBs exist, so every
// structure is stylized low-poly geometry themed per building, signed with the
// existing 2D building-icon art, and lit to match the game's dark-vibrant look.
//
// What lives here:
//   • a cavern plaza floor (procedural flagstone texture, drawn on a canvas)
//   • six interactive buildings on a ring, each entering a game view on click
//   • a rotating crystal monument + flickering torches + drifting dust motes
//   • a small pool of animated kek dwellers wandering the plaza
//   • pointer picking (hover lift + glow, click → onEnter) and a damped,
//     auto-orbiting camera
//
// buildKingdom() returns a handle the React wrapper drives + disposes.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Stage } from "./engine";
import { disposeObject, loadGLB } from "./loaders";
import { KIT } from "../game/config";
import { KEK_MODEL } from "../game/interiors";

// The six buildings, in ring order. id → the App tab entered on click.
export interface BuildingDef {
  id: string;
  name: string;
  sub: string;
  icon: string;
  accent: number; // themed emissive/roof colour
  base: number; // wall colour
}

/**
 * The kingdom's buildings, in ring order. Exported because the DOM hotspot
 * overlay (components/KingdomOverlay) renders one marker per entry and needs
 * the same ids, names and ordering the scene uses.
 */
export const BUILDINGS: BuildingDef[] = [
  { id: "legion", name: "Barracks", sub: "your gladiators", icon: KIT.bld.warhall, accent: 0xff5a4d, base: 0x3a2a2e },
  { id: "arena", name: "Colosseum", sub: "fight world bosses", icon: KIT.bld.colosseum, accent: 0xffc24d, base: 0x3a3326 },
  { id: "raids", name: "War Room", sub: "raid the Wastes", icon: KIT.bld.hunt, accent: 0x6bd36b, base: 0x243026 },
  { id: "stronghold", name: "Deep Works", sub: "mine · forge · granary", icon: KIT.bld.mine, accent: 0x5aa8ff, base: 0x232a3a },
  { id: "treasury", name: "Treasury", sub: "trade, bank & land", icon: KIT.bld.treasury, accent: 0x3ad6c8, base: 0x223330 },
  { id: "codex", name: "Grand Hall", sub: "the Master", icon: KIT.bld.throne, accent: 0xb98bff, base: 0x2c2640 },
];

const RING_RADIUS = 7;
const MAX_DWELLERS = 6;
/** Pedestal height + building-art height (shared by the factory and the bob). */
const BLD_BASE_Y = 0.4;
const BLD_H = 3.4;
const ART_Y = BLD_BASE_Y + BLD_H / 2;

/** Screen-space anchor for one building, in CSS pixels relative to the canvas. */
export interface ProjectedBuilding {
  id: string;
  x: number;
  y: number;
  /** 1 at the ring's near edge, smaller as the building recedes. */
  scale: number;
  /** False when the building is behind the camera. */
  visible: boolean;
  /** Painter's-algorithm depth — larger means further away. */
  depth: number;
}

export interface KingdomHandle {
  /** Reflect live game state (dweller headcount, locked buildings). */
  update: (snap: { dwellers?: number; locked?: readonly string[] }) => void;
  /** Currently-hovered building, for an optional HTML overlay. */
  onHoverChange: (cb: (b: BuildingDef | null) => void) => void;
  /**
   * Per-frame screen positions for the DOM hotspot overlay. The callback fires
   * inside the render loop and is expected to write transforms directly to DOM
   * nodes — routing 60fps through React state would stall the whole app.
   */
  onProject: (cb: (pts: ProjectedBuilding[]) => void) => void;
  /** Programmatically fly to a building, as if it had been clicked. */
  focus: (id: string) => void;
  dispose: () => void;
}

interface BuildingEntry {
  def: BuildingDef;
  group: THREE.Group;
  /** Child of `group` holding everything visible; the hover lift moves THIS. */
  visual: THREE.Group;
  windows: THREE.MeshStandardMaterial;
  art: THREE.Sprite; // the building billboard — bobs independently of the pedestal
  baseY: number;
  hoverT: number; // 0..1 eased hover amount
  /** Gated by progressive unlocks — rendered as a cold, unlit silhouette. */
  locked: boolean;
  /** 0..1 eased lock amount, so the reveal when it unlocks reads as an event. */
  lockT: number;
  /** Reused anchor for the DOM overlay projection; avoids a per-frame alloc. */
  anchor: THREE.Vector3;
}

export function buildKingdom(
  stage: Stage,
  opts: { onEnter: (id: string) => void; dwellers?: number },
): KingdomHandle {
  const { scene, camera, renderer } = stage;
  scene.background = new THREE.Color(0x0b0710);
  scene.fog = new THREE.Fog(0x0b0710, 22, 46);

  const texLoader = new THREE.TextureLoader();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Billboard sprites can't cast shadow-map shadows, so everything is grounded
  // with a cheap radial-gradient contact shadow instead — cheaper than a shadow
  // pass and it suits the painterly art better.
  const shadowTex = track(makeShadowTexture());

  // Honour the OS "reduce motion" setting: no auto-orbit, no camera flights.
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  // --- Lighting: warm key + purple rim + cool ambient (matches BossStage). ---
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x140c1c, 0.5));
  const key = new THREE.DirectionalLight(0xfff2dc, 1.9);
  key.position.set(6, 12, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9d5bff, 1.3);
  rim.position.set(-8, 6, -6);
  scene.add(rim);

  // --- Cavern floor. --------------------------------------------------------
  // Drawn, not photographed: a photo-real cobble texture fought the painterly
  // sprites and flat-shaded geometry, and its 319x380 source tiled with a
  // visible seam. See makeFlagstoneTexture.
  const floorTex = track(makeFlagstoneTexture());
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(4, 4); // ~1m flagstones across the 30m plaza
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Ring rather than circle purely for the radial segments: vertex colours ease
  // the paving into the cavern dark instead of ending on a hard colour step.
  const floorGeo = track(new THREE.RingGeometry(0, 15, 64, 10));
  {
    const pos = floorGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i)) / 15;
      const k = 1 - Math.pow(Math.max(0, (r - 0.3) / 0.7), 1.6) * 0.94;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    floorGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  const floorMat = track(
    new THREE.MeshStandardMaterial({
      map: floorTex,
      vertexColors: true,
      // The plaza sits under a bright key; knocked back so the ground stays
      // ground and the buildings and crystal keep the eye.
      color: 0x9f98b4,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // A darker outer ring so the plaza reads as an island in the dark.
  const ringGeo = track(new THREE.RingGeometry(15, 21, 64));
  const ringMat = track(new THREE.MeshStandardMaterial({ color: 0x0e0a16, roughness: 1 }));
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.01;
  scene.add(ring);

  // --- Central crystal monument. --------------------------------------------
  const monument = new THREE.Group();
  const pedestalGeo = track(new THREE.CylinderGeometry(1.5, 1.9, 0.6, 8));
  const pedestalMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2436, roughness: 0.8 }));
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.y = 0.3;
  monument.add(pedestal);

  const crystalGeo = track(new THREE.OctahedronGeometry(0.9, 0));
  const crystalMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x8b5bff,
      emissive: 0x6a2bff,
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.2,
      flatShading: true,
    }),
  );
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.position.y = 1.7;
  monument.add(crystal);
  const crystalGlow = new THREE.PointLight(0x8b5bff, 6, 12, 2);
  crystalGlow.position.y = 1.7;
  monument.add(crystalGlow);
  scene.add(monument);

  // --- Buildings on the ring. -----------------------------------------------
  const entries: BuildingEntry[] = [];
  const pickables: THREE.Object3D[] = [];
  // Local torch registry so the frame loop can flicker them and a remount never
  // holds a reference to a disposed light.
  const torchLights: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];

  BUILDINGS.forEach((def, i) => {
    const angle = (i / BUILDINGS.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * RING_RADIUS;
    const z = Math.sin(angle) * RING_RADIUS;

    const { group, visual, windows, art } = makeBuilding(def, texLoader, track, shadowTex);
    group.position.set(x, 0, z);
    group.rotation.y = -angle + Math.PI / 2; // face the plaza centre
    group.userData.buildingId = def.id;
    scene.add(group);

    // Torch either side of the door — on the visual group, so they ride the
    // hover lift with the building.
    for (const sx of [-0.95, 0.95]) {
      const torch = makeTorch(track, torchLights);
      torch.position.set(sx, 0, 1.35);
      visual.add(torch);
    }

    entries.push({
      def,
      group,
      visual,
      windows,
      art,
      baseY: 0,
      hoverT: 0,
      locked: false,
      lockT: 0,
      // Sits just above the building art, where the DOM marker hangs.
      anchor: new THREE.Vector3(x, BLD_BASE_Y + BLD_H + 0.5, z),
    });
    // Only the tagged collider picks — see makeBuilding for why the art and
    // name-plate sprites are excluded.
    group.traverse((o) => {
      if (o.userData.pick) pickables.push(o);
    });
  });

  // --- Drifting dust motes. -------------------------------------------------
  const dust = makeDust(track);
  scene.add(dust);

  // --- Camera + damped auto-orbit controls. ---------------------------------
  camera.position.set(0, 11, 18);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 24;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.45; // stay above the floor
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.5;
  controls.update();

  // Pause auto-rotate while the player is dragging; resume after a short idle.
  let resumeTimer = 0;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    if (resumeTimer) window.clearTimeout(resumeTimer);
  });
  controls.addEventListener("end", () => {
    if (resumeTimer) window.clearTimeout(resumeTimer);
    if (reduceMotion) return;
    resumeTimer = window.setTimeout(() => {
      controls.autoRotate = true;
    }, 3500);
  });

  // --- Cinematic "enter the building" camera flight. -------------------------
  // Clicking a building swoops the camera in before the view switches, so the
  // transition reads as walking up to it rather than a hard cut.
  const FLIGHT_MS = 620;
  let flight: {
    fromP: THREE.Vector3;
    toP: THREE.Vector3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
    t: number;
    id: string;
  } | null = null;

  function flyTo(entry: BuildingEntry) {
    if (reduceMotion) {
      opts.onEnter(entry.def.id);
      return;
    }
    const bp = entry.group.position;
    // Sit between the plaza centre and the building, looking at the art.
    const outward = new THREE.Vector3(bp.x, 0, bp.z).normalize();
    flight = {
      fromP: camera.position.clone(),
      toP: new THREE.Vector3(bp.x, 3.4, bp.z).sub(outward.multiplyScalar(5)),
      fromT: controls.target.clone(),
      toT: new THREE.Vector3(bp.x, 1.7, bp.z),
      t: 0,
      id: entry.def.id,
    };
    controls.enabled = false;
    controls.autoRotate = false;
    if (resumeTimer) window.clearTimeout(resumeTimer);
  }

  // --- Pointer picking (hover + click). -------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered: BuildingEntry | null = null;
  let hoverCb: ((b: BuildingDef | null) => void) | null = null;
  let downX = 0;
  let downY = 0;

  // The canvas box only moves on resize/scroll, but pointermove fires up to
  // 1000Hz during a drag — reading it per event forced a layout flush per
  // event. Cache it and invalidate from the things that can actually move it.
  //
  // Those signals aren't complete, though: the canvas also slides when a sibling
  // above it changes height without the canvas itself resizing (a tab unlocking,
  // a banner appearing, the resource row rewrapping). The app re-renders 4x/sec,
  // so a rect stale in that way stays stale — every pick lands offset and the
  // wrong building lights up. Hence the same max-age safety net the portal
  // renderer uses.
  const RECT_MAX_AGE_MS = 250;
  let canvasRect: DOMRect | null = null;
  let canvasRectAt = 0;
  const invalidateRect = () => {
    canvasRect = null;
  };
  const rectRO = new ResizeObserver(invalidateRect);
  rectRO.observe(renderer.domElement);
  window.addEventListener("scroll", invalidateRect, { capture: true, passive: true });
  window.addEventListener("resize", invalidateRect);

  function pick(ev: PointerEvent): BuildingEntry | null {
    const now = performance.now();
    if (!canvasRect || now - canvasRectAt > RECT_MAX_AGE_MS) {
      canvasRect = renderer.domElement.getBoundingClientRect();
      canvasRectAt = now;
    }
    const rect = canvasRect;
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const id = o.userData.buildingId as string | undefined;
        if (id) return entries.find((e) => e.def.id === id) ?? null;
        o = o.parent;
      }
    }
    return null;
  }

  // Hover picking raycasts ~60 objects; at pointer-event rate that is pure
  // waste since nothing can change between frames anyway. Stash the latest
  // event and resolve it once per frame in the render loop. (Click picking
  // below stays synchronous — a click must hit exactly what was under the
  // cursor at pointerup, not one frame's worth of camera drift later.)
  let pendingMove: PointerEvent | null = null;

  function applyHover(ev: PointerEvent) {
    const hit = pick(ev);
    if (hit === hovered) return;
    hovered = hit;
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    hoverCb?.(hit?.def ?? null);
  }

  const onMove = (ev: PointerEvent) => {
    pendingMove = ev;
  };
  const onDown = (ev: PointerEvent) => {
    downX = ev.clientX;
    downY = ev.clientY;
    // Entering the wrong building is the one misfire the player really notices,
    // so the click's pick never runs on a cached box, however fresh.
    invalidateRect();
  };
  const onUp = (ev: PointerEvent) => {
    // Only count as a click if the pointer barely moved (not a camera drag).
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
    if (flight) return; // already flying somewhere
    const hit = pick(ev);
    if (hit) flyTo(hit);
  };
  const el = renderer.domElement;
  el.style.cursor = "grab";
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointerup", onUp);

  // --- Kek dwellers wandering the plaza. -----------------------------------
  const dwellers = new DwellerCrowd(
    scene,
    Math.min(MAX_DWELLERS, opts.dwellers ?? MAX_DWELLERS),
    shadowTex,
    // Keks walk between the buildings rather than orbiting the plaza.
    entries.map((e) => e.group.position.clone()),
  );

  // --- DOM hotspot projection. ----------------------------------------------
  // The overlay's markers are real DOM (labels, badges, tap targets), so their
  // screen positions have to be recomputed every frame as the camera orbits.
  // The array and its entries are allocated once and mutated in place — this
  // runs at 60fps and a fresh array per frame would churn the GC hard.
  let projectCb: ((pts: ProjectedBuilding[]) => void) | null = null;
  const projected: ProjectedBuilding[] = entries.map((e) => ({
    id: e.def.id,
    x: 0,
    y: 0,
    scale: 1,
    visible: false,
    depth: 0,
  }));
  const projScratch = new THREE.Vector3();

  function emitProjection() {
    if (!projectCb) return;
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    if (!w || !h) return;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const p = projected[i];
      projScratch.copy(e.anchor);
      // Ride the hover lift so the marker stays glued to its building.
      projScratch.y += e.visual.position.y;
      const dist = camera.position.distanceTo(projScratch);
      projScratch.project(camera);
      p.visible = projScratch.z < 1;
      p.x = (projScratch.x * 0.5 + 0.5) * w;
      p.y = (-projScratch.y * 0.5 + 0.5) * h;
      p.depth = dist;
      // Markers shrink with distance but never below 78% — a label the player
      // can't read is worse than one that's slightly out of perspective.
      p.scale = Math.max(0.78, Math.min(1.12, 15 / dist));
    }
    projectCb(projected);
  }

  // --- Per-frame animation. -------------------------------------------------
  const unsub = stage.onFrame((dt, t) => {
    // Resolve at most one hover raycast per frame (see pendingMove).
    if (pendingMove) {
      const ev = pendingMove;
      pendingMove = null;
      applyHover(ev);
    }

    // A camera flight owns the camera until it lands, then enters the view.
    if (flight) {
      flight.t = Math.min(1, flight.t + (dt * 1000) / FLIGHT_MS);
      const k = easeInOutCubic(flight.t);
      camera.position.lerpVectors(flight.fromP, flight.toP, k);
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      camera.lookAt(controls.target);
      if (flight.t >= 1) {
        const id = flight.id;
        flight = null;
        opts.onEnter(id);
      }
    }
    controls.update();

    crystal.rotation.y += dt * 0.6;
    crystal.position.y = 1.7 + Math.sin(t * 1.4) * 0.08;
    crystalMat.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.35;
    crystalGlow.intensity = 5 + Math.sin(t * 2.2) * 1.8;

    dust.rotation.y += dt * 0.02;

    for (const e of entries) {
      const target = e === hovered ? 1 : 0;
      e.hoverT += (target - e.hoverT) * Math.min(1, dt * 10);
      // Lift the visuals only — `group` (and with it the pick collider) holds
      // still, so the hovered building can't rise out from under the cursor and
      // start flickering between itself and its neighbour.
      e.visual.position.y = e.hoverT * 0.35;
      // Gentle idle bob on the art only — a floating pedestal would read wrong.
      // Locked buildings hold perfectly still: stillness is what sells "dormant".
      const bob = (1 - e.lockT) * Math.sin(t * 1.15 + e.group.position.x * 1.3) * 0.06;
      e.art.position.y = ART_Y + bob;

      // Locked buildings render as cold silhouettes — the art drained toward
      // black-violet and the torch-lit rim gone dark. Eased rather than
      // switched, so the moment a system unlocks the building visibly wakes up.
      const lockTarget = e.locked ? 1 : 0;
      e.lockT += (lockTarget - e.lockT) * Math.min(1, dt * 3);
      if (e.lockT > 0.002 || lockTarget > 0) {
        const k = e.lockT;
        // Toward a dim violet-grey rather than pure black, so the silhouette
        // still separates from the cavern floor behind it.
        e.art.material.color.setRGB(1 - k * 0.78, 1 - k * 0.82, 1 - k * 0.7);
        e.art.material.opacity = 1 - k * 0.22;
        e.windows.emissive.setHex(e.locked ? 0x5b5170 : e.def.accent);
      }
      e.windows.emissiveIntensity =
        (1 - e.lockT * 0.82) *
        (0.8 + e.hoverT * 1.6 + Math.sin(t * 3 + e.group.position.x) * 0.1);
    }

    for (const tr of torchLights) {
      tr.light.intensity = tr.base * (0.75 + Math.abs(Math.sin(t * 9 + tr.phase)) * 0.5);
    }

    dwellers.update(dt, t);

    // Last, so the markers land on the camera position this frame actually
    // rendered — projecting earlier leaves the labels a frame behind the world.
    emitProjection();
  });

  return {
    update(snap) {
      if (typeof snap.dwellers === "number") dwellers.setActive(snap.dwellers);
      if (snap.locked) {
        const set = new Set(snap.locked);
        for (const e of entries) e.locked = set.has(e.def.id);
      }
    },
    onHoverChange(cb) {
      hoverCb = cb;
    },
    onProject(cb) {
      projectCb = cb;
      emitProjection(); // paint once immediately so markers don't pop in
    },
    focus(id) {
      const entry = entries.find((e) => e.def.id === id);
      if (entry && !flight) flyTo(entry);
    },
    dispose() {
      unsub();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      rectRO.disconnect();
      window.removeEventListener("scroll", invalidateRect, { capture: true });
      window.removeEventListener("resize", invalidateRect);
      pendingMove = null;
      projectCb = null;
      if (resumeTimer) window.clearTimeout(resumeTimer);
      controls.dispose();
      dwellers.dispose();
      for (const e of entries) {
        scene.remove(e.group);
        disposeObject(e.group);
      }
      scene.remove(monument, floor, ring, dust);
      disposeObject(monument);
      for (const d of disposables) d.dispose();
      scene.background = null;
      scene.fog = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Building factory
// ---------------------------------------------------------------------------

/** Ease used by the building fly-to so it starts and lands softly. */
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Small deterministic PRNG so the plaza looks identical on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The cavern plaza floor: hand-cut flagstones drawn procedurally rather than a
 * photo texture, so the ground matches the scene's painterly low-poly look and
 * the game's cool-purple / torch-warm palette.
 *
 * Seamless by construction — the stones sit on a jittered lattice whose jitter
 * wraps at the tile edge, so no stone ever crosses the seam and the boundary
 * vertices on opposite sides are identical.
 */
function makeFlagstoneTexture(): THREE.CanvasTexture {
  const S = 1024; // tile resolution
  const N = 7; // lattice cells per side
  const CELL = S / N;
  const GAP = CELL * 0.036; // mortar recess between stones
  const rnd = mulberry32(0x5eed1e);

  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;

  // Mortar / packed-dirt bed showing through the joints.
  g.fillStyle = "#1a1524";
  g.fillRect(0, 0, S, S);

  // Jittered lattice. Index modulo N so column/row N reuses column/row 0's
  // offset — that's what keeps the tile seamless.
  const J = CELL * 0.17;
  const jit: Array<Array<[number, number]>> = [];
  for (let i = 0; i <= N; i++) {
    jit[i] = [];
    for (let j = 0; j <= N; j++) {
      const si = i % N;
      const sj = j % N;
      const r = mulberry32(0x1000 + si * 131 + sj * 977);
      jit[i][j] = [(r() - 0.5) * 2 * J, (r() - 0.5) * 2 * J];
    }
  }
  // Edge vertices stay pinned on the seam line so opposite edges line up.
  const vert = (i: number, j: number): [number, number] => {
    const [dx, dy] = jit[i][j];
    return [i * CELL + (i === 0 || i === N ? 0 : dx), j * CELL + (j === 0 || j === N ? 0 : dy)];
  };

  // Chipping profile for edges that sit on the tile boundary. Every harmonic
  // has a whole number of periods across S, so seamWave(t) === seamWave(t + S)
  // and the two sides of the seam chip identically.
  const W = (Math.PI * 2) / S;
  const seamWave = (t: number): number =>
    ((Math.sin(W * 7 * t) + 0.7 * Math.sin(W * 13 * t + 1.7) + 0.45 * Math.sin(W * 23 * t + 3.3)) / 2.15) *
    GAP *
    0.85;

  // Claim cells into stones of 1x1, 2x1 or 1x2 so the grid stops reading as a grid.
  const used: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const stones: Array<Array<[number, number]>> = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (used[i][j]) continue;
      let w = 1;
      let h = 1;
      const roll = rnd();
      if (roll < 0.26 && i + 1 < N && !used[i + 1][j]) w = 2;
      else if (roll < 0.5 && j + 1 < N && !used[i][j + 1]) h = 2;
      for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) used[i + a][j + b] = true;

      // Trace the outline through every boundary vertex (not just the corners),
      // so a merged stone still interlocks with its jittered neighbours.
      const poly: Array<[number, number]> = [];
      for (let a = 0; a <= w; a++) poly.push(vert(i + a, j));
      for (let b = 1; b <= h; b++) poly.push(vert(i + w, j + b));
      for (let a = w - 1; a >= 0; a--) poly.push(vert(i + a, j + h));
      for (let b = h - 1; b >= 1; b--) poly.push(vert(i, j + b));

      // Rough the cut edges up. Dead-straight edges are the strongest "this was
      // generated" tell; real quarried stone chips. The roughened outline is
      // computed once and reused by every pass so fill, bevel and joint agree.
      const rough: Array<[number, number]> = [];
      for (let k = 0; k < poly.length; k++) {
        const [ax, ay] = poly[k];
        const [bx, by] = poly[(k + 1) % poly.length];
        // Edges on the tile boundary get the S-periodic waveform instead of
        // free jitter, so the stone on the far side of the seam chips to
        // exactly the same profile. Displacement is expressed on the fixed
        // axis, not along the normal, since winding flips between the two sides.
        const seamX = (ax === 0 && bx === 0) || (ax === S && bx === S);
        const seamY = (ay === 0 && by === 0) || (ay === S && by === S);
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / len;
        const ny = (bx - ax) / len;
        const steps = Math.max(2, Math.round(len / 24));
        for (let t = 0; t < steps; t++) {
          const f = t / steps;
          const px = ax + (bx - ax) * f;
          const py = ay + (by - ay) * f;
          if (seamX) rough.push([px + seamWave(py), py]);
          else if (seamY) rough.push([px, py + seamWave(px)]);
          else {
            const amp = (rnd() - 0.5) * 2 * GAP * 0.85;
            rough.push([px + nx * amp, py + ny * amp]);
          }
        }
      }
      stones.push(rough);
    }
  }

  const trace = (poly: Array<[number, number]>, inset: number, dx = 0, dy = 0) => {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of poly) {
      cx += x;
      cy += y;
    }
    cx /= poly.length;
    cy /= poly.length;
    g.beginPath();
    poly.forEach(([x, y], k) => {
      const len = Math.hypot(x - cx, y - cy) || 1;
      const px = x + ((cx - x) / len) * inset + dx;
      const py = y + ((cy - y) / len) * inset + dy;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
  };

  for (const poly of stones) {
    // Cool basalt with a faint purple undertone; a minority of stones carry a
    // warmer, torch-lit cast so the plaza isn't monochrome. Saturation stays
    // low on purpose — stone reads as stone through value, not hue.
    const warm = rnd() < 0.12;
    const hue = warm ? 30 + rnd() * 12 : 256 + rnd() * 18;
    const sat = warm ? 3 + rnd() * 3 : 4 + rnd() * 5;
    const lum = 18 + rnd() * 10;

    g.save();
    trace(poly, GAP);
    g.clip();
    g.fillStyle = `hsl(${hue} ${sat}% ${lum}%)`;
    g.fill();

    // Chiselled bevel: light catches the top-left cut, the bottom-right recedes.
    g.globalCompositeOperation = "source-atop";
    trace(poly, GAP + 2, -1.6, -1.6);
    g.fillStyle = `hsl(${hue} ${sat}% ${lum + 6}%)`;
    g.fill();
    trace(poly, GAP + 2, 1.6, 2);
    g.fillStyle = `hsl(${hue} ${sat}% ${Math.max(6, lum - 7)}%)`;
    g.fill();
    trace(poly, GAP + 4.5, 0, 0);
    g.fillStyle = `hsl(${hue} ${sat}% ${lum}%)`;
    g.fill();

    // Weathering: mineral speckle, then a hairline crack or two — scattered
    // across the stone's own bounding box, since the clip discards the rest.
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const bw = Math.max(...xs) - x0;
    const bh = Math.max(...ys) - y0;
    // Soft blotches first (the cloudy weathering that stops a stone reading as
    // a flat fill), then hard speckle on top (grit and mineral flecks).
    for (let k = 0; k < 14; k++) {
      const x = x0 + rnd() * bw;
      const y = y0 + rnd() * bh;
      const r = 12 + rnd() * 48;
      const dl = (rnd() - 0.5) * 13;
      const blob = g.createRadialGradient(x, y, 0, x, y, r);
      blob.addColorStop(0, `hsl(${hue} ${sat}% ${lum + dl}% / 0.5)`);
      blob.addColorStop(1, `hsl(${hue} ${sat}% ${lum + dl}% / 0)`);
      g.fillStyle = blob;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let k = 0; k < 900; k++) {
      const x = x0 + rnd() * bw;
      const y = y0 + rnd() * bh;
      const d = rnd() * 2.6 + 0.4;
      g.fillStyle = `hsl(${hue} ${sat}% ${lum + (rnd() - 0.45) * 30}% / ${0.14 + rnd() * 0.3})`;
      g.fillRect(x, y, d, d);
    }
    if (rnd() < 0.55) {
      let x = x0 + rnd() * bw;
      let y = y0 + rnd() * bh;
      g.strokeStyle = `hsl(${hue} ${sat}% ${Math.max(5, lum - 12)}% / 0.5)`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();

    // Contact shading in the joint, so stones sit *in* the bed rather than on
    // it. Kept soft — a hard black line reads as a cel-shaded outline.
    trace(poly, GAP - 1);
    g.strokeStyle = "rgba(10, 7, 17, 0.32)";
    g.lineWidth = 3;
    g.stroke();
  }

  // Low-frequency wear crossing stone boundaries: foot-polish and dust drifts
  // that don't respect the masonry. Drawn as a 3x3 wrapped stamp so blotches
  // straddling the tile edge continue correctly on the far side.
  for (let k = 0; k < 18; k++) {
    const bx = rnd() * S;
    const by = rnd() * S;
    const r = 90 + rnd() * 180;
    const dark = rnd() < 0.6;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x = bx + ox * S;
        const y = by + oy * S;
        if (x + r < 0 || x - r > S || y + r < 0 || y - r > S) continue;
        const blob = g.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, dark ? "rgba(9, 6, 15, 0.3)" : "rgba(226, 214, 236, 0.075)");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = blob;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  }

  // Fine grain over everything, kept clear of the seam so it can't mismatch.
  for (let k = 0; k < 5000; k++) {
    const x = 3 + rnd() * (S - 6);
    const y = 3 + rnd() * (S - 6);
    g.fillStyle = rnd() < 0.5 ? "rgba(255,246,230,0.035)" : "rgba(0,0,0,0.06)";
    g.fillRect(x, y, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft radial-gradient blob used as a fake contact shadow under actors. */
function makeShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, "rgba(0,0,0,0.6)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A ground-plane contact shadow sized to the actor standing on it. */
function makeContactShadow(tex: THREE.Texture, size: number, opacity = 1): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

function makeBuilding(
  def: BuildingDef,
  texLoader: THREE.TextureLoader,
  track: <T extends { dispose: () => void }>(x: T) => T,
  shadowTex: THREE.Texture,
): { group: THREE.Group; visual: THREE.Group; windows: THREE.MeshStandardMaterial; art: THREE.Sprite } {
  const g = new THREE.Group();

  // Everything visible hangs off `vis`, which is what the hover lift raises.
  // The pick collider below stays on `g` so it never moves out from under the
  // cursor — a lifting collider makes hover flicker on/off at the bottom edge.
  const vis = new THREE.Group();
  g.add(vis);

  // Contact shadow first, so the halo's glow sits on top of it.
  vis.add(makeContactShadow(shadowTex, 3.2, 0.85));

  // The building IS the painterly art: a grounded, camera-facing billboard on a
  // carved pedestal. (Primitive box+cone houses read as programmer art here.)

  // Carved stone pedestal.
  const padMat = track(new THREE.MeshStandardMaterial({ color: 0x2b2536, roughness: 0.92 }));
  const padGeo = track(new THREE.CylinderGeometry(1.5, 1.78, BLD_BASE_Y, 8));
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.y = BLD_BASE_Y / 2;
  vis.add(pad);

  // Accent rim light around the pedestal — also the hover-pulse surface.
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.8,
      roughness: 0.45,
      metalness: 0.2,
    }),
  );
  const rimGeo = track(new THREE.TorusGeometry(1.53, 0.07, 8, 32));
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BLD_BASE_Y;
  vis.add(rim);

  const iconTex = texLoader.load(def.icon, (t) => {
    // Preserve the art's aspect once the image is known, keeping its base on
    // the pedestal rather than stretching it into a square.
    const img = t.image as { width: number; height: number } | undefined;
    if (!img?.width || !img?.height) return;
    const aspect = img.width / img.height;
    sprite.scale.set(BLD_H * aspect, BLD_H, 1);
    sprite.position.y = ART_Y;
  });
  iconTex.colorSpace = THREE.SRGBColorSpace;
  track(iconTex);
  const iconMat = track(new THREE.SpriteMaterial({ map: iconTex, transparent: true, depthWrite: false }));
  const sprite = new THREE.Sprite(iconMat);
  sprite.scale.set(BLD_H, BLD_H, 1);
  sprite.position.set(0, ART_Y, 0);
  vis.add(sprite);

  // Invisible collider — the ONE pick target for this building (userData.pick).
  //
  // It has to be a box rather than the art itself because a Sprite raycasts as
  // its whole camera-facing quad, transparent margins included: the art PNGs are
  // mostly padding, so neighbouring buildings' quads overlap heavily on the ring
  // and whichever happened to be nearer the camera stole the hover — you aimed at
  // the Bazaar and entered the War Room. Same for the name plates, which are wide
  // text quads. So the sprites are deliberately NOT pickable; this box is.
  const hitGeo = track(new THREE.BoxGeometry(2.8, BLD_H, 1.4));
  const hitMat = track(new THREE.MeshBasicMaterial({ visible: false }));
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.y = ART_Y;
  hit.userData.pick = true;
  g.add(hit);

  // No name plate here any more: the DOM hotspot overlay draws the label, which
  // gives it real typography, hover/tap states, live status badges and a
  // guaranteed-legible size at any camera distance. A canvas sprite could do
  // none of that.

  return { group: g, visual: vis, windows: rimMat, art: sprite };
}

function makeTorch(
  track: <T extends { dispose: () => void }>(x: T) => T,
  registry: Array<{ light: THREE.PointLight; base: number; phase: number }>,
): THREE.Group {
  const t = new THREE.Group();
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2028, roughness: 0.9 }));
  const poleGeo = track(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6));
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 0.55;
  t.add(pole);

  const flameMat = track(new THREE.MeshBasicMaterial({ color: 0xffa53d }));
  const flameGeo = track(new THREE.IcosahedronGeometry(0.14, 0));
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 1.18;
  t.add(flame);

  const light = new THREE.PointLight(0xff8a3d, 2.4, 5, 2);
  light.position.y = 1.2;
  t.add(light);
  registry.push({ light, base: 2.4, phase: registry.length * 1.7 });
  return t;
}

function makeDust(track: <T extends { dispose: () => void }>(x: T) => T): THREE.Points {
  const N = 240;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 3 + Math.random() * 12;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.5 + Math.random() * 7;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = track(new THREE.PointsMaterial({ color: 0xb9a6ff, size: 0.06, transparent: true, opacity: 0.5, depthWrite: false }));
  return new THREE.Points(geo, mat);
}

// ---------------------------------------------------------------------------
// Dweller crowd — animated keks wandering the plaza on lazy circular paths.
// ---------------------------------------------------------------------------

/** One-shot clips a loitering kek drops into so the plaza isn't all walking. */
const FLOURISHES = ["Dance", "Taunt", "Spin", "Attack", "ComboAttack", "Arise"];

interface Dweller {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
  idle: THREE.AnimationAction | null;
  flourishes: THREE.AnimationAction[];
  /** 0 = fully idle, 1 = fully travelling (crossfade weight). */
  moveW: number;
  /** 0 = walking, 1 = running (split of `moveW` between the two gaits). */
  runW: number;
  /** True while a one-shot flourish owns the pose. */
  busy: boolean;
  /** The flourish currently fading in/out, if any — locomotion is its complement. */
  active: THREE.AnimationAction | null;
  /** How much of the pose the flourish owns (0..1); locomotion gets the rest. */
  flourishW: number;
  /** 1 while the flourish plays, 0 once it has finished and is handing back. */
  flourishTarget: number;
  /** Seconds of loitering left before the next flourish fires. */
  untilFlourish: number;
  target: THREE.Vector3;
  speed: number;
  /** A long haul across the plaza is run, not walked. */
  hurried: boolean;
  /** Seconds left loitering before picking a new destination. */
  waiting: number;
}

/** Shortest-path angle lerp so keks turn the near way round. */
function turnToward(from: number, to: number, k: number): number {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

class DwellerCrowd {
  private scene: THREE.Scene;
  private dwellers: Dweller[] = [];
  private active: number;
  private ready = false;
  private disposed = false;
  private shadowTex: THREE.Texture;
  private waypoints: THREE.Vector3[];

  constructor(
    scene: THREE.Scene,
    count: number,
    shadowTex: THREE.Texture,
    waypoints: THREE.Vector3[] = [],
  ) {
    this.scene = scene;
    this.active = count;
    this.shadowTex = shadowTex;
    this.waypoints = waypoints;
    void this.load(count);
  }

  /** A loiter spot in front of a random building (or anywhere, if none given). */
  private pickPoint(): THREE.Vector3 {
    const a = Math.random() * Math.PI * 2;
    if (this.waypoints.length === 0) {
      const r = 2.5 + Math.random() * 4;
      return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    const w = this.waypoints[Math.floor(Math.random() * this.waypoints.length)];
    const r = 1.9 + Math.random() * 1.2; // stand in front of it, not inside it
    return new THREE.Vector3(w.x + Math.cos(a) * r, 0, w.z + Math.sin(a) * r);
  }

  private async load(count: number) {
    try {
      const { scene: model, animations } = await loadGLB(KEK_MODEL);
      if (this.disposed) {
        disposeObject(model);
        return;
      }
      const find = (name: string) =>
        animations.find((a) => a.name.toLowerCase() === name.toLowerCase()) ??
        animations.find((a) => a.name.toLowerCase().includes(name.toLowerCase())) ??
        null;
      // Keks run idle/walk/run together and crossfade between them, so they
      // pick a gait to travel and settle into idle while loitering.
      const idleClip = find("Idle") ?? animations[0] ?? null;
      const walkClip = find("Walk");
      const runClip = find("Run");
      const flourishClips = FLOURISHES.map(find).filter(
        (c): c is THREE.AnimationClip => !!c,
      );
      for (let i = 0; i < count; i++) {
        const root = cloneSkinned(model);
        root.scale.setScalar(1.05);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.frustumCulled = false;
        });
        const mixer = new THREE.AnimationMixer(root);
        const idle = idleClip ? mixer.clipAction(idleClip) : null;
        const walk = walkClip ? mixer.clipAction(walkClip) : null;
        const run = runClip ? mixer.clipAction(runClip) : null;
        idle?.play();
        walk?.play();
        run?.play();
        idle?.setEffectiveWeight(1);
        walk?.setEffectiveWeight(0);
        run?.setEffectiveWeight(0);
        // Flourishes are one-shots that take over the pose, then hand it back.
        const flourishes = flourishClips.map((c) => {
          const a = mixer.clipAction(c);
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
          return a;
        });
        const self: Dweller = {
          root,
          mixer,
          walk,
          run,
          idle,
          flourishes,
          moveW: 0,
          runW: 0,
          busy: false,
          active: null,
          flourishW: 0,
          flourishTarget: 0,
          untilFlourish: 1 + Math.random() * 5,
          target: this.pickPoint(),
          speed: 1.15 + (i % 4) * 0.18,
          hurried: false,
          waiting: Math.random() * 2,
        };
        // One blend value drives both sides of the handover, so the flourish and
        // the locomotion pair always sum to a full pose. The clip holds its last
        // frame (clampWhenFinished) while it fades back out.
        mixer.addEventListener("finished", () => {
          self.busy = false;
          self.flourishTarget = 0;
          self.untilFlourish = 3 + Math.random() * 7;
        });
        // Ride-along contact shadow so the kek reads as standing on the floor.
        root.add(makeContactShadow(this.shadowTex, 1.3, 0.7));
        root.position.copy(this.pickPoint());
        this.scene.add(root);
        this.dwellers.push(self);
      }
      this.ready = true;
      this.applyActive();
      // The clone shares geometry/materials with `model`; keep `model` cached in
      // the loader but drop this standalone copy's scene wrapper reference.
    } catch {
      /* dwellers are cosmetic — a load failure just leaves an empty plaza */
    }
  }

  private applyActive() {
    this.dwellers.forEach((d, i) => {
      d.root.visible = i < this.active;
    });
  }

  setActive(n: number) {
    this.active = Math.max(0, Math.min(this.dwellers.length || MAX_DWELLERS, n));
    if (this.ready) this.applyActive();
  }

  update(dt: number, _t: number) {
    if (!this.ready) return;
    for (const d of this.dwellers) {
      if (!d.root.visible) continue;
      d.mixer.update(dt);

      let moving = false;
      if (d.waiting > 0) {
        // Loitering in front of a building — every so often, show off.
        d.waiting -= dt;
        if (!d.busy && d.flourishes.length > 0) {
          d.untilFlourish -= dt;
          if (d.untilFlourish <= 0) {
            const f = d.flourishes[Math.floor(Math.random() * d.flourishes.length)];
            d.busy = true;
            d.active = f;
            d.flourishTarget = 1;
            // No fadeIn/fadeOut here: `flourishW` below owns this action's
            // weight outright, and three would multiply a fade interpolant into
            // whatever we set, leaving the blend short of a full pose.
            f.reset().setEffectiveWeight(d.flourishW).play();
          }
        }
        if (d.waiting <= 0 && !d.busy) {
          d.target = this.pickPoint();
          // Long hauls across the plaza get run, short hops get walked.
          d.hurried = d.root.position.distanceTo(d.target) > 5;
        } else if (d.waiting <= 0) {
          d.waiting = 0.2; // mid-flourish — hold position until it lands
        }
      } else {
        const p = d.root.position;
        const dx = d.target.x - p.x;
        const dz = d.target.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.3) {
          d.waiting = 1.5 + Math.random() * 4; // arrived — hang about a while
        } else {
          moving = true;
          const gait = d.hurried ? 1.85 : 1;
          const step = Math.min(dist, d.speed * gait * dt);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          d.root.rotation.y = turnToward(
            d.root.rotation.y,
            Math.atan2(dx, dz),
            Math.min(1, dt * 6),
          );
        }
      }

      // Crossfade Idle ⇄ Walk ⇄ Run so nobody moonwalks. A flourish owns the
      // pose outright while it plays, so the whole locomotion blend backs off.
      d.moveW += ((moving ? 1 : 0) - d.moveW) * Math.min(1, dt * 8);
      d.runW += ((d.hurried ? 1 : 0) - d.runW) * Math.min(1, dt * 5);
      // Locomotion gets exactly what the flourish isn't using: the four weights
      // always sum to 1. Any shortfall is blended toward the bind pose by three,
      // which reads on screen as the kek snapping into a T-pose.
      d.flourishW += (d.flourishTarget - d.flourishW) * Math.min(1, dt * 5);
      if (d.active) {
        d.active.setEffectiveWeight(d.flourishW);
        // Fully handed back — stop the one-shot so it isn't sampled every frame.
        if (d.flourishTarget === 0 && d.flourishW < 0.002) {
          d.active.stop();
          d.active = null;
          d.flourishW = 0;
        }
      }
      const locoW = 1 - d.flourishW;
      d.walk?.setEffectiveWeight(locoW * d.moveW * (1 - d.runW));
      d.run?.setEffectiveWeight(locoW * d.moveW * d.runW);
      d.idle?.setEffectiveWeight(locoW * (1 - d.moveW));
    }
  }

  dispose() {
    this.disposed = true;
    for (const d of this.dwellers) {
      d.mixer.stopAllAction();
      this.scene.remove(d.root);
      // Frees only what this dweller owns (its contact-shadow plane); the kek's
      // geometry/materials belong to the loader's shared master — see loaders.
      disposeObject(d.root);
    }
    this.dwellers = [];
  }
}
