import { useId, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { spring } from "../../tokens/spring";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   The middle class of a design system: the parts nobody lists in a glossary
   and every real app needs before it ships.
   ========================================================================== */

/* ---- Segmented control --------------------------------------------------- */

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  icon?: IconName;
  disabled?: boolean;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: "sm" | "md";
  /** Fills its container instead of hugging its labels. */
  block?: boolean;
  label?: string;
  className?: string;
}

/**
 * For switching a view, not for submitting a choice — the thumb travels on a
 * spring, which is the whole reason to use one over a row of buttons.
 */
export function Segmented({
  options,
  value,
  defaultValue,
  onValueChange,
  size = "md",
  block = false,
  label,
  className,
}: SegmentedProps) {
  const groupId = useId().replace(/[:»«]/g, "");
  const [internal, setInternal] = useState(defaultValue ?? options[0]?.value);
  const current = value ?? internal;
  const { reducedMotion } = useCordon();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("cordon-segmented", `cordon-segmented--${size}`, block && "cordon-segmented--block", className)}
    >
      {options.map((option) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            className={cx("cordon-segmented__option", active && "cordon-segmented__option--active")}
            onClick={() => {
              if (value === undefined) setInternal(option.value);
              onValueChange?.(option.value);
            }}
          >
            {active ? (
              <motion.span
                layoutId={`cordon-segmented-${groupId}`}
                className="cordon-segmented__thumb"
                transition={reducedMotion ? { duration: 0 } : spring.snap}
              />
            ) : null}
            {option.icon ? <Icon name={option.icon} /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---- Avatar -------------------------------------------------------------- */

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  src?: string;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg";
  /** Ring colour, for presence or ownership. */
  status?: "online" | "away" | "busy" | "none";
}

/** Initials fall back to the glaze, so a missing image is still on-brand. */
export function Avatar({ src, name = "", size = "md", status = "none", className, ...rest }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return (
    <span
      className={cx("cordon-avatar", `cordon-avatar--${size}`, status !== "none" && `cordon-avatar--${status}`, className)}
      title={name || undefined}
      {...rest}
    >
      {src ? <img src={src} alt={name} /> : <span aria-hidden="true">{initials || "?"}</span>}
      {!src && name ? <span className="cordon-visually-hidden">{name}</span> : null}
    </span>
  );
}

export interface AvatarGroupProps {
  children: ReactNode;
  /** Show this many, then a +N chip. */
  max?: number;
  total?: number;
  className?: string;
}

export function AvatarGroup({ children, max, total, className }: AvatarGroupProps) {
  const items = Array.isArray(children) ? children : [children];
  const shown = max ? items.slice(0, max) : items;
  const hidden = (total ?? items.length) - shown.length;

  return (
    <span className={cx("cordon-avatar-group", className)}>
      {shown}
      {hidden > 0 ? <span className="cordon-avatar cordon-avatar--md cordon-avatar--more">+{hidden}</span> : null}
    </span>
  );
}

/* ---- Skeleton ------------------------------------------------------------ */

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** `text` draws staggered lines; `block` a single shape. */
  variant?: "text" | "block" | "circle";
  lines?: number;
  width?: number | string;
  height?: number | string;
}

/**
 * The shimmer is the stage's 102° sheen sweeping, not a grey pulse — a
 * loading state should still look like the material it is loading into.
 */
export function Skeleton({ variant = "block", lines = 3, width, height, className, style, ...rest }: SkeletonProps) {
  if (variant === "text") {
    return (
      <span className={cx("cordon-skeleton-text", className)} aria-hidden="true" {...rest}>
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className="cordon-skeleton"
            style={{ width: index === lines - 1 ? "62%" : "100%", height: 11 }}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      className={cx("cordon-skeleton", variant === "circle" && "cordon-skeleton--circle", className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}

/* ---- Empty state --------------------------------------------------------- */

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Draws the gauge ring behind the icon — an empty state that still reads. */
  ornament?: boolean;
  className?: string;
}

export function EmptyState({ icon = "layers", title, description, action, ornament = true, className }: EmptyStateProps) {
  return (
    <div className={cx("cordon-empty", className)}>
      <span className={cx("cordon-empty__mark", ornament && "cordon-empty__mark--ring")} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <p className="cordon-empty__title">{title}</p>
      {description ? <p className="cordon-empty__description">{description}</p> : null}
      {action ? <div className="cordon-empty__action">{action}</div> : null}
    </div>
  );
}
