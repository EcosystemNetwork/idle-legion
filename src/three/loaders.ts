// Shared GLB loading for every Three.js surface in the game (kingdom, boss,
// dwellers). One Draco decoder, one in-flight fetch per URL, one parsed-scene
// cache — so mounting the boss and the kingdom at once never double-downloads
// or double-decodes the same asset.
//
// Extracted from the original BossStage so the whole game renders on one engine.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;

// --- One shared ArrayBuffer fetch per URL. ----------------------------------
const bufferCache = new Map<string, Promise<ArrayBuffer>>();

export function fetchGLB(url: string): Promise<ArrayBuffer> {
  let p = bufferCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`GLB ${url} → ${r.status}`);
      return r.arrayBuffer();
    });
    // Drop failed fetches so a later mount can retry cleanly.
    p.catch(() => bufferCache.delete(url));
    bufferCache.set(url, p);
  }
  return p;
}

// --- One shared Draco-enabled loader per session. ---------------------------
let _loader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (_loader) return _loader;
  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  _loader = new GLTFLoader().setDRACOLoader(draco);
  return _loader;
}

function parse(buf: ArrayBuffer): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    // Copy the buffer: the Draco worker transfers (detaches) what it parses, so
    // a shared cached buffer must never be handed in directly.
    getLoader().parse(buf.slice(0), "", resolve, reject);
  });
}

// --- One shared PARSED gltf per URL. ----------------------------------------
// The Stronghold mounts one ModelStage per staffed room plus the Master; before
// this cache each of them Draco-decoded the same ~1MB / 10k-tri / 10-clip kek
// independently and uploaded its own copy to the GPU. Now the model is decoded
// once and every actor gets a SkeletonUtils clone that shares the geometry,
// materials and textures (exactly what the kingdom's DwellerCrowd already did).
interface CachedModel {
  gltf: GLTF;
  /**
   * Framing bounds, measured ONCE on the master right after parse.
   *
   * This must not be recomputed per clone. These are skinned meshes whose real
   * extent comes from the skeleton, not from the bind-pose geometry (the raw
   * geometry bounds are ~0.02 units), and a freshly-cloned skeleton doesn't
   * measure the same as the parsed master — cloning and then calling
   * setFromObject yielded a degenerate box and parked the camera inside the
   * model. Measuring the master reproduces the pre-cache framing exactly.
   */
  box: THREE.Box3;
}

const gltfCache = new Map<string, Promise<CachedModel>>();

// --- Shared-resource registry (the reason disposal is safe). -----------------
// Clones share the master's geometry/materials/textures, so freeing them from
// ONE actor's teardown would blank every other live actor using the same model.
//
// Strategy: the cache owns those resources for the lifetime of the page and
// they are never freed. Refcounting was the alternative, but it is fragile here
// (clone-of-clone in DwellerCrowd, materials re-assigned by BossStage, actors
// unmounting mid-load) and the win is small: the game uses a handful of models
// that are mounted and unmounted constantly, so a released cache entry would
// just be re-fetched and re-decoded moments later. Instead we record everything
// the master owns and make disposeObject/disposeMaterial skip it — so existing
// callers stay correct whether they are tearing down a GLB clone (nothing to
// free) or their own procedural geometry (freed as before).
const sharedGeometries = new WeakSet<THREE.BufferGeometry>();
const sharedMaterials = new WeakSet<THREE.Material>();
const sharedTextures = new WeakSet<THREE.Texture>();

function markShared(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) sharedGeometries.add(mesh.geometry);
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      sharedMaterials.add(m);
      // Textures hang off arbitrary map slots (map, normalMap, …); sweep the
      // whole material rather than guessing which slots this model uses.
      for (const v of Object.values(m as unknown as Record<string, unknown>)) {
        if (v && (v as THREE.Texture).isTexture) sharedTextures.add(v as THREE.Texture);
      }
    }
  });
}

/**
 * Fetch + parse a GLB and hand back a fresh clone of its scene graph, safe to
 * transform / add to a scene / drop independently of every other consumer.
 *
 * The clone SHARES geometry, materials and textures with the cached master (and
 * the returned `animations` array is the master's — AnimationClips are immutable
 * data and every mixer may clipAction the same clip). So: never mutate a shared
 * material in place; clone it first (see BossStage's hit-flash material).
 */
export async function loadGLB(url: string): Promise<{
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Framing bounds measured on the master — see CachedModel.box. */
  box: THREE.Box3;
}> {
  let p = gltfCache.get(url);
  if (!p) {
    p = fetchGLB(url)
      .then(parse)
      .then((gltf) => {
        markShared(gltf.scene);
        return { gltf, box: new THREE.Box3().setFromObject(gltf.scene) };
      });
    // Drop failures so a later mount can retry cleanly.
    p.catch(() => gltfCache.delete(url));
    gltfCache.set(url, p);
  }
  const { gltf, box } = await p;
  return {
    scene: cloneSkinned(gltf.scene) as THREE.Group,
    animations: gltf.animations,
    box: box.clone(),
  };
}

/**
 * Dispose every GPU resource under an object (geometries + material maps).
 * Resources owned by the shared GLB cache are skipped — see the registry note
 * above; freeing them here would blank other live clones of the same model.
 */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry && !sharedGeometries.has(mesh.geometry)) mesh.geometry.dispose();
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach(disposeMaterial);
    else if (m) disposeMaterial(m);
  });
}

export function disposeMaterial(m: THREE.Material) {
  if (sharedMaterials.has(m)) return;
  const mat = m as THREE.MeshStandardMaterial;
  // A material cloned off a shared one still points at the SHARED textures, so
  // each map is checked individually rather than trusted to be ours.
  disposeTexture(mat.map);
  disposeTexture(mat.normalMap);
  disposeTexture(mat.roughnessMap);
  disposeTexture(mat.metalnessMap);
  disposeTexture(mat.emissiveMap);
  m.dispose();
}

function disposeTexture(t: THREE.Texture | null | undefined) {
  if (t && !sharedTextures.has(t)) t.dispose();
}
