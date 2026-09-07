import { forwardRef } from "react";
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Containers", "Grids", "Gutters", "Margin", "Padding",
   "Breakpoints", "Responsive design", "Alignment".
   These are layout facts, so they are props on three components rather than
   utility classes — a container with a named width can be audited; a stack
   of `mt-4` cannot.
   ========================================================================== */

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  /** `content` is the hero's own 3×429 + 2 gaps = 1333px measure. */
  width?: "prose" | "content" | "wide" | "full";
  /** Horizontal breathing room. Defaults to the stage gutter. */
  gutter?: boolean;
  as?: ElementType;
  children?: ReactNode;
}

export const Container = forwardRef<HTMLElement, ContainerProps>(function Container(
  { width = "content", gutter = true, as, className, children, ...rest },
  ref,
) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      ref={ref}
      className={cx("cordon-container", `cordon-container--${width}`, gutter && "cordon-container--gutter", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Column count at the widest breakpoint. */
  columns?: number;
  /** Smallest a column may get before the grid drops a column. */
  min?: number | string;
  gap?: "none" | "sm" | "md" | "lg";
  align?: "start" | "center" | "end" | "stretch";
  children?: ReactNode;
}

/** A real grid: columns, gutters, and a floor under the column width. */
export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  { columns = 3, min, gap = "md", align = "stretch", className, style, children, ...rest },
  ref,
) {
  const vars = {
    "--cordon-grid-columns": columns,
    "--cordon-grid-min": typeof min === "number" ? `${min}px` : min,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={cx("cordon-grid", `cordon-grid--gap-${gap}`, `cordon-grid--align-${align}`, min && "cordon-grid--fluid", className)}
      style={{ ...vars, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "baseline" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  children?: ReactNode;
}

/** One-dimensional layout. The other 90% of what a grid gets misused for. */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { direction = "column", gap = "md", align = "stretch", justify = "start", wrap = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        "cordon-stack",
        `cordon-stack--${direction}`,
        `cordon-stack--gap-${gap}`,
        `cordon-stack--align-${align}`,
        `cordon-stack--justify-${justify}`,
        wrap && "cordon-stack--wrap",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface StageProps extends HTMLAttributes<HTMLElement> {
  /** Looping background video. Muted, inert, decorative by definition. */
  video?: { src: string; poster?: string };
  /** Still shown before the video and whenever motion is reduced. */
  poster?: string;
  /** Fills the viewport and refuses to scroll, as the hero does. */
  fullHeight?: boolean;
  children?: ReactNode;
}

/**
 * The paper stage the whole system was drawn on: a full-viewport ground with
 * an optional looping video behind a wash of paper.
 */
export const Stage = forwardRef<HTMLElement, StageProps>(function Stage(
  { video, poster, fullHeight = true, className, style, children, ...rest },
  ref,
) {
  const background = poster
    ? {
        backgroundImage: `linear-gradient(rgba(236,236,234,.10), rgba(236,236,234,.10)), url("${poster}")`,
      }
    : undefined;

  return (
    <section
      ref={ref}
      className={cx("cordon-stage", fullHeight && "cordon-stage--full", className)}
      style={{ ...background, ...style }}
      {...rest}
    >
      {video ? (
        <video
          className="cordon-stage__motion"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          poster={video.poster ?? poster}
          src={video.src}
        />
      ) : null}
      {children}
    </section>
  );
});
