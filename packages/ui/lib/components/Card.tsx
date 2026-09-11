import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { Surface } from "../primitives/Surface";
import type { Glaze } from "../primitives/Surface";
import { DotText } from "../primitives/DotText";
import { Gauge } from "../primitives/Gauge";
import { Button } from "./Button";
import { establishVariants, transition, CHILD_OFFSET } from "../../tokens/motion";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Card". Plus MetricCard, which is the stage's own tile — the
   thing the rest of this system was reverse-engineered from.
   ========================================================================== */

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  glaze?: Glaze;
  /** Lifts on hover. Set when the whole card is one link. */
  interactive?: boolean;
  /** Position in a row, for the stage's 0.12s stagger. */
  index?: number;
  /** Plays the establish entrance on mount. */
  animate?: boolean;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { glaze = "bisque", interactive = false, index = 0, animate = false, className, children, ...rest },
  ref,
) {
  const { reducedMotion } = useCordon();
  const shouldAnimate = animate && !reducedMotion;

  return (
    <motion.div
      ref={ref}
      className={cx("cordon-card", className)}
      variants={shouldAnimate ? establishVariants : undefined}
      initial={shouldAnimate ? "hidden" : false}
      animate={shouldAnimate ? "visible" : undefined}
      transition={shouldAnimate ? { ...transition.establish, delay: 0.46 + index * 0.12 } : undefined}
      {...rest}
    >
      <Surface
        glaze={glaze}
        radius="5"
        elevation="tile"
        interactive={interactive}
        className="cordon-card__surface"
      >
        {children}
      </Surface>
    </motion.div>
  );
});

export interface CardMediaProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  /** Aspect ratio as `w/h`. */
  ratio?: string;
  children?: ReactNode;
}

export function CardMedia({ src, alt = "", ratio = "16/9", className, style, children, ...rest }: CardMediaProps) {
  return (
    <div className={cx("cordon-card__media", className)} style={{ aspectRatio: ratio, ...style }} {...rest}>
      {src ? <img src={src} alt={alt} /> : children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("cordon-card__header", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("cordon-card__body", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("cordon-card__footer", className)} {...rest}>
      {children}
    </div>
  );
}

/* ---- Metric card --------------------------------------------------------- */

export interface MetricCardProps {
  /** Two lines: what is measured, then what that means. */
  title: ReactNode;
  /** The number itself, set in LED dot type. */
  value: string;
  /** Unit printed beside the number, in ordinary type. */
  unit?: string;
  caption?: ReactNode;
  /**
   * The figure between the title and the number. Left alone it is the stage's
   * tick ring, pointed at `progress` — the hero's own instrument, reading.
   * Pass `null` for a bare tile, or any node to replace it.
   */
  figure?: ReactNode | null;
  /** 0–1, drives the default gauge. */
  progress?: number;
  action?: { label: string; onClick?: () => void };
  glaze?: "rose" | "violet" | "ember";
  index?: number;
  animate?: boolean;
  className?: string;
}

/**
 * The tile from the stage, generalised. It keeps the hero's proportions —
 * 429 × 554, radius 3.96% of width, every inner offset a percentage — so the
 * card scales as one rigid unit and never re-lays-out internally.
 */
export function MetricCard({
  title,
  value,
  unit,
  caption,
  figure,
  progress = 0.62,
  action,
  glaze = "rose",
  index = 0,
  animate = true,
  className,
}: MetricCardProps) {
  const { reducedMotion } = useCordon();
  const on = animate && !reducedMotion;
  const base = 0.46 + index * 0.12;

  const child = (offset: number) =>
    on
      ? {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { ...transition.settle, delay: base + offset },
        }
      : {};

  return (
    <motion.article
      /* `--bare` shortens the tile by exactly the action's share. Without it a
         tile with no action keeps the hero's proportions and reserves a
         quarter of itself for a button that was never passed. */
      className={cx("cordon-metriccard", !action && "cordon-metriccard--bare", className)}
      initial={on ? { opacity: 0.52, y: 10, scale: 0.985 } : false}
      animate={on ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={on ? { ...transition.establish, delay: base } : undefined}
    >
      <Surface glaze={glaze} radius="tile" elevation="tile" className="cordon-metriccard__surface">
        <motion.h3 className="cordon-metriccard__title" {...child(CHILD_OFFSET.title)}>
          {title}
        </motion.h3>

        {figure !== null ? (
          <motion.div className="cordon-metriccard__figure" {...child(CHILD_OFFSET.figure)}>
            {figure ?? <Gauge value={progress} size="100%" />}
          </motion.div>
        ) : null}

        <motion.div className="cordon-metriccard__metric" {...child(CHILD_OFFSET.metric)}>
          <DotText className="cordon-metriccard__value" radius={2.05}>
            {value}
          </DotText>
          {unit ? <span className="cordon-metriccard__unit">{unit}</span> : null}
        </motion.div>

        {caption ? (
          <motion.p className="cordon-metriccard__caption" {...child(CHILD_OFFSET.caption)}>
            {caption}
          </motion.p>
        ) : null}

        {action ? (
          <motion.div className="cordon-metriccard__action" {...child(CHILD_OFFSET.control)}>
            <Button variant="secondary" onClick={action.onClick}>
              {action.label}
            </Button>
          </motion.div>
        ) : null}
      </Surface>
    </motion.article>
  );
}
