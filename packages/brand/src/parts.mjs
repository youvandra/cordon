/* ==========================================================================
   Cordon brand — the drawing primitives.

   Nothing here is invented. The mark is the `Logo` component's own SVG, the
   wordmark is laid out by the library's real `layoutDots` over the real 5×7
   face, and the tree is the geometry `DelegationTree` draws. An asset that
   redraws the brand by eye is an asset that drifts from it by the second
   release.
   ========================================================================== */

export const INK = "#222222";
export const PAPER = "#ececeb";
export const ACCENT = "#ad314d";
export const COPY_DIM = "#6f6f6f";
export const ON_GLAZE_SOFT = "rgba(255,255,255,.72)";

/** The rose glaze, stop for stop as `Logo` declares it. */
export const GLAZE = (id) => `
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bd4468"/>
      <stop offset="0.55" stop-color="#ad355b"/>
      <stop offset="1" stop-color="#8c1320"/>
    </linearGradient>`;

/**
 * The mark: a glazed tile with four dots, two lit and two held back.
 * Drawn in the Logo's own 24-unit box and scaled by the caller.
 */
export function mark({ x = 0, y = 0, size = 24, id = "glaze", rim = true } = {}) {
  const k = size / 24;
  const at = (v) => (v * k).toFixed(3);
  return `
  <g transform="translate(${x} ${y}) scale(${k})">
    <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="url(#${id})"/>
    ${rim ? '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1"/>' : ""}
    <circle cx="9" cy="9" r="1.7" fill="#fff" opacity=".92"/>
    <circle cx="15" cy="9" r="1.7" fill="#fff" opacity=".62"/>
    <circle cx="9" cy="15" r="1.7" fill="#fff" opacity=".62"/>
    <circle cx="15" cy="15" r="1.7" fill="#fff" opacity=".92"/>
  </g>`.replace(/\n\s+$/, "") + `<!-- ${at(0)} -->`.slice(0, 0);
}

/** The wordmark, from the library's own layout of the library's own face. */
export function wordmark(layout, { x = 0, y = 0, unit = 1, r = 1.8, fill = ACCENT } = {}) {
  const dots = layout.dots
    .map((d) => `<circle cx="${(d.cx * unit).toFixed(2)}" cy="${(d.cy * unit).toFixed(2)}" r="${(r * unit).toFixed(2)}"/>`)
    .join("");
  return `<g transform="translate(${x} ${y})" fill="${fill}">${dots}</g>`;
}

/**
 * The delegation tree, in the grammar the site draws it in: leave vertically,
 * bend once, arrive vertically. One root, two workers, four leaves — the depth
 * the mandate allows.
 */
export function tree({ x = 0, y = 0, w = 460, h = 300, ink = ACCENT, dim = 0.3 } = {}) {
  const levels = [
    [{ id: "root", slot: 0.5, r: 21 }],
    [
      { id: "a", slot: 0.25, r: 15 },
      { id: "b", slot: 0.75, r: 15 },
    ],
    [
      { id: "a1", slot: 0.125, r: 11 },
      { id: "a2", slot: 0.375, r: 11 },
      { id: "b1", slot: 0.625, r: 11 },
      { id: "b2", slot: 0.875, r: 11 },
    ],
  ];
  const pad = 26;
  const at = (slot, depth) => ({
    px: pad + slot * (w - pad * 2),
    py: 30 + (depth / 2) * (h - 60),
  });

  const edges = [];
  const link = (from, to) => {
    const mid = (from.py + to.py) / 2;
    edges.push(
      `<path d="M${from.px} ${from.py}C${from.px} ${mid} ${to.px} ${mid} ${to.px} ${to.py}" fill="none" stroke="${ink}" stroke-opacity="${dim}" stroke-width="1.8"/>`,
    );
  };
  const root = at(levels[0][0].slot, 0);
  const mids = levels[1].map((n) => at(n.slot, 1));
  const leaves = levels[2].map((n) => at(n.slot, 2));
  mids.forEach((m) => link(root, m));
  leaves.forEach((l, i) => link(mids[i < 2 ? 0 : 1], l));

  /* The base ring is nearly absent and the drawn arc is not, because the
     figure only says anything if you can see how much of each window is
     gone. A node at its bound burns hotter — that is the one the tree exists
     to point at. */
  const ring = (p, r, used) => {
    const R = r + 6;
    const c = 2 * Math.PI * R;
    const breached = used >= 1;
    return (
      `<circle cx="${p.px}" cy="${p.py}" r="${R}" fill="none" stroke="${ink}" stroke-opacity=".1" stroke-width="2.4"/>` +
      `<circle cx="${p.px}" cy="${p.py}" r="${R}" fill="none" stroke="${breached ? "#d8542f" : ink}" stroke-width="${breached ? 3 : 2.4}" stroke-linecap="round" stroke-dasharray="${(c * Math.min(1, used)).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${p.px} ${p.py})"/>`
    );
  };

  const node = (p, r, kind) => {
    if (kind === "root") return `<circle cx="${p.px}" cy="${p.py}" r="${r}" fill="${ink}"/>`;
    if (kind === "mid")
      return `<circle cx="${p.px}" cy="${p.py}" r="${r}" fill="${ink}" fill-opacity=".18" stroke="${ink}" stroke-opacity=".34"/>`;
    return `<circle cx="${p.px}" cy="${p.py}" r="${r}" fill="#fff" stroke="${ink}" stroke-opacity=".2"/>`;
  };

  return `<g transform="translate(${x} ${y})">
    ${edges.join("\n    ")}
    ${ring(root, 21, 0.71)}${node(root, 21, "root")}
    ${mids.map((p, i) => ring(p, 15, [0.86, 0.81][i]) + node(p, 15, "mid")).join("")}
    ${leaves.map((p, i) => ring(p, 11, [0.85, 0.87, 0.62, 1][i]) + node(p, 11, "leaf")).join("")}
  </g>`;
}

export const FONT = "Inter, -apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Arial, sans-serif";
