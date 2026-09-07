import { useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { spring } from "../../tokens/spring";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { cx } from "../cx";

/* ==========================================================================
   Sheet — a panel anchored to an edge, draggable shut.

   A modal takes the middle of the screen and stops everything. A sheet keeps
   the page visible behind it and can be thrown away with a flick, which is
   what makes it the right shape for filters, details and mobile navigation.
   ========================================================================== */

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: "bottom" | "right" | "left";
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Fraction of the viewport the sheet occupies. */
  size?: number;
  className?: string;
}

export function Sheet({
  open,
  onClose,
  side = "bottom",
  title,
  description,
  children,
  footer,
  size = 0.62,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

  if (typeof document === "undefined") return null;

  const axis = side === "bottom" ? "y" : "x";
  const closed = side === "bottom" ? { y: "100%" } : { x: side === "left" ? "-100%" : "100%" };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="cordon-sheet-layer">
          <motion.div
            className="cordon-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : "Panel"}
            tabIndex={-1}
            className={cx("cordon-sheet", `cordon-sheet--${side}`, className)}
            style={side === "bottom" ? { height: `${size * 100}svh` } : { width: `min(${size * 100}vw, 520px)` }}
            initial={closed}
            animate={{ x: 0, y: 0 }}
            exit={closed}
            transition={spring.heavy}
            drag={axis}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            dragElastic={{ top: 0, bottom: 0.6, left: 0.6, right: 0.6 }}
            onDragEnd={(_, info) => {
              /* Velocity, not distance — a fast short flick should still close. */
              const thrown = axis === "y" ? info.velocity.y > 480 : Math.abs(info.velocity.x) > 480;
              const dragged = axis === "y" ? info.offset.y > 120 : Math.abs(info.offset.x) > 120;
              if (thrown || dragged) onClose();
            }}
          >
            <div className="cordon-sheet__grip" aria-hidden="true" />
            <header className="cordon-sheet__header">
              <div>
                {title ? <h2 className="cordon-sheet__title">{title}</h2> : null}
                {description ? <p className="cordon-sheet__description">{description}</p> : null}
              </div>
              <button type="button" className="cordon-modal__close" aria-label="Close" onClick={onClose}>
                <Icon name="close" />
              </button>
            </header>
            <div className="cordon-sheet__body">{children}</div>
            {footer ? <footer className="cordon-sheet__footer">{footer}</footer> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
