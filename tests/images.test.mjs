// No picture is built bigger than a page shows it. Run after "npm run build" (npm run check
// builds first).
//
// Astro's <Image widths={[…]}> writes a srcset, and its plain src (the fallback) is the
// original picture unless the tag also sets width. The feed's product pictures are 3000 px
// wide, so a missing width built a full-size copy of each into the site. Every <Image> that
// sets widths must also set width (the largest of its widths), and no built raster is wider
// than MAX_WIDTH except the sprite sheets listed below, which are animation frames on one strip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { dist, filesUnder, root } from "../ops/public-files.mjs";

const MAX_WIDTH = 1440;
const SPRITE_SHEETS = [/^penny-highfive\./];

test("every <Image> that sets widths also sets width", () => {
  const sources = filesUnder(path.join(root, "src")).filter((f) => f.endsWith(".astro"));
  const missing = [];
  for (const file of sources) {
    const text = readFileSync(path.join(root, "src", file), "utf8");
    for (const m of text.matchAll(/<Image\b(?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^}]*\})*>/g)) {
      if (/\bwidths=/.test(m[0]) && !/\swidth=/.test(m[0])) missing.push(`src/${file}: ${m[0].replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  assert.deepEqual(missing, [], "add width={the largest of widths}, or Astro builds the original size as the fallback");
});

test(`no built picture is wider than ${MAX_WIDTH} px`, async () => {
  const rasters = filesUnder(dist).filter((f) => /\.(webp|avif|png|jpe?g)$/i.test(f));
  assert.ok(rasters.length > 0, "no pictures in dist/: run npm run build first");
  const wide = [];
  for (const file of rasters) {
    if (SPRITE_SHEETS.some((re) => re.test(path.basename(file)))) continue;
    const { width } = await sharp(path.join(dist, file)).metadata();
    if (width > MAX_WIDTH) wide.push(`${file}: ${width} px`);
  }
  assert.deepEqual(wide, []);
});
