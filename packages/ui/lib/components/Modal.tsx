import { useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Surface } from "../primitives/Surface";
import { overlayVariants, scrimVariants } from "../../tokens/motion";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useCordonId } from "../../hooks/useId";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Modal", "Message box".
   A Message box informs; a Modal blocks until answered. Cordon builds the
   second out of the first so the two can never disagree about spacing.
   ========================================================================== */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Hide the corner dismiss. Use for decisions the viewer must actually make. */
  hideClose?: boolean;
  /** Clicking the scrim closes. Off for destructive confirmations. */
  dismissOnScrim?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
  dismissOnScrim = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useCordonId("modal-title");
  const descId = useCordonId("modal-desc");
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, open, handleEscape);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="cordon-modal-layer">
          <motion.div
            className="cordon-scrim"
            variants={scrimVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={dismissOnScrim ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cx("cordon-modal", `cordon-modal--${size}`, className)}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Surface glaze="bisque" radius="6" elevation="overlay" rim grain={0.24} className="cordon-modal__surface">
              {title || !hideClose ? (
                <header className="cordon-modal__header">
                  <div className="cordon-modal__heading">
                    {title ? (
                      <h2 id={titleId} className="cordon-modal__title">
                        {title}
                      </h2>
                    ) : null}
                    {description ? (
                      <p id={descId} className="cordon-modal__description">
                        {description}
                      </p>
                    ) : null}
                  </div>
                  {!hideClose ? (
                    <button type="button" className="cordon-modal__close" aria-label="Close" onClick={onClose}>
                      <Icon name="close" />
                    </button>
                  ) : null}
                </header>
              ) : null}

              {children ? <div className="cordon-modal__body">{children}</div> : null}
              {footer ? <footer className="cordon-modal__footer">{footer}</footer> : null}
            </Surface>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/* ---- Message box --------------------------------------------------------- */

export interface MessageBoxProps extends Omit<ModalProps, "footer" | "children"> {
  tone?: "info" | "caution" | "critical" | "positive";
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}

/**
 * Glossary: "Message box". A small window that states one thing and asks for
 * one decision. If it needs a form, reach for Modal instead.
 */
export function MessageBox({
  tone = "info",
  confirmLabel = "OK",
  cancelLabel,
  onConfirm,
  onClose,
  children,
  ...rest
}: MessageBoxProps) {
  const icon = tone === "critical" ? "alert" : tone === "caution" ? "warning" : tone === "positive" ? "check-circle" : "info";

  return (
    <Modal
      {...rest}
      onClose={onClose}
      size="sm"
      dismissOnScrim={tone !== "critical"}
      className={cx("cordon-messagebox", `cordon-messagebox--${tone}`)}
      footer={
        <>
          {cancelLabel ? (
            <Button variant="ghost" onClick={onClose}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            variant={tone === "critical" ? "danger" : "primary"}
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="cordon-messagebox__body">
        <span className="cordon-messagebox__icon" aria-hidden="true">
          <Icon name={icon} />
        </span>
        <div>{children}</div>
      </div>
    </Modal>
  );
}
