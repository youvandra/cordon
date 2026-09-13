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

/**
 * The horizontal band the bubble has to stay inside.
 *
 * The window is only the outermost of these. A tooltip inside a scroller or a
 * modal is clipped by that box long before it reaches the edge of the screen —
 * `Modal` sets `overflow: hidden` on its surface and `overflow-y: auto` on its
 * body, and a `overflow-y` that is not `visible` computes `overflow-x` to the
 * same thing, so both clip sideways. Clamping to the window there moves the
 * bubble to a position that is on screen and still cut in half, which is what
 * an owner saw on the first field this pattern was used on.
 */
/**
 * Whether this element is the containing block for `position: fixed`
 * descendants, and so clips them despite their being fixed.
 *
 * These are the properties that take a fixed element out of the viewport's
 * coordinate space and put it in an ancestor's. Without this test the rule
 * below would be "nothing above a fixed element clips it", which is the common
 * case and not the whole one.
 */
function holdsFixedDescendants(style: CSSStyleDeclaration): boolean {
  return (
    style.transform !== "none" ||
    style.perspective !== "none" ||
    style.filter !== "none" ||
    (style as CSSStyleDeclaration & { backdropFilter?: string }).backdropFilter !== undefined &&
      (style as CSSStyleDeclaration & { backdropFilter?: string }).backdropFilter !== "none" ||
    /\b(paint|layout|strict|content)\b/.test(style.contain) ||
    /\b(transform|filter|perspective)\b/.test(style.willChange)
  );
}

function clipBand(node: Element): { left: number; right: number } {
  let left = 0;
  let right = window.innerWidth;
  /**
   * True once the walk has passed a `position: fixed` ancestor and has not yet
   * found the element that holds it.
   *
   * A fixed element's containing block is the viewport, so an ancestor above
   * it with `overflow: hidden` does not clip it — and counting one anyway
   * narrows the band to a box the bubble is not inside, then shifts the bubble
   * to fit a boundary that was never there. `Modal` renders into a fixed
   * layer, and `body` on this console carries `overflow: hidden`, so the walk
   * met exactly that shape: measured, the band came back 312..712 where the
   * browser painted 0..1024.
   */
  let escaped = false;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clips = escaped ? holdsFixedDescendants(style) : true;

    if (clips && (style.overflowX !== "visible" || style.overflowY !== "visible")) {
      const box = parent.getBoundingClientRect();
      /* A clipper that has not been laid out yet would otherwise collapse the
         band to nothing and pin every bubble to the left of the screen. */
      if (box.width !== 0) {
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
    }

    /* Whatever holds the fixed element is back in the ordinary chain, and so
       is everything above it. */
    if (escaped && holdsFixedDescendants(style)) escaped = false;
    if (style.position === "fixed") escaped = true;
  }
  return { left, right };
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
    const band = clipBand(node);
    /* Measured against where it sits now, so this converges: the shift is
       applied to the same element it was measured on, and an element already
       inside the band measures an overflow of zero. */
    const pastLeft = band.left + margin - box.left;
    const pastRight = box.right - (band.right - margin);

    let nudge = 0;
    if (pastLeft > 0) nudge = pastLeft;
    else if (pastRight > 0) nudge = -pastRight;

    /* A bubble wider than the band cannot be made to fit by moving it, and
       pinning it to the left edge is the readable half of that. */
    if (box.width > band.right - band.left - margin * 2) nudge = band.left + margin - box.left;

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
