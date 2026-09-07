import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";
import { useMeasure } from "../../hooks/useMeasure";
import { transition } from "../../tokens/motion";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Loader or loading bar", "Progress Bar".
   The glossary separates them, and so does Cordon: a Loader answers "is it
   working?", a ProgressBar answers "how much is left?", and a StepProgress
   answers "where am I in this?". Using the wrong one is the usual bug.
   ========================================================================== */

export interface ProgressBarProps {
  /** 0–100. Omit for the indeterminate sweep. */
  value?: number;
  label?: ReactNode;
  /** Prints the percentage at the end of the label row. */
  showValue?: boolean;
  size?: "sm" | "md";
  glaze?: "rose" | "violet" | "ember";
  className?: string;
}

export function ProgressBar({
  value,
  label,
  showValue = false,
  size = "md",
  glaze,
  className,
}: ProgressBarProps) {
  const { glaze: houseGlaze } = useCordon();
  const indeterminate = value === undefined;
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div className={cx("cordon-progress", `cordon-progress--${size}`, className)} data-glaze={glaze ?? houseGlaze}>
      {label || showValue ? (
        <div className="cordon-progress__header">
          {label ? <span className="cordon-progress__label">{label}</span> : null}
          {showValue && !indeterminate ? (
            <span className="cordon-progress__value">{Math.round(clamped)}%</span>
          ) : null}
        </div>
      ) : null}
      <div
        className="cordon-progress__track"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === "string" ? label : "Progress"}
      >
        {indeterminate ? (
          <span className="cordon-progress__fill cordon-progress__fill--sweep" />
        ) : (
          <motion.span
            className="cordon-progress__fill"
            initial={false}
            animate={{ width: `${clamped}%` }}
            transition={transition.settle}
          />
        )}
      </div>
    </div>
  );
}

/* ---- Loader -------------------------------------------------------------- */

export interface LoaderProps {
  /**
   * `radar` is the house loader: the stage's swept wedge, turning. `spinner`
   * is the generic fallback for places too small to read a sweep.
   */
  variant?: "radar" | "spinner" | "dots" | "bar";
  size?: "sm" | "md" | "lg";
  /** Announced to screen readers while it spins. */
  label?: string;
  className?: string;
}

export function Loader({ variant = "radar", size = "md", label = "Loading", className }: LoaderProps) {
  const { reducedMotion } = useCordon();

  return (
    <span
      className={cx("cordon-loader", `cordon-loader--${variant}`, `cordon-loader--${size}`, className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {variant === "radar" ? (
        <span className="cordon-loader__radar" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <circle className="cordon-loader__radar-ring" cx="50" cy="50" r="42" />
            {Array.from({ length: 24 }, (_, index) => {
              const angle = (index * 15 * Math.PI) / 180;
              const major = index % 5 === 0;
              const outer = major ? 42 : 42;
              const inner = major ? 34 : 37.5;
              return (
                <line
                  key={index}
                  x1={50 + Math.cos(angle) * outer}
                  y1={50 + Math.sin(angle) * outer}
                  x2={50 + Math.cos(angle) * inner}
                  y2={50 + Math.sin(angle) * inner}
                  className="cordon-loader__radar-tick"
                  strokeWidth={major ? 1.6 : 1}
                />
              );
            })}
            <g className={reducedMotion ? undefined : "cordon-loader__radar-sweep"}>
              <path d="M50 50 L92 50 A42 42 0 0 0 71.5 13.6 Z" fill="currentColor" opacity=".18" />
              <line x1="50" y1="50" x2="92" y2="50" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </g>
          </svg>
        </span>
      ) : variant === "spinner" ? (
        <Icon name="spinner" className="cordon-loader__spinner" />
      ) : variant === "dots" ? (
        <span className="cordon-loader__dots" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="cordon-loader__dot"
              animate={reducedMotion ? undefined : { opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
              transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }}
            />
          ))}
        </span>
      ) : (
        <span className="cordon-loader__bar" aria-hidden="true">
          <span className="cordon-loader__bar-fill" />
        </span>
      )}
    </span>
  );
}

/* ---- Step progress ------------------------------------------------------- */

export interface StepProgressProps {
  steps: { label: ReactNode; description?: ReactNode }[];
  /** Zero-based index of the step in progress. */
  current: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Glossary: "Progress Bar" — position within a multistep process.
 *
 * The rail is the stage's connection map, not a divider line: a warm filament
 * that runs behind the steps, bends into each node on a wide radius, and only
 * burns bright on the stretch already travelled. Nodes are the map's glowing
 * dots — cream when lit, hollow when not.
 */
export function StepProgress({ steps, current, orientation = "horizontal", className }: StepProgressProps) {
  const count = steps.length;
  const [railRef, railSize] = useMeasure<HTMLDivElement>({ width: 640, height: 34 });

  /* Measured pixels, so the bends keep their radius at any width. Stretching a
     fixed viewBox flattens them into creases at one size and balloons them at
     another. */
  const RAIL_Y = 22;
  const NODE_Y = 12;
  const rail = (lit: boolean) => {
    const width = railSize.width;
    const band = width / count;
    const bend = Math.min(26, band * 0.3);
    let d = `M0 ${RAIL_Y}`;
    for (let i = 0; i < count; i++) {
      const centre = band * (i + 0.5);
      d += `L${(centre - bend).toFixed(2)} ${RAIL_Y}`;
      d += `C${(centre - bend * 0.45).toFixed(2)} ${RAIL_Y} ${(centre - bend * 0.45).toFixed(2)} ${NODE_Y} ${centre.toFixed(2)} ${NODE_Y}`;
      d += `C${(centre + bend * 0.45).toFixed(2)} ${NODE_Y} ${(centre + bend * 0.45).toFixed(2)} ${RAIL_Y} ${(centre + bend).toFixed(2)} ${RAIL_Y}`;
    }
    d += `L${width} ${RAIL_Y}`;
    return <path d={d} className={lit ? "cordon-steps__rail-lit" : "cordon-steps__rail-base"} />;
  };

  const travelled = count > 1 ? Math.min(1, Math.max(0, (current + 0.5) / count)) : 1;

  return (
    <div className={cx("cordon-steps", `cordon-steps--${orientation}`, className)}>
      {orientation === "horizontal" ? (
        <div ref={railRef} className="cordon-steps__map">
          {railSize.width ? (
            <svg width={railSize.width} height={34} aria-hidden="true">
              {rail(false)}
              <g style={{ clipPath: `inset(0 ${(railSize.width * (1 - travelled)).toFixed(1)}px 0 0)` }}>
                {rail(true)}
              </g>
            </svg>
          ) : null}
        </div>
      ) : null}

      <ol className="cordon-steps__list">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "todo";
          return (
            <li key={index} className={cx("cordon-steps__item", `cordon-steps__item--${state}`)}>
              <span className="cordon-steps__marker" aria-hidden="true">
                {state === "done" ? <Icon name="check" /> : index + 1}
              </span>
              <span className="cordon-steps__text">
                <span className="cordon-steps__label">{step.label}</span>
                {step.description ? (
                  <span className="cordon-steps__description">{step.description}</span>
                ) : null}
              </span>
              <span className="cordon-visually-hidden">
                {state === "done" ? "Completed" : state === "current" ? "Current step" : "Not started"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
