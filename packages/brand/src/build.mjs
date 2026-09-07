/* ==========================================================================
   Cordon brand — build the assets.

     node src/build.mjs

   Writes SVG sources and PNG exports into `export/`, then copies the
   web-facing ones into the apps that serve them. Every asset is generated, so
   the brand has exactly one definition and the files are a build product
   rather than something that has to be kept in step by hand.
   ========================================================================== */

import { mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ACCENT, COPY_DIM, FONT, GLAZE, INK, PAPER, mark, tree, wordmark } from "./parts.mjs";

const require = createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js");
const { layoutDots } = require("./dotfont.cjs");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "export");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const svg = (w, h, body, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${GLAZE("glaze")}${defs}</defs>
${body}
</svg>
`;

const written = [];

function write(name, source, pngWidths = []) {
  writeFileSync(join(out, `${name}.svg`), source);
  written.push(`${name}.svg`);
  for (const width of pngWidths) {
    const png = new Resvg(source, {
      fitTo: { mode: "width", value: width },
      font: { loadSystemFonts: true },
    })
      .render()
      .asPng();
    const file = pngWidths.length === 1 ? `${name}.png` : `${name}-${width}.png`;
    writeFileSync(join(out, file), png);
    written.push(file);
  }
}

/* ---- the mark, alone ----------------------------------------------------- */

write("mark", svg(24, 24, mark({ size: 24 })), [512, 256, 192, 64, 32, 16]);

/* An opaque ground, because iOS composites the icon onto white and Android
   masks it to a circle: a transparent mark loses its edge on both. */
write(
  "apple-touch-icon",
  svg(180, 180, `<rect width="180" height="180" rx="40" fill="${PAPER}"/>${mark({ x: 26, y: 26, size: 128 })}`),
  [180],
);

/* Maskable: the mark sits inside the inner 80% that Android promises to keep. */
write(
  "icon-maskable",
  svg(512, 512, `<rect width="512" height="512" fill="${PAPER}"/>${mark({ x: 141, y: 141, size: 230 })}`),
  [512],
);

/* ---- wordmark and lockups ------------------------------------------------ */

const word = layoutDots("CORDON");
const UNIT = 6;
const wordW = word.width * UNIT;
const wordH = word.height * UNIT;

write("wordmark-light", svg(wordW, wordH, wordmark(word, { unit: UNIT, fill: ACCENT })), [960, 480]);
write("wordmark-dark", svg(wordW, wordH, wordmark(word, { unit: UNIT, fill: "#e7c9d2" })), [960, 480]);

function lockup(ground, wordFill, subFill) {
  /* The tile fills 19 of its 24 units, so matching the word's cap height means
     sizing the box past it. At 132 the mark read as a small square beside a
     large word rather than as half of one lockup. */
  const markSize = Math.round((wordH * 24) / 19);
  const gap = 44;
  const w = 120 + markSize + gap + wordW + 120;
  const h = 400;
  const top = (h - wordH) / 2;
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${ground}"/>
  ${mark({ x: 120, y: (h - markSize) / 2, size: markSize })}
  ${wordmark(word, { x: 120 + markSize + gap, y: top, unit: UNIT, fill: wordFill })}
  <text x="${120 + markSize + gap}" y="${top + wordH + 46}" font-family="${FONT}" font-size="26" fill="${subFill}">One budget for a tree of agents</text>`,
  );
}

write("logo-light", lockup(PAPER, ACCENT, COPY_DIM), [1200, 600]);
write("logo-dark", lockup(INK, "#e7c9d2", "rgba(255,255,255,.62)"), [1200, 600]);

/* ---- social ------------------------------------------------------------- */

/**
 * The picture is the argument: a tree whose root ring is nearly closed and one
 * leaf already at its bound. A social card that shows only a logo tells a
 * reader nothing they could not have guessed from the URL.
 */
function social(w, h) {
  const treeW = 520;
  const treeH = 300;
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${PAPER}"/>
  <rect x="0" y="0" width="${w}" height="6" fill="url(#glaze)"/>
  ${mark({ x: 72, y: 64, size: 56 })}
  ${wordmark(word, { x: 144, y: 78, unit: 1.85, fill: ACCENT })}
  <text x="72" y="${h / 2 - 26}" font-family="${FONT}" font-size="60" font-weight="500" fill="${INK}">One budget for a</text>
  <text x="72" y="${h / 2 + 46}" font-family="${FONT}" font-size="60" font-weight="500" fill="${INK}">tree of agents.</text>
  <text x="72" y="${h / 2 + 104}" font-family="${FONT}" font-size="23" fill="${COPY_DIM}">Every draw debits every ancestor. The root refuses.</text>
  <text x="72" y="${h - 56}" font-family="${FONT}" font-size="18" fill="${COPY_DIM}">Enforced on Arc · ERC-8004 conduct record</text>
  ${tree({ x: w - treeW - 64, y: (h - treeH) / 2 + 10, w: treeW, h: treeH })}`,
  );
}

write("og-image", social(1200, 630), [1200]);
write("banner", social(1280, 640), [1280]);

/* ---- serve them --------------------------------------------------------- */

const publicDir = join(here, "..", "..", "console", "public");
mkdirSync(publicDir, { recursive: true });
for (const [from, to] of [
  ["mark.svg", "favicon.svg"],
  ["mark-32.png", "favicon-32.png"],
  ["mark-16.png", "favicon-16.png"],
  ["apple-touch-icon.png", "apple-touch-icon.png"],
  ["mark-192.png", "icon-192.png"],
  ["mark-512.png", "icon-512.png"],
  ["icon-maskable.png", "icon-maskable-512.png"],
  ["og-image.png", "og-image.png"],
]) {
  copyFileSync(join(out, from), join(publicDir, to));
}

console.log(`${written.length} files in export/`);
console.log(written.join("\n"));
