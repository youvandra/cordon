import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { useMeasure } from "../../hooks/useMeasure";
import { linearScale, monotonePath, smoothPath } from "../chart/geometry";
import type { Point } from "../chart/geometry";
import { transition } from "../../tokens/motion";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Sparkline.

   Drawn in the connection map's language rather than a charting library's:
   one warm filament, a wash beneath it, and a lit node on the last reading —
   the only one anyone is actually looking for.

   It measures itself and draws in real pixels. The obvious shortcut is a
   fixed viewBox stretched with `preserveAspectRatio="none"`, and it turns
   every dot into an ellipse and every curve into a skewed one.
   ========================================================================== */

export interface SparklineProps {
  values: number[];
  width?: number | string;
  height?: number;
  /**
   * `monotone` (default) never draws a peak the data does not contain.
   * `smooth` is the map's wide Catmull-Rom bends — prettier, but it overshoots
   * at corners, which a short sparkline cannot afford. `linear` is a polyline.
   */
  curve?: "monotone" | "smooth" | "linear";
  /** Fills between the line and the floor. */
  area?: boolean;
  /** Lit node on the final value. */
  head?: boolean;
  /** Hairline at the series' own baseline — useful when values can fall. */
  baseline?: boolean;
  /** Hollow markers on the highest and lowest readings. */
  extremes?: boolean;
  glaze?: "rose" | "violet" | "ember";
  label?: string;
  className?: string;
}

/** Room for the head node and the stroke, so nothing clips at the edges. */
const inset = (height: number) => Math.max(3, Math.min(6, height * 0.14));

export function Sparkline({
  values,
  width = "100%",
  height = 44,
  curve = "monotone",
  area = true,
  head = true,
  baseline = false,
  extremes = false,
  glaze,
  label,
  className,
}: SparklineProps) {
  const uid = useId().replace(/[:»«]/g, "");
  const { reducedMotion, glaze: houseGlaze } = useCordon();
  const [ref, size] = useMeasure<HTMLDivElement>({ width: 160, height });

  const geometry = useMemo(() => {
    if (!size.width || values.length === 0) return null;

    const pad = inset(height);
    const min = Math.min(...values);
    const max = Math.max(...values);

    const x = linearScale([0, Math.max(1, values.length - 1)], [pad, size.width - pad]);
    const y = linearScale([min, max], [height - pad, pad]);

    const points: Point[] = values.map((value, index) => ({ x: x(index), y: y(value) }));
    const line =
      curve === "monotone"
        ? monotonePath(points)
        : smoothPath(points, curve === "smooth" ? 1 : 0);

    return {
      points,
      line,
      /* The wash closes on the real floor, inside the box — not below it. */
      fill: `${line}L${points[points.length - 1].x.toFixed(2)} ${height}L${points[0].x.toFixed(2)} ${height}Z`,
      last: points[points.length - 1],
      highest: points[values.indexOf(max)],
      lowest: points[values.indexOf(min)],
      baselineY: y(values[0]),
      pad,
      flat: max === min,
    };
  }, [values, size.width, height, curve]);

  const firing = glaze ?? houseGlaze;

  return (
    <div
      ref={ref}
      className={cx("cordon-sparkline", className)}
      style={{ width, height }}
      data-glaze={firing}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {geometry ? (
        <svg width={size.width} height={height} aria-hidden="true">
          <defs>
            <linearGradient id={`cordonSpark-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity=".24" />
              <stop offset=".72" stopColor="currentColor" stopOpacity=".04" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {area ? <path d={geometry.fill} fill={`url(#cordonSpark-${uid})`} /> : null}

          {baseline ? (
            <line
              x1={geometry.pad}
              x2={size.width - geometry.pad}
              y1={geometry.baselineY}
              y2={geometry.baselineY}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity=".28"
            />
          ) : null}

          <motion.path
            d={geometry.line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : transition.resolve}
          />

          {extremes && !geometry.flat ? (
            <>
              <circle cx={geometry.highest.x} cy={geometry.highest.y} r="2.6" fill="var(--cordon-paper)" stroke="currentColor" strokeWidth="1.2" />
              <circle cx={geometry.lowest.x} cy={geometry.lowest.y} r="2.6" fill="var(--cordon-paper)" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
            </>
          ) : null}

          {head ? (
            <>
              <circle cx={geometry.last.x} cy={geometry.last.y} r="5" fill="currentColor" opacity=".16" />
              <circle cx={geometry.last.x} cy={geometry.last.y} r="2.4" fill="currentColor" />
            </>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}
