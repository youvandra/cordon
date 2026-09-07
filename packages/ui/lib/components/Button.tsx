import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { spring } from "../../tokens/spring";
import { usePointerField } from "../../hooks/usePointerField";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Button — glossary: "Button", "Call-to-action", "Primary and secondary
   button", "Dropdown button", "Plus button", "Share button".
   All six are this one component; they differ by intent, not by mechanism,
   and collapsing them is what keeps their hover, focus and press identical.
   ========================================================================== */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "glaze" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon before the label. */
  iconStart?: IconName;
  /** Icon after the label. */
  iconEnd?: IconName;
  /** Square button with no label. Requires `aria-label`. */
  iconOnly?: boolean;
  /** Fills its container. */
  block?: boolean;
  /** Swaps the label for a spinner and blocks the click. */
  loading?: boolean;
  /** Which glaze a `glaze` / `primary` button is fired in. */
  glaze?: "rose" | "violet" | "ember";
  /**
   * The button drifts toward the cursor while it is over it, on a loose
   * spring. Reserved for the one control a screen actually wants pressed —
   * every button doing this is noise, not personality.
   */
  magnetic?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    iconStart,
    iconEnd,
    iconOnly = false,
    block = false,
    loading = false,
    glaze,
    magnetic = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const { reducedMotion, glaze: houseGlaze } = useCordon();
  const firing = glaze ?? houseGlaze;
  const isDisabled = disabled || loading;
  const field = usePointerField({ pull: 5, disabled: !magnetic || isDisabled });

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        "cordon-button",
        `cordon-button--${variant}`,
        `cordon-button--${size}`,
        iconOnly && "cordon-button--icon-only",
        block && "cordon-button--block",
        loading && "cordon-button--loading",
        className,
      )}
      data-glaze={variant === "primary" || variant === "glaze" ? firing : undefined}
      style={magnetic ? { x: field.x, y: field.y } : undefined}
      whileHover={isDisabled || reducedMotion ? undefined : { scale: 1.02 }}
      whileTap={isDisabled || reducedMotion ? undefined : { scale: 0.97 }}
      transition={spring.snap}
      {...(magnetic ? field.bind : {})}
      {...rest}
    >
      {loading ? (
        <Icon name="spinner" className="cordon-button__spinner" />
      ) : (
        iconStart && <Icon name={iconStart} className="cordon-button__icon" />
      )}
      {!iconOnly && children ? <span className="cordon-button__label">{children}</span> : null}
      {!loading && iconEnd ? <Icon name={iconEnd} className="cordon-button__icon" /> : null}
    </motion.button>
  );
});

/* ---- Call to action ------------------------------------------------------ */

export interface CtaProps extends Omit<ButtonProps, "variant" | "size"> {
  /** The quiet line under the label — a CTA earns its size by saying more. */
  hint?: ReactNode;
}

/**
 * Glossary: "Call-to-action". A primary button with room for a reason.
 */
export const Cta = forwardRef<HTMLButtonElement, CtaProps>(function Cta(
  { hint, className, children, iconEnd = "arrow-right", ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant="primary"
      size="lg"
      iconEnd={iconEnd}
      className={cx("cordon-cta", hint && "cordon-cta--stacked", className)}
      {...rest}
    >
      <span className="cordon-cta__label">{children}</span>
      {hint ? <span className="cordon-cta__hint">{hint}</span> : null}
    </Button>
  );
});

/* ---- Plus button --------------------------------------------------------- */

export interface PlusButtonProps extends Omit<ButtonProps, "iconOnly" | "iconStart" | "children"> {
  label?: string;
}

/** Glossary: "Plus button". Says "there can be more of these". */
export const PlusButton = forwardRef<HTMLButtonElement, PlusButtonProps>(
  function PlusButton({ label = "Add", className, ...rest }, ref) {
    return (
      <Button
        ref={ref}
        iconOnly
        iconStart="plus"
        aria-label={label}
        className={cx("cordon-button--plus", className)}
        {...rest}
      />
    );
  },
);

/* ---- Share button -------------------------------------------------------- */

export interface ShareButtonProps extends Omit<ButtonProps, "iconStart"> {
  /** Passed to the Web Share sheet when the browser has one. */
  share?: { title?: string; text?: string; url?: string };
  /** Called when the browser has no share sheet, so you can open your own. */
  onFallback?: (data: ShareButtonProps["share"]) => void;
}

/** Glossary: "Share button". Uses the platform sheet when there is one. */
export const ShareButton = forwardRef<HTMLButtonElement, ShareButtonProps>(
  function ShareButton({ share, onFallback, children = "Share", onClick, ...rest }, ref) {
    return (
      <Button
        ref={ref}
        iconStart="share"
        onClick={async (event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          if (typeof navigator !== "undefined" && navigator.share && share) {
            try {
              await navigator.share(share);
              return;
            } catch {
              /* the viewer dismissed the sheet — not an error worth raising */
            }
          }
          onFallback?.(share);
        }}
        {...rest}
      >
        {children}
      </Button>
    );
  },
);
