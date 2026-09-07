import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useMeasure } from "../../hooks/useMeasure";
import { formatCompact, linearScale, nearestIndex, niceTicks, smoothPath } from "./geometry";
import type { Point } from "./geometry";
import { transition } from "../../tokens/motion";
import { spring } from "../../tokens/spring";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Charts.

   Three rules the rest of this file follows:

   1. Draw in measured pixels. Never stretch a viewBox.
   2. Axes end on numbers a person would pick — `niceTicks`, not min/max.
   3. Ink for data, hairlines for structure. The grid is 6% opacity because
      the reader is looking for the line, not the graph paper.
   ========================================================================== */

export type ChartGlaze = "rose" | "violet" | "ember";

export interface Series {
  id: string;
  label?: string;
  values: number[];
  glaze?: ChartGlaze;
  /** Draws this series as a dashed reference rather than a reading. */
  reference?: boolean;
}

export interface ChartFrameProps {
  height?: number;
  /** Room for the axis labels. */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  className?: string;
}

const DEFAULT_PADDING = { top: 12, right: 12, bottom: 24, left: 40 };

/* Drawn into until the first real measurement arrives. A chart that waits
   for a width it may never be handed is an empty box, which is worse than a
   chart at the wrong width for one frame. */
const FALLBACK_WIDTH = 640;

const GLAZE_INK: Record<ChartGlaze, string> = {
  rose: "var(--cordon-accent)",
  violet: "#8f5bb5",
  ember: "#d8542f",
};

/* ---- Line chart ---------------------------------------------------------- */

export interface LineChartProps extends ChartFrameProps {
  series: Series[];
  /** One label per index, e.g. weekdays. */
  labels?: string[];
  /** Force the y axis to include zero. */
  zeroBased?: boolean;
  area?: boolean;
  tension?: number;
  /** Formats the y axis and the hover readout. */
  format?: (value: number) => string;
  unit?: string;
  label?: string;
}

export function LineChart({
  series,
  labels,
  zeroBased = false,
  area = true,
  tension = 1,
  height = 220,
  padding,
  format = formatCompact,
  unit,
  label,
  className,
}: LineChartProps) {
  const uid = useId().replace(/[:»«]/g, "");
  const { reducedMotion, glaze: houseGlaze } = useCordon();
  /* A width to draw into before the first real measurement, so a chart is
     never an empty box. See useMeasure. */
  const [ref, size] = useMeasure<HTMLDivElement>({ width: FALLBACK_WIDTH, height });
  const [hover, setHover] = useState<number | null>(null);
  const pad = { ...DEFAULT_PADDING, ...padding };

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.values);
    if (!size.width || !all.length) return null;

    const count = Math.max(...series.map((s) => s.values.length));
    const ticks = niceTicks(Math.min(...all), Math.max(...all), 4, zeroBased);

    const x = linearScale([0, Math.max(1, count - 1)], [pad.left, size.width - pad.right]);
    const y = linearScale([ticks.min, ticks.max], [height - pad.bottom, pad.top]);

    return {
      ticks,
      x,
      y,
      count,
      lines: series.map((s) => {
        const points: Point[] = s.values.map((value, index) => ({ x: x(index), y: y(value) }));
        return {
          series: s,
          points,
          d: smoothPath(points, s.reference ? 0 : tension),
          fill: points.length
            ? `${smoothPath(points, tension)}L${points[points.length - 1].x.toFixed(2)} ${y(ticks.min)}L${points[0].x.toFixed(2)} ${y(ticks.min)}Z`
            : "",
        };
      }),
    };
  }, [series, size.width, height, pad.left, pad.right, pad.top, pad.bottom, zeroBased, tension]);

  const active = hover !== null && model ? hover : null;

  return (
    <div
      ref={ref}
      className={cx("cordon-chart", className)}
      style={{ height }}
      role="img"
      aria-label={label ?? "Line chart"}
    >
      {model ? (
        <svg
          width={size.width}
          height={height}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setHover(nearestIndex(model.lines[0].points, event.clientX - box.left));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {/* `currentColor` resolves against the element the gradient is
              *defined* on, not the one that references it — so a gradient in a
              shared <defs> paints every series the same grey. The ink has to be
              written into the stops. */}
          <defs>
            {model.lines.map((line) => {
              const ink = GLAZE_INK[line.series.glaze ?? houseGlaze];
              return (
                <linearGradient key={line.series.id} id={`cordonLine-${uid}-${line.series.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={ink} stopOpacity=".22" />
                  <stop offset=".78" stopColor={ink} stopOpacity=".03" />
                  <stop offset="1" stopColor={ink} stopOpacity="0" />
                </linearGradient>
              );
            })}
          </defs>

          {/* structure */}
          <g className="cordon-chart__grid">
            {model.ticks.values.map((value) => (
              <g key={value}>
                <line x1={pad.left} x2={size.width - pad.right} y1={model.y(value)} y2={model.y(value)} />
                <text x={pad.left - 8} y={model.y(value)} dy="0.32em" textAnchor="end" className="cordon-chart__axis">
                  {format(value)}
                </text>
              </g>
            ))}
          </g>

          {labels ? (
            <g>
              {labels.map((text, index) =>
                index % Math.ceil(labels.length / 7) === 0 ? (
                  <text
                    key={index}
                    x={model.x(index)}
                    y={height - 6}
                    textAnchor="middle"
                    className="cordon-chart__axis"
                  >
                    {text}
                  </text>
                ) : null,
              )}
            </g>
          ) : null}

          {/* crosshair sits under the data, so the line stays on top */}
          {active !== null ? (
            <line
              className="cordon-chart__crosshair"
              x1={model.x(active)}
              x2={model.x(active)}
              y1={pad.top}
              y2={height - pad.bottom}
            />
          ) : null}

          {/* data */}
          {model.lines.map((line) => {
            const ink = GLAZE_INK[line.series.glaze ?? houseGlaze];
            return (
              <g key={line.series.id} style={{ color: ink }}>
                {area && !line.series.reference ? (
                  <path d={line.fill} fill={`url(#cordonLine-${uid}-${line.series.id})`} />
                ) : null}
                <motion.path
                  d={line.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={line.series.reference ? 1.2 : 2}
                  strokeDasharray={line.series.reference ? "4 4" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={line.series.reference ? 0.5 : 1}
                  initial={reducedMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={reducedMotion ? { duration: 0 } : transition.resolve}
                />
                {active !== null && line.points[active] && !line.series.reference ? (
                  <motion.circle
                    layoutId={`cordon-chart-dot-${uid}-${line.series.id}`}
                    cx={line.points[active].x}
                    cy={line.points[active].y}
                    r="4"
                    fill="var(--cordon-paper)"
                    stroke="currentColor"
                    strokeWidth="2"
                    transition={spring.snap}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}

      {active !== null && model ? (
        <div
          className="cordon-chart__readout"
          style={{
            left: Math.min(Math.max(model.x(active), 64), size.width - 64),
          }}
        >
          {labels?.[active] ? <span className="cordon-chart__readout-label">{labels[active]}</span> : null}
          {/* A reference line is a threshold, not a reading — it belongs on the
              chart but not in the list of values at this point in time. */}
          {series
            .filter((s) => !s.reference)
            .map((s) => (
              <span key={s.id} className="cordon-chart__readout-row">
                <span className="cordon-chart__swatch" style={{ background: GLAZE_INK[s.glaze ?? houseGlaze] }} />
                {s.label ? <span className="cordon-chart__readout-name">{s.label}</span> : null}
                <span className="cordon-chart__readout-value">{format(s.values[active] ?? 0)}</span>
                {unit ? <em>{unit}</em> : null}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---- Bar chart ----------------------------------------------------------- */

export interface BarChartProps extends ChartFrameProps {
  data: { label: string; value: number; glaze?: ChartGlaze }[];
  format?: (value: number) => string;
  /** Lays the bars out left to right instead of bottom to top. */
  horizontal?: boolean;
  /** Prints each value at the end of its bar. */
  showValues?: boolean;
  label?: string;
}

export function BarChart({
  data,
  height = 220,
  padding,
  format = formatCompact,
  horizontal = false,
  showValues = true,
  label,
  className,
}: BarChartProps) {
  const { reducedMotion, glaze: houseGlaze } = useCordon();
  const [ref, size] = useMeasure<HTMLDivElement>({ width: FALLBACK_WIDTH, height });
  const [hover, setHover] = useState<number | null>(null);
  /* Horizontal bars print their value past the bar end, so the right gutter
     has to hold that label — otherwise the longest bar, which is the one worth
     reading, is the one that gets clipped. */
  const pad = {
    ...DEFAULT_PADDING,
    ...(horizontal ? { left: 78, bottom: 20, right: showValues ? 54 : 12 } : {}),
    ...padding,
  };

  const model = useMemo(() => {
    if (!size.width || !data.length) return null;
    const ticks = niceTicks(0, Math.max(...data.map((d) => d.value)), 4, true);

    if (horizontal) {
      const x = linearScale([ticks.min, ticks.max], [pad.left, size.width - pad.right]);
      const band = (height - pad.top - pad.bottom) / data.length;
      const thickness = Math.min(22, band * 0.62);
      return { ticks, x, band, thickness, y: null };
    }
    const y = linearScale([ticks.min, ticks.max], [height - pad.bottom, pad.top]);
    const band = (size.width - pad.left - pad.right) / data.length;
    const thickness = Math.min(38, band * 0.58);
    return { ticks, y, band, thickness, x: null };
  }, [data, size.width, height, pad.left, pad.right, pad.top, pad.bottom, horizontal]);

  return (
    <div ref={ref} className={cx("cordon-chart", className)} style={{ height }} role="img" aria-label={label ?? "Bar chart"}>
      {model ? (
        <svg width={size.width} height={height}>
          <g className="cordon-chart__grid">
            {model.ticks.values.map((value) =>
              horizontal ? (
                <line key={value} x1={model.x!(value)} x2={model.x!(value)} y1={pad.top} y2={height - pad.bottom} />
              ) : (
                <g key={value}>
                  <line x1={pad.left} x2={size.width - pad.right} y1={model.y!(value)} y2={model.y!(value)} />
                  <text x={pad.left - 8} y={model.y!(value)} dy="0.32em" textAnchor="end" className="cordon-chart__axis">
                    {format(value)}
                  </text>
                </g>
              ),
            )}
          </g>

          {data.map((datum, index) => {
            const ink = GLAZE_INK[datum.glaze ?? houseGlaze];
            const lit = hover === null || hover === index;

            if (horizontal) {
              const y = pad.top + model.band * index + (model.band - model.thickness) / 2;
              const length = Math.max(2, model.x!(datum.value) - pad.left);
              return (
                <g key={`${datum.label}-${index}`} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
                  <text x={pad.left - 10} y={y + model.thickness / 2} dy="0.32em" textAnchor="end" className="cordon-chart__axis">
                    {datum.label}
                  </text>
                  <motion.rect
                    x={pad.left}
                    y={y}
                    height={model.thickness}
                    rx={Math.min(6, model.thickness / 2.6)}
                    fill={ink}
                    opacity={lit ? 0.92 : 0.34}
                    initial={reducedMotion ? false : { width: 0 }}
                    animate={{ width: length }}
                    transition={reducedMotion ? { duration: 0 } : { ...spring.settle, delay: index * 0.04 }}
                  />
                  {showValues ? (
                    <text x={pad.left + length + 7} y={y + model.thickness / 2} dy="0.32em" className="cordon-chart__value">
                      {format(datum.value)}
                    </text>
                  ) : null}
                </g>
              );
            }

            const x = pad.left + model.band * index + (model.band - model.thickness) / 2;
            const top = model.y!(datum.value);
            const barHeight = Math.max(2, height - pad.bottom - top);
            return (
              <g key={`${datum.label}-${index}`} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
                <motion.rect
                  x={x}
                  width={model.thickness}
                  rx={Math.min(6, model.thickness / 3.4)}
                  fill={ink}
                  opacity={lit ? 0.92 : 0.34}
                  initial={reducedMotion ? false : { y: height - pad.bottom, height: 0 }}
                  animate={{ y: top, height: barHeight }}
                  transition={reducedMotion ? { duration: 0 } : { ...spring.settle, delay: index * 0.04 }}
                />
                {showValues ? (
                  <text x={x + model.thickness / 2} y={top - 7} textAnchor="middle" className="cordon-chart__value">
                    {format(datum.value)}
                  </text>
                ) : null}
                <text x={x + model.thickness / 2} y={height - 6} textAnchor="middle" className="cordon-chart__axis">
                  {datum.label}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

/* ---- Donut --------------------------------------------------------------- */

export interface DonutChartProps {
  data: { label: string; value: number; glaze?: ChartGlaze }[];
  size?: number;
  /**
   * Ring thickness as a fraction of the radius. Kept modest by default: the
   * hole has to stay wide enough for the readout that goes in it, and a ring
   * thick enough to swallow its own centre is a pie chart with extra steps.
   */
  thickness?: number;
  /** Sits in the hole — usually a total. */
  children?: ReactNode;
  label?: string;
  className?: string;
}

export function DonutChart({ data, size = 180, thickness = 0.2, children, label, className }: DonutChartProps) {
  const { reducedMotion, glaze: houseGlaze } = useCordon();
  const total = data.reduce((sum, datum) => sum + datum.value, 0) || 1;
  const radius = size / 2;
  const stroke = radius * thickness * 2;
  const trackRadius = radius - stroke / 2 - 1;
  const circumference = 2 * Math.PI * trackRadius;

  let offset = 0;

  return (
    <div className={cx("cordon-donut", className)} style={{ width: size, height: size }} role="img" aria-label={label ?? "Donut chart"}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={radius}
          cy={radius}
          r={trackRadius}
          fill="none"
          stroke="rgba(140,19,32,.09)"
          strokeWidth={stroke}
        />
        {data.map((datum, index) => {
          const fraction = datum.value / total;
          const dash = circumference * fraction;
          const element = (
            <motion.circle
              key={`${datum.label}-${index}`}
              cx={radius}
              cy={radius}
              r={trackRadius}
              fill="none"
              stroke={GLAZE_INK[datum.glaze ?? houseGlaze]}
              strokeWidth={stroke}
              strokeLinecap="butt"
              /* 1.5px of paper between segments, so neighbours never merge. */
              strokeDasharray={`${Math.max(0, dash - 1.5)} ${circumference - dash + 1.5}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${radius} ${radius})`}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...transition.settle, delay: index * 0.06 }}
            />
          );
          offset += dash;
          return element;
        })}
      </svg>
      {children ? (
        <div
          className="cordon-donut__centre"
          /* The readout is confined to the hole, so it can never sit on the ring. */
          style={{ padding: stroke + 4 }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
