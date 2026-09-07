import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Tag".
   ========================================================================== */

export type TagTone = "neutral" | "rose" | "violet" | "ember" | "positive" | "caution" | "critical" | "info";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  size?: "sm" | "md";
  /** Fired glaze instead of a quiet tint. Use sparingly — it shouts. */
  solid?: boolean;
  /** Shows a dismiss affordance and calls this. */
  onRemove?: () => void;
  /** A small leading dot, for status lists. */
  dot?: boolean;
  children: ReactNode;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { tone = "neutral", size = "md", solid = false, onRemove, dot = false, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx("cordon-tag", `cordon-tag--${tone}`, `cordon-tag--${size}`, solid && "cordon-tag--solid", className)}
      {...rest}
    >
      {dot ? <span className="cordon-tag__dot" aria-hidden="true" /> : null}
      <span className="cordon-tag__label">{children}</span>
      {onRemove ? (
        <button
          type="button"
          className="cordon-tag__remove"
          aria-label={typeof children === "string" ? `Remove ${children}` : "Remove"}
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      ) : null}
    </span>
  );
});
