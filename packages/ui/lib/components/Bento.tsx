import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { Surface } from "../primitives/Surface";
import type { Glaze } from "../primitives/Surface";
import { spring } from "../../tokens/spring";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Bento.

   A row of equal cards is the layout equivalent of a shrug. A bento says
   which of these things matters, by giving it more room. Cells declare their
   own span, the grid is dense so gaps backfill, and every cell is a Surface —
   so importance is expressed in area, not in a heavier font weight.
   ========================================================================== */

export interface BentoProps extends HTMLAttributes<HTMLDivElement> {
  columns?: number;
  /** Row height. Cells grow by whole rows from here. */
  rowHeight?: number | string;
  gap?: "sm" | "md" | "lg";
  children?: ReactNode;
}

export function Bento({ columns = 4, rowHeight = 160, gap = "md", className, style, children, ...rest }: BentoProps) {
  return (
    <div
      className={cx("cordon-bento", `cordon-bento--gap-${gap}`, className)}
      style={{
        "--cordon-bento-columns": columns,
        "--cordon-bento-row": typeof rowHeight === "number" ? `${rowHeight}px` : rowHeight,
        ...style,
      } as CSSProperties}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface BentoCellProps extends Omit<HTMLAttributes<HTMLDivElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  span?: number;
  rows?: number;
  glaze?: Glaze;
  /** Lifts and brightens under the cursor. */
  interactive?: boolean;
  /** Landing order for the stagger. */
  index?: number;
  children?: ReactNode;
}

export function BentoCell({
  span = 1,
  rows = 1,
  glaze = "bisque",
  interactive = false,
  index = 0,
  className,
  style,
  children,
  ...rest
}: BentoCellProps) {
  const { reducedMotion } = useCordon();

  return (
    <motion.div
      className={cx("cordon-bento__cell", className)}
      style={{ gridColumn: `span ${span}`, gridRow: `span ${rows}`, ...style }}
      initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ ...spring.settle, delay: index * 0.05 }}
      {...rest}
    >
      <Surface
        glaze={glaze}
        radius="6"
        elevation="tile"
        glow={interactive}
        interactive={interactive}
        className="cordon-bento__surface"
      >
        {children}
      </Surface>
    </motion.div>
  );
}
