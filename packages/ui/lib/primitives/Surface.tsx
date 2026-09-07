import { forwardRef } from "react";
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { Grain } from "./Grain";
import { usePointerField } from "../../hooks/usePointerField";
import { cx } from "../cx";

export type Glaze = "rose" | "violet" | "ember" | "bisque" | "paper" | "none";
export type SurfaceElevation = "flat" | "tile" | "panel" | "overlay";

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  /** Which firing this surface came out of. */
  glaze?: Glaze;
  /** Corner scale. `tile` tracks the hero's 17/429 ratio against its own width. */
  radius?: "1" | "2" | "3" | "4" | "5" | "6" | "pill" | "tile";
  elevation?: SurfaceElevation;
  /** Fired-clay noise. `true` uses the density the stage picked for that glaze. */
  grain?: boolean | number;
  /** The 102° highlight sweep. On by default for real glazes. */
  sheen?: boolean;
  /** Adds the 1px glass rim. */
  rim?: boolean;
  /** Lifts on hover, using the control curve. */
  interactive?: boolean;
  /**
   * The glaze brightens under the cursor. Reads the pointer straight into CSS
   * custom properties, so tracking never re-renders React.
   */
  glow?: boolean;
  as?: ElementType;
  children?: ReactNode;
}

const GRAIN_BY_GLAZE: Record<Glaze, number> = {
  rose: 0.54,
  violet: 0.68,
  ember: 0.58,
  bisque: 0.3,
  paper: 0.22,
  none: 0.46,
};

/**
 * The one surface every other Cordon component is cut from. A card, a modal, a
 * dropdown panel and a toast are all Surfaces at different elevations — which
 * is the whole reason the system reads as one material.
 */
export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  {
    glaze = "bisque",
    radius = "5",
    elevation = "tile",
    grain = true,
    sheen,
    rim,
    interactive = false,
    glow = false,
    as,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const Tag = (as ?? "div") as ElementType;
  const field = usePointerField({ disabled: !glow });
  const isGlazed = glaze === "rose" || glaze === "violet" || glaze === "ember";
  const showSheen = sheen ?? isGlazed;
  const showRim = rim ?? isGlazed;
  const grainOpacity =
    grain === false ? 0 : grain === true ? GRAIN_BY_GLAZE[glaze] : grain;

  return (
    <Tag
      ref={ref}
      className={cx(
        "cordon-surface",
        `cordon-surface--${glaze}`,
        `cordon-surface--r${radius}`,
        `cordon-surface--e${elevation}`,
        showSheen && "cordon-surface--sheen",
        showRim && "cordon-surface--rim",
        interactive && "cordon-surface--interactive",
        glow && "cordon-surface--glow",
        isGlazed && "cordon-on-glaze",
        className,
      )}
      style={style as CSSProperties}
      {...(glow ? field.bind : {})}
      {...rest}
    >
      {grainOpacity > 0 ? <Grain opacity={grainOpacity} /> : null}
      {children}
    </Tag>
  );
});
