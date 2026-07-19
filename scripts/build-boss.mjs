// Consolidate the 15 per-clip Meshy "Kekius Maximus" boss GLBs into a single
// optimized, animation-rich GLB for runtime use in the Arena.
//
// Each source `*_withSkin.glb` contains an identical 26-bone skeleton + skinned
// mesh + ONE animation. We take one file as the canonical mesh/skeleton and
// retarget every other clip onto it by bone NAME, then prune the duplicates and
// compress hard (Draco geometry, resized WebP texture, quantized animations).
//
// Output: public/art/kekius-boss.glb  (single mesh + all clips, ~1-1.5MB)
//
//   node scripts/build-boss.mjs
//
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, prune, resample, weld, draco, unpartition, mergeDocuments,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Raw per-clip Meshy exports live OUTSIDE public/ so Vite never ships them.
const SRC_DIR = resolve(ROOT, 'art-src/kekius-clips');
const OUT = resolve(ROOT, 'public/art/kekius-boss.glb');

// Clean, runtime-friendly clip names. Raw Meshy name -> our name.
// Anything not listed keeps its raw clip name (still usable).
const CLIP_NAMES = {
  Alert: 'Idle',
  Attack: 'Attack',
  Triple_Combo_Attack: 'ComboAttack',
  Dead: 'Dead',
  Arise: 'Arise',
  Agree_Gesture: 'Taunt',
  Casual_Walk: 'Walk',
  Running: 'Run',
  All_Night_Dance: 'Dance',
  '360_Power_Spin_Jump': 'Spin',
};
// Redundant / lower-value clips we drop to keep the asset lean.
const DROP = new Set(['Run_03', 'Boxing_Practice', 'Indoor_Swing', 'Walking']);
// This clip's file supplies the canonical mesh + skeleton + texture.
const BASE_CLIP = 'Alert';

const rawClip = (f) => f.replace(/^.*Animation_/, '').replace(/_withSkin\.glb$/, '');

const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const files = readdirSync(SRC_DIR)
  .filter((f) => f.includes('withSkin'))
  .filter((f) => !DROP.has(rawClip(f)));

const baseFile = files.find((f) => rawClip(f) === BASE_CLIP);
if (!baseFile) throw new Error(`base clip ${BASE_CLIP} not found`);

console.log(`Base: ${rawClip(baseFile)}`);
const doc = await io.read(`${SRC_DIR}/${baseFile}`);
doc.setLogger(new (await import('@gltf-transform/core')).Logger(3));

// Keep a handle on the canonical scene; index base bones by name for retargeting.
const rootScene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
const baseNodesByName = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));

// Snapshot the canonical mesh/skin/node set so we can dispose the duplicates
// that mergeDocuments() drags in from every other source file.
const baseMeshes = new Set(doc.getRoot().listMeshes());
const baseSkins = new Set(doc.getRoot().listSkins());
const baseNodes = new Set(doc.getRoot().listNodes());

// Rename the base file's own clip.
const baseAnim = doc.getRoot().listAnimations()[0];
baseAnim.setName(CLIP_NAMES[BASE_CLIP] || BASE_CLIP);

let merged = 0;
for (const f of files) {
  if (f === baseFile) continue;
  const clip = rawClip(f);
  const src = await io.read(`${SRC_DIR}/${f}`);
  const srcAnim = src.getRoot().listAnimations()[0];
  if (!srcAnim) { console.warn(`  ! ${clip}: no animation, skipped`); continue; }

  // Copy the whole source doc into `doc`; map tells us the copied properties.
  const map = mergeDocuments(doc, src);
  const copiedAnim = map.get(srcAnim);
  copiedAnim.setName(CLIP_NAMES[clip] || clip);

  // Retarget every channel from the copied bone to the base bone of same name.
  let missing = 0;
  for (const ch of copiedAnim.listChannels()) {
    const dupTarget = ch.getTargetNode();
    if (!dupTarget) continue;
    const baseNode = baseNodesByName.get(dupTarget.getName());
    if (!baseNode) { missing++; continue; }
    ch.setTargetNode(baseNode);
  }
  if (missing) console.warn(`  ! ${clip}: ${missing} channels had no matching bone`);
  merged++;
  console.log(`  + ${(CLIP_NAMES[clip] || clip).padEnd(14)} (from ${clip})`);
}

// Drop every scene except the canonical one (merge added duplicate scenes).
for (const scene of doc.getRoot().listScenes()) {
  if (scene !== rootScene) scene.dispose();
}
doc.getRoot().setDefaultScene(rootScene);

// Dispose the duplicated skinned meshes, skins and bone hierarchies pulled in by
// mergeDocuments — animations now target the canonical skeleton, so these are dead.
for (const skin of doc.getRoot().listSkins()) if (!baseSkins.has(skin)) skin.dispose();
for (const mesh of doc.getRoot().listMeshes()) if (!baseMeshes.has(mesh)) mesh.dispose();
for (const node of doc.getRoot().listNodes()) if (!baseNodes.has(node)) node.dispose();

console.log(`\nMerged ${merged} extra clips; total ${doc.getRoot().listAnimations().length} animations.`);

// --- Resize + recompress the single baseColor texture to 1024 WebP. ---------
for (const tex of doc.getRoot().listTextures()) {
  const img = tex.getImage();
  if (!img) continue;
  const webp = await sharp(Buffer.from(img))
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  tex.setImage(new Uint8Array(webp)).setMimeType('image/webp');
}

// --- Clean up orphaned duplicates + compress. -------------------------------
await doc.transform(
  dedup(),                            // merge identical meshes/materials/textures/accessors first
  prune({ keepLeaves: false }),       // then drop the now-orphaned duplicate bones/meshes/textures
  resample(),                         // remove redundant animation keyframes
  weld(),
  draco(),                            // compress geometry
  unpartition(),                      // collapse per-source buffers into one (GLB needs ≤1)
);

await io.write(OUT, doc);
console.log(`\nWrote ${OUT}`);
