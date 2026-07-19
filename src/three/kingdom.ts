// The 3D Underground Kingdom — the game's flagship scene, built procedurally on
// the shared raw-Three engine (see engine.ts). No building GLBs exist, so every
// structure is stylized low-poly geometry themed per building, signed with the
// existing 2D building-icon art, and lit to match the game's dark-vibrant look.
//
// What lives here:
//   • a cavern plaza floor (tiled floor texture)
//   • six interactive buildings on a ring, each entering a game view on click
//   • a rotating crystal monument + flickering torches + drifting dust motes
//   • a small pool of animated frog dwellers wandering the plaza
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
import { FROG_MODEL } from "../game/interiors";

// The six buildings, in ring order. id → the App tab entered on click.
export interface BuildingDef {
  id: string;
  name: string;
  sub: string;
  icon: string;
  accent: number; // themed emissive/roof colour
  base: number; // wall colour
}

const BUILDINGS: BuildingDef[] = [
  { id: "legion", name: "Barracks", sub: "your gladiators", icon: KIT.bld.warhall, accent: 0xff5a4d, base: 0x3a2a2e },
  { id: "arena", name: "Colosseum", sub: "fight world bosses", icon: KIT.bld.colosseum, accent: 0xffc24d, base: 0x3a3326 },
  { id: "raids", name: "War Room", sub: "raid the Wastes", icon: KIT.bld.hunt, accent: 0x6bd36b, base: 0x243026 },
  { id: "stronghold", name: "Deep Works", sub: "mine · forge · granary", icon: KIT.bld.mine, accent: 0x5aa8ff, base: 0x232a3a },
  { id: "market", name: "Bazaar", sub: "trade on-chain", icon: KIT.bld.treasury, accent: 0x3ad6c8, base: 0x223330 },
  { id: "codex", name: "Grand Hall", sub: "the Master", icon: KIT.bld.throne, accent: 0xb98bff, base: 0x2c2640 },
];

const RING_RADIUS = 7;
const MAX_DWELLERS = 6;

export interface KingdomHandle {
  /** Reflect live game state (dweller headcount shown wandering). */
  update: (snap: { dwellers?: number }) => void;
  /** Currently-hovered building, for an optional HTML overlay. */
  onHoverChange: (cb: (b: BuildingDef | null) => void) => void;
  dispose: () => void;
}

interface BuildingEntry {
  def: BuildingDef;
  group: THREE.Group;
  windows: THREE.MeshStandardMaterial;
  baseY: number;
  hoverT: number; // 0..1 eased hover amount
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

  // --- Lighting: warm key + purple rim + cool ambient (matches BossStage). ---
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x140c1c, 0.5));
  const key = new THREE.DirectionalLight(0xfff2dc, 1.9);
  key.position.set(6, 12, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9d5bff, 1.3);
  rim.position.set(-8, 6, -6);
  scene.add(rim);

  // --- Cavern floor. --------------------------------------------------------
  const floorTex = texLoader.load(KIT.tex.floor);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(8, 8);
  track(floorTex);
  const floorGeo = track(new THREE.CircleGeometry(15, 64));
  const floorMat = track(
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0x6b6472, roughness: 0.95, metalness: 0.05 }),
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

    const { group, windows } = makeBuilding(def, texLoader, track);
    group.position.set(x, 0, z);
    group.rotation.y = -angle + Math.PI / 2; // face the plaza centre
    group.userData.buildingId = def.id;
    scene.add(group);

    // Torch either side of the door.
    for (const sx of [-0.95, 0.95]) {
      const torch = makeTorch(track, torchLights);
      torch.position.set(sx, 0, 1.35);
      group.add(torch);
    }

    entries.push({ def, group, windows, baseY: 0, hoverT: 0 });
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) pickables.push(o);
    });
  });

  // --- Drifting dust motes. -------------------------------------------------
  const dust = makeDust(track);
  scene.add(dust);

  // --- Camera + damped auto-orbit controls. ---------------------------------
  camera.position.set(0, 9.5, 15.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 24;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.45; // stay above the floor
  controls.autoRotate = true;
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
    resumeTimer = window.setTimeout(() => {
      controls.autoRotate = true;
    }, 3500);
  });

  // --- Pointer picking (hover + click). -------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered: BuildingEntry | null = null;
  let hoverCb: ((b: BuildingDef | null) => void) | null = null;
  let downX = 0;
  let downY = 0;

  function pick(ev: PointerEvent): BuildingEntry | null {
    const rect = renderer.domElement.getBoundingClientRect();
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

  const onMove = (ev: PointerEvent) => {
    const hit = pick(ev);
    if (hit === hovered) return;
    hovered = hit;
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    hoverCb?.(hit?.def ?? null);
  };
  const onDown = (ev: PointerEvent) => {
    downX = ev.clientX;
    downY = ev.clientY;
  };
  const onUp = (ev: PointerEvent) => {
    // Only count as a click if the pointer barely moved (not a camera drag).
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
    const hit = pick(ev);
    if (hit) opts.onEnter(hit.def.id);
  };
  const el = renderer.domElement;
  el.style.cursor = "grab";
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointerup", onUp);

  // --- Frog dwellers wandering the plaza. -----------------------------------
  const dwellers = new DwellerCrowd(scene, Math.min(MAX_DWELLERS, opts.dwellers ?? MAX_DWELLERS));

  // --- Per-frame animation. -------------------------------------------------
  const unsub = stage.onFrame((dt, t) => {
    controls.update();

    crystal.rotation.y += dt * 0.6;
    crystal.position.y = 1.7 + Math.sin(t * 1.4) * 0.08;
    crystalMat.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.35;
    crystalGlow.intensity = 5 + Math.sin(t * 2.2) * 1.8;

    dust.rotation.y += dt * 0.02;

    for (const e of entries) {
      const target = e === hovered ? 1 : 0;
      e.hoverT += (target - e.hoverT) * Math.min(1, dt * 10);
      e.group.position.y = e.hoverT * 0.35;
      e.windows.emissiveIntensity = 0.8 + e.hoverT * 1.6 + Math.sin(t * 3 + e.group.position.x) * 0.1;
    }

    for (const tr of torchLights) {
      tr.light.intensity = tr.base * (0.75 + Math.abs(Math.sin(t * 9 + tr.phase)) * 0.5);
    }

    dwellers.update(dt, t);
  });

  return {
    update(snap) {
      if (typeof snap.dwellers === "number") dwellers.setActive(snap.dwellers);
    },
    onHoverChange(cb) {
      hoverCb = cb;
    },
    dispose() {
      unsub();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
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

function makeBuilding(
  def: BuildingDef,
  texLoader: THREE.TextureLoader,
  track: <T extends { dispose: () => void }>(x: T) => T,
): { group: THREE.Group; windows: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();

  const wallMat = track(new THREE.MeshStandardMaterial({ color: def.base, roughness: 0.85, metalness: 0.1, flatShading: true }));
  const bodyGeo = track(new THREE.BoxGeometry(2.4, 2.2, 2.4));
  const body = new THREE.Mesh(bodyGeo, wallMat);
  body.position.y = 1.1;
  g.add(body);

  // Themed roof pyramid.
  const roofMat = track(new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 0.25, roughness: 0.6, flatShading: true }));
  const roofGeo = track(new THREE.ConeGeometry(1.95, 1.4, 4));
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 2.9;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  // Glowing windows band (front + sides), shared material so hover can pulse it.
  const winMat = track(new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 0.8 }));
  const winGeo = track(new THREE.BoxGeometry(1.6, 0.5, 0.06));
  for (const [rx, rz, ry] of [
    [0, 1.21, 0],
    [1.21, 0, Math.PI / 2],
    [-1.21, 0, Math.PI / 2],
  ] as const) {
    const w = new THREE.Mesh(winGeo, winMat);
    w.position.set(rx, 1.25, rz);
    w.rotation.y = ry;
    g.add(w);
  }

  // Doorway.
  const doorMat = track(new THREE.MeshStandardMaterial({ color: 0x0a0710, roughness: 1 }));
  const doorGeo = track(new THREE.BoxGeometry(0.9, 1.2, 0.08));
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.6, 1.21);
  g.add(door);

  // Floating icon sign (billboard) above the roof.
  const iconTex = texLoader.load(def.icon);
  iconTex.colorSpace = THREE.SRGBColorSpace;
  track(iconTex);
  const iconMat = track(new THREE.SpriteMaterial({ map: iconTex, transparent: true, depthWrite: false }));
  const iconSprite = new THREE.Sprite(iconMat);
  iconSprite.position.set(0, 4.5, 0);
  iconSprite.scale.set(1.7, 1.7, 1);
  g.add(iconSprite);

  // Name plate (canvas texture billboard) under the icon.
  const label = makeLabelSprite(def.name, track);
  label.position.set(0, 3.55, 0);
  g.add(label);

  return { group: g, windows: winMat };
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

function makeLabelSprite(text: string, track: <T extends { dispose: () => void }>(x: T) => T): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#ffe9b0";
  ctx.strokeText(text, 256, 64);
  ctx.fillText(text, 256, 64);
  const tex = track(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
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
// Dweller crowd — animated frogs wandering the plaza on lazy circular paths.
// ---------------------------------------------------------------------------

interface Dweller {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  radius: number;
  speed: number;
  phase: number;
}

class DwellerCrowd {
  private scene: THREE.Scene;
  private dwellers: Dweller[] = [];
  private active: number;
  private ready = false;
  private disposed = false;

  constructor(scene: THREE.Scene, count: number) {
    this.scene = scene;
    this.active = count;
    void this.load(count);
  }

  private async load(count: number) {
    try {
      const { scene: model, animations } = await loadGLB(FROG_MODEL);
      if (this.disposed) {
        disposeObject(model);
        return;
      }
      const idle = animations.find((a) => /idle/i.test(a.name)) ?? animations[0] ?? null;
      for (let i = 0; i < count; i++) {
        const root = cloneSkinned(model);
        root.scale.setScalar(0.55);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.frustumCulled = false;
        });
        const mixer = new THREE.AnimationMixer(root);
        if (idle) mixer.clipAction(idle).play();
        this.scene.add(root);
        this.dwellers.push({
          root,
          mixer,
          radius: 3.4 + (i % 3) * 0.9,
          speed: 0.18 + (i % 4) * 0.05,
          phase: (i / count) * Math.PI * 2,
        });
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

  update(dt: number, t: number) {
    if (!this.ready) return;
    for (const d of this.dwellers) {
      if (!d.root.visible) continue;
      d.mixer.update(dt);
      const a = t * d.speed + d.phase;
      const x = Math.cos(a) * d.radius;
      const z = Math.sin(a) * d.radius;
      d.root.position.set(x, 0, z);
      // Face the direction of travel (tangent to the circle).
      d.root.rotation.y = -a + Math.PI / 2;
    }
  }

  dispose() {
    this.disposed = true;
    for (const d of this.dwellers) {
      d.mixer.stopAllAction();
      this.scene.remove(d.root);
      disposeObject(d.root);
    }
    this.dwellers = [];
  }
}
