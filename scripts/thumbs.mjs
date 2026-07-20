#!/usr/bin/env node
/**
 * Generate 256px WebP thumbnails for the codex art set.
 *
 * The `public/grok-*.jpg` catalog (see src/game/assets.ts) is 1408x1408 at
 * ~435 KB each — but the codex grid renders them at ~120 CSS px. This script
 * emits `public/art/thumb/<name>.webp` at 256px (2x for retina), which is
 * ~20-30x smaller. Full-size originals stay in place for the detail modal.
 *
 * Usage:  npm run thumbs        (add --force to rebuild up-to-date thumbs)
 */
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "public", "art", "thumb");

const SIZE = 256;
const QUALITY = 78;
const FORCE = process.argv.includes("--force");

/** Files to thumbnail: the loose grok-* codex art at the public/ root. */
const MATCH = /^grok-.*\.(jpe?g|png)$/i;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(SRC_DIR)).filter((f) => MATCH.test(f)).sort();
  if (files.length === 0) {
    console.log("thumbs: no grok-* source images found in public/ — nothing to do.");
    return;
  }

  let made = 0;
  let skipped = 0;
  let srcBytes = 0;
  let outBytes = 0;

  for (const file of files) {
    const src = path.join(SRC_DIR, file);
    const out = path.join(OUT_DIR, `${file.replace(/\.[^.]+$/, "")}.webp`);
    const srcStat = await stat(src);
    srcBytes += srcStat.size;

    if (!FORCE && existsSync(out)) {
      const outStat = await stat(out);
      if (outStat.mtimeMs >= srcStat.mtimeMs) {
        outBytes += outStat.size;
        skipped++;
        continue;
      }
    }

    const buf = await sharp(src)
      .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 5 })
      .toBuffer();
    await writeFile(out, buf);
    outBytes += buf.length;
    made++;
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(
    `thumbs: ${made} written, ${skipped} up to date -> public/art/thumb/\n` +
      `        ${mb(srcBytes)} MB originals -> ${mb(outBytes)} MB thumbnails ` +
      `(${(100 - (outBytes / srcBytes) * 100).toFixed(1)}% smaller)`,
  );
}

main().catch((err) => {
  console.error("thumbs: failed —", err);
  process.exit(1);
});
