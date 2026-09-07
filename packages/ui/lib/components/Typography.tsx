import { useMemo } from "react";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { DotText } from "../primitives/DotText";
import { revealVariants, supportVariants } from "../../tokens/motion";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Type", "Typeface", "Typography", "Hierarchy", "Line height".
   ========================================================================== */

export interface HeadlineProps extends Omit<HTMLAttributes<HTMLHeadingElement>, "children"> {
  /** Each string is one line. Lines animate in 0.09s apart, as the hero does. */
  lines: ReactNode[];
  /** Renders this word in LED dot type, wherever it appears in `lines`. */
  dotWord?: string;
  as?: ElementType;
  animate?: boolean;
}

/**
 * The masthead. Lines are explicit rather than wrapped, because the hero's
 * two-line break is a design decision, not a consequence of the viewport.
 */
export function Headline({ lines, dotWord, as, animate = true, className, ...rest }: HeadlineProps) {
  const Tag = (as ?? "h1") as ElementType;
  const { reducedMotion } = useCordon();
  const on = animate && !reducedMotion;

  const renderLine = (line: ReactNode) => {
    if (typeof line !== "string" || !dotWord || !line.includes(dotWord)) return line;
    const [before, after] = line.split(dotWord);
    return (
      <>
        {before}
        <DotText className="cordon-headline__dotword" spacing="word" radius={1.8}>
          {dotWord}
        </DotText>
        {after}
      </>
    );
  };

  return (
    <Tag className={cx("cordon-headline", className)} {...rest}>
      {lines.map((line, index) => (
        <motion.span
          key={index}
          className="cordon-headline__line"
          variants={on ? revealVariants : undefined}
          initial={on ? "hidden" : false}
          animate={on ? "visible" : undefined}
          transition={on ? { delay: 0.08 + index * 0.09 } : undefined}
        >
          {renderLine(line)}
        </motion.span>
      ))}
    </Tag>
  );
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  variant?: "lead" | "body" | "caption" | "micro";
  tone?: "ink" | "copy" | "dim" | "accent" | "on-glaze";
  as?: ElementType;
  animate?: boolean;
  children?: ReactNode;
}

export function Text({ variant = "body", tone = "copy", as, animate = false, className, children, ...rest }: TextProps) {
  const Tag = (as ?? "p") as ElementType;
  const { reducedMotion } = useCordon();
  const on = animate && !reducedMotion;
  // motion(Tag) must be memoised: building it inline would hand React a new
  // component type on every render and remount the paragraph mid-animation.
  const Motion = useMemo(() => motion.create(Tag), [Tag]);
  const Component = on ? Motion : Tag;

  return (
    <Component
      className={cx("cordon-text", `cordon-text--${variant}`, `cordon-text--${tone}`, className)}
      variants={on ? supportVariants : undefined}
      initial={on ? "hidden" : undefined}
      animate={on ? "visible" : undefined}
      {...rest}
    >
      {children}
    </Component>
  );
}

export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  /** The wordmark. Set in LED dot type, which is the mark. */
  name?: string;
  /** Mark only, no words. */
  markOnly?: boolean;
  size?: number;
}

/** Glossary: "Logo". */
export function Logo({ name = "Cordon", markOnly = false, size = 22, className, ...rest }: LogoProps) {
  return (
    <span className={cx("cordon-logo", className)} style={{ fontSize: size }} {...rest}>
      <span className="cordon-logo__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="url(#cordonLogoGlaze)" />
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="rgba(255,255,255,.4)" />
          <circle cx="9" cy="9" r="1.7" fill="#fff" opacity=".92" />
          <circle cx="15" cy="9" r="1.7" fill="#fff" opacity=".62" />
          <circle cx="9" cy="15" r="1.7" fill="#fff" opacity=".62" />
          <circle cx="15" cy="15" r="1.7" fill="#fff" opacity=".92" />
          <defs>
            <linearGradient id="cordonLogoGlaze" x1="2" y1="2" x2="22" y2="22">
              <stop offset="0" stopColor="#bd4468" />
              <stop offset="0.55" stopColor="#ad355b" />
              <stop offset="1" stopColor="#8c1320" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      {!markOnly ? (
        <DotText className="cordon-logo__word" spacing="word" radius={1.8}>
          {name}
        </DotText>
      ) : null}
      <span className="cordon-visually-hidden">{name}</span>
    </span>
  );
}
