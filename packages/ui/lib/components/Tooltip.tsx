import { cloneElement, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { transition } from "../../tokens/motion";
import { cx } from "../cx";
import { useFrames } from "../../hooks/useFrames";

/* Glossary: "Tooltip" (and the pattern behind "Informational components"). */

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: ReactNode;
  placement?: TooltipPlacement;
  /** Milliseconds before it appears on hover. Keyboard focus is immediate. */
  delay?: number;
  /** The trigger. Must forward a ref and spread props. */
  children: ReactElement;
  className?: string;
}

export function Tooltip({ content, placement = "top", delay = 140, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const bubble = useRef<HTMLSpanElement | null>(null);
  /**
   * How far to nudge the bubble back inside the window, in pixels.
   *
   * The placement classes centre the bubble on a trigger, and a trigger near
   * an edge therefore puts half of it off the screen — an icon at the left of
   * a card had the first words of its sentence cut off, which is how this was
   * found. `Field` worked around it by anchoring its own bubble; every other
   * caller had nothing.
   *
   * This may only ever *move* the bubble. The bubble is rendered and readable
   * at its CSS placement whether or not this runs: a hidden document is
   * allowed to lay out and this is a layout effect rather than a frame, but if
   * it measured nothing the rule is the project's own — a zero is a missing
   * measurement and not a measurement of zero, so it shifts by nothing and the
   * CSS placement stands.
   */
  const [shift, setShift] = useState(0);
  /* The third component whose presence was decided by an animation. A hidden
     document runs no frames, so the bubble entered at opacity 0 and stayed
     there, and its exit never completed either. */
  const frames = useFrames();
  const id = `cordon-tip-${useId().replace(/[:»«]/g, "")}`;

  const show = (immediate = false) => {
    window.clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
    /* Cleared, so a second opening is measured from its placement rather than
       from where the last one ended up. */
    setShift(0);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const node = bubble.current;
    if (!node) return;

    const box = node.getBoundingClientRect();
    /* Nothing was laid out. Leave the placement alone. */
    if (box.width === 0 && box.height === 0) return;

    const margin = 8;
    /* Measured against where it sits now, so this converges: the shift is
       applied to the same element it was measured on, and an element already
       inside the window measures an overflow of zero. */
    const pastLeft = margin - box.left;
    const pastRight = box.right - (window.innerWidth - margin);

    let nudge = 0;
    if (pastLeft > 0) nudge = pastLeft;
    else if (pastRight > 0) nudge = -pastRight;

    /* A bubble wider than the window cannot be made to fit by moving it, and
       pinning it to the left edge is the readable half of that. */
    if (box.width > window.innerWidth - margin * 2) nudge = margin - box.left;

    if (Math.abs(nudge) >= 1) setShift((was) => was + nudge);
  }, [open, content]);

  const trigger = cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: () => show(),
    onMouseLeave: hide,
    onFocus: () => show(true),
    onBlur: hide,
  } as Partial<ReactElement["props"]>);

  return (
    <span className={cx("cordon-tooltip", className)}>
      {trigger}
      <AnimatePresence>
        {open ? (
          <motion.span
            ref={bubble}
            id={id}
            role="tooltip"
            className={cx("cordon-tooltip__bubble", `cordon-tooltip__bubble--${placement}`)}
            /* A margin rather than a transform: the placement classes centre
               with `translateX(-50%)`, and anything that writes `transform`
               here drops it. */
            style={shift ? { marginLeft: `${shift}px` } : undefined}
            /* Opacity only. Animating `scale` makes motion own `transform`,
               which silently drops the `translateX(-50%)` the placement
               classes centre the bubble with — near a right-hand edge that is
               a tooltip half off the screen. */
            initial={frames ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={frames ? transition.control : { duration: 0 }}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
