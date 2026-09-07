import { useCallback, useRef, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { spring } from "../tokens/spring";
import { useCordonReducedMotion } from "./useReducedMotion";

/* ==========================================================================
   Pointer-reactive surfaces.

   A Cordon surface knows where the cursor is over it. That single fact drives
   the glaze highlight, the rim brightening on the near edge, and the pull on
   a magnetic control — so a tile responds before it is clicked instead of
   waiting to be told.
   ========================================================================== */

export interface PointerFieldOptions {
  /** How far a magnetic element travels toward the pointer, in px. */
  pull?: number;
  /** Stop tracking entirely. */
  disabled?: boolean;
}

export interface PointerField {
  /** Spread onto the element you want to track. */
  bind: {
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onPointerEnter: () => void;
  };
  /** 0–1 across the box, for CSS. Written as `--cordon-px` / `--cordon-py`. */
  ref: React.RefObject<HTMLElement>;
  /** Spring-smoothed offset toward the pointer, for magnetic elements. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  hovered: boolean;
}

export function usePointerField({ pull = 0, disabled = false }: PointerFieldOptions = {}): PointerField {
  const ref = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const reduced = useCordonReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, spring.magnetic);
  const y = useSpring(rawY, spring.magnetic);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || reduced) return;
      const node = ref.current ?? (event.currentTarget as HTMLElement);
      const box = node.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width;
      const py = (event.clientY - box.top) / box.height;

      /* CSS reads these; no React state, so a pointer move never re-renders. */
      node.style.setProperty("--cordon-px", `${(px * 100).toFixed(2)}%`);
      node.style.setProperty("--cordon-py", `${(py * 100).toFixed(2)}%`);

      if (pull) {
        rawX.set((px - 0.5) * pull * 2);
        rawY.set((py - 0.5) * pull * 2);
      }
    },
    [disabled, reduced, pull, rawX, rawY],
  );

  const onPointerLeave = useCallback(() => {
    setHovered(false);
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  const onPointerEnter = useCallback(() => setHovered(true), []);

  return { bind: { onPointerMove, onPointerLeave, onPointerEnter }, ref, x, y, hovered };
}
