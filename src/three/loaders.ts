// Shared GLB loading for every Three.js surface in the game (kingdom, boss,
// dwellers). One Draco decoder, one in-flight fetch per URL, one parsed-scene
// cache — so mounting the boss and the kingdom at once never double-downloads
// or double-decodes the same asset.
//
// Extracted from the original BossStage so the whole game renders on one engine.
import * as THREE from "three";
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

/**
 * Fetch + parse a GLB into a fresh, independent scene graph (safe to mutate /
 * add to a scene / dispose without touching any other consumer). Returns the
 * root object and its animation clips.
 */
export async function loadGLB(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const buf = await fetchGLB(url);
  const gltf = await parse(buf);
  return { scene: gltf.scene, animations: gltf.animations };
}

/** Dispose every GPU resource under an object (geometries + material maps). */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach(disposeMaterial);
    else if (m) disposeMaterial(m);
  });
}

export function disposeMaterial(m: THREE.Material) {
  const mat = m as THREE.MeshStandardMaterial;
  mat.map?.dispose();
  mat.normalMap?.dispose();
  mat.roughnessMap?.dispose();
  mat.metalnessMap?.dispose();
  mat.emissiveMap?.dispose();
  m.dispose();
}
