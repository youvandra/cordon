import type { CSSProperties } from "react";
import { cx } from "../cx";

export interface GrainProps {
  /** 0–1. The stage runs .46 on a plain tile, .54–.68 on a glazed one. */
  opacity?: number;
  className?: string;
}

/**
 * Fired-clay grain. Cordon surfaces are never flat colour; this soft-light
 * noise layer is what keeps a large glaze from banding on a wide display.
 * Relies on the `#cordonGrain` filter mounted once by `CordonProvider`.
 */
export function Grain({ opacity = 0.46, className }: GrainProps) {
  return (
    <svg
      className={cx("cordon-grain", className)}
      style={{ "--cordon-grain-opacity": opacity } as CSSProperties}
      viewBox="0 0 429 554"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="429" height="554" filter="url(#cordonGrain)" />
    </svg>
  );
}
