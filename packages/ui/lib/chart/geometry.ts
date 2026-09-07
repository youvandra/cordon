/* ==========================================================================
   Chart geometry. Pure functions, no React, no DOM — so the maths that decides
   where a point lands can be reasoned about, and tested, on its own.
   ========================================================================== */

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/**
 * Round a raw step up to something a person would choose: 1, 2, 2.5, 5, 10 …
 * An axis labelled 0 / 23.4 / 46.8 is the tell of a chart nobody looked at.
 */
export function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

export interface Ticks {
  values: number[];
  min: number;
  max: number;
}

/** A domain that ends on round numbers, with roughly `count` ticks inside. */
export function niceTicks(min: number, max: number, count = 4, zeroBased = false): Ticks {
  const low = zeroBased ? Math.min(0, min) : min;
  const span = max - low;
  if (span === 0) return { values: [low], min: low, max: low + 1 };
  const step = niceStep(span / count);
  const niceMin = Math.floor(low / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let value = niceMin; value <= niceMax + step * 0.001; value += step) {
    values.push(Number(value.toPrecision(12)));
  }
  return { values, min: niceMin, max: niceMax };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Catmull-Rom through the points, emitted as cubic béziers — the wide, even
 * bends the stage's connection map is drawn with. `tension` 0 is a straight
 * polyline; 1 is the full curve.
 */
export function smoothPath(points: Point[], tension = 1): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;

  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const current = points[i];
    if (tension === 0) {
      d += `L${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
      continue;
    }
    const previous = points[i - 1];
    const before = points[i - 2] ?? previous;
    const after = points[i + 1] ?? current;
    const k = tension / 6;
    const c1x = previous.x + (current.x - before.x) * k;
    const c1y = previous.y + (current.y - before.y) * k;
    const c2x = current.x - (after.x - previous.x) * k;
    const c2y = current.y - (after.y - previous.y) * k;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson).
 *
 * Catmull-Rom is prettier on gentle data and lies on sharp data: at a corner
 * it overshoots, drawing a peak higher than any reading in the series. In a
 * 16px-tall sparkline that invented peak also escapes the box. This never
 * overshoots — between two points the curve stays inside their values — which
 * is the property a chart actually needs.
 */
export function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0].x} ${points[0].y}`;
  if (n === 2) {
    return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}L${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  /* Secant slopes between neighbours. */
  const dx: number[] = [];
  const dy: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    dy[i] = points[i + 1].y - points[i].y;
    slope[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
  }

  /* Tangents, then the Fritsch–Carlson clamp that removes the overshoot. */
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangent[i] = 0; // a local extreme: flatten, never overshoot past it
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  tangent[n - 1] = slope[n - 2];

  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3;
    const c1x = points[i].x + third;
    const c1y = points[i].y + third * tangent[i];
    const c2x = points[i + 1].x - third;
    const c2y = points[i + 1].y - third * tangent[i + 1];
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${points[i + 1].x.toFixed(2)} ${points[i + 1].y.toFixed(2)}`;
  }
  return d;
}

/** Compact axis labels: 1_240_000 -> "1.2M". */
export function formatCompact(value: number, decimals = 1): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

/** Index of the datum nearest a pixel x, for hover snapping. */
export function nearestIndex(points: Point[], x: number): number {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const distance = Math.abs(point.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
