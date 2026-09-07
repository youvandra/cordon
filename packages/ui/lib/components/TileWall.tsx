import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

/* ==========================================================================
   TileWall — the backdrop of the stage's second card, made structural.

   That card's figure is a wall: tiles butted together, grout showing through
   the seams, a blurred bloom where the seams cross, and a deep band running
   off the bottom edge. Cordon uses it as a layout. Cards do not float above a
   page with drop shadows and margins; they are set into a wall, and the gap
   between them is grout, which is a thing rather than an absence.
   ========================================================================== */

export interface TileWallProps extends HTMLAttributes<HTMLDivElement> {
  columns?: number;
  /** Seam width in px. The stage runs 8. */
  grout?: number;
  /** Fades the bottom rows into the deep band, as the card does. */
  deep?: boolean;
  glaze?: "rose" | "violet" | "ember";
  children?: ReactNode;
}

export function TileWall({
  columns = 3,
  grout = 8,
  deep = false,
  glaze = "violet",
  className,
  style,
  children,
  ...rest
}: TileWallProps) {
  return (
    <div
      className={cx("cordon-wall", deep && "cordon-wall--deep", className)}
      data-glaze={glaze}
      style={{
        "--cordon-wall-columns": columns,
        "--cordon-wall-grout": `${grout}px`,
        ...style,
      } as React.CSSProperties}
      {...rest}
    >
      <span className="cordon-wall__bloom" aria-hidden="true" />
      {children}
    </div>
  );
}

export interface TileProps extends HTMLAttributes<HTMLDivElement> {
  /** Columns to span. A wall is only interesting when the tiles differ. */
  span?: number;
  /** Rows to span. */
  rows?: number;
  children?: ReactNode;
}

export function Tile({ span = 1, rows = 1, className, style, children, ...rest }: TileProps) {
  return (
    <div
      className={cx("cordon-wall__tile", className)}
      style={{ gridColumn: `span ${span}`, gridRow: `span ${rows}`, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
