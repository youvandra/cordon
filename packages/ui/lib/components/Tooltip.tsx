import { cloneElement, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { transition } from "../../tokens/motion";
import { cx } from "../cx";

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
  const id = `cordon-tip-${useId().replace(/[:»«]/g, "")}`;

  const show = (immediate = false) => {
    window.clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

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
            id={id}
            role="tooltip"
            className={cx("cordon-tooltip__bubble", `cordon-tooltip__bubble--${placement}`)}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={transition.control}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
