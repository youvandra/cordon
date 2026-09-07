import { forwardRef, useMemo } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { layoutDots } from "./dotFont";
import { cx } from "../cx";

export interface DotTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The string to render as dots. */
  children: string;
  /** Column pitch. `word` = 4 (tighter, for prose), `numeral` = 5. */
  spacing?: "word" | "numeral";
  /** Dot radius in glyph units. The stage uses 1.8 / 2.05 / 2.32 / 1.55. */
  radius?: number;
  /** Colour of the dots. Defaults to `currentColor`. */
  tone?: string;
  /**
   * Sets the face at the height of the surrounding type rather than the
   * width of its box, so a numeral can sit inside a sentence, a pill or a
   * button without being measured by hand.
   */
  inline?: boolean;
}

/**
 * The house display face. Every headline number and hero word in Cordon is set
 * in it, which is why it lives in the library rather than in one page's CSS.
 */
export const DotText = forwardRef<HTMLSpanElement, DotTextProps>(function DotText(
  { children, spacing = "numeral", radius, className, style, tone, inline = false, ...rest },
  ref,
) {
  const pitchX = spacing === "word" ? 4 : 5;
  const dotRadius = radius ?? (spacing === "word" ? 1.8 : 1.55);

  const { dots, width, height } = useMemo(
    () => layoutDots(children, { pitchX }),
    [children, pitchX],
  );

  const vars = { "--cordon-dot-tone": tone } as CSSProperties;

  return (
    <span
      ref={ref}
      className={cx("cordon-dottext", inline && "cordon-dottext--inline", className)}
      style={{ ...vars, ...style }}
      role="img"
      aria-label={children}
      {...rest}
    >
      <svg
        className="cordon-dottext__svg"
        viewBox={`0 0 ${width} ${height}`}
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        {dots.map((dot, index) => (
          <circle key={index} cx={dot.cx} cy={dot.cy} r={dotRadius} />
        ))}
      </svg>
    </span>
  );
});
