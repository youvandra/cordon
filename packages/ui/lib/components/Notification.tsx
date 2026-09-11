import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { useFrames } from "../../hooks/useFrames";
import type { IconName } from "./Icon";
import { transition } from "../../tokens/motion";
import { cx } from "../cx";

/* Glossary: "Notification" — plus the toast stack that makes it usable. */

export type NotificationTone = "info" | "positive" | "caution" | "critical";

const TONE_ICON: Record<NotificationTone, IconName> = {
  info: "info",
  positive: "check-circle",
  caution: "warning",
  critical: "alert",
};

export interface NotificationProps {
  tone?: NotificationTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Renders a dismiss button wired to this. */
  onDismiss?: () => void;
  /** A single trailing action, e.g. "Undo". */
  action?: ReactNode;
  /** Drop the icon for dense lists. */
  hideIcon?: boolean;
  className?: string;
}

/** Inline notification. Place it where the thing it describes happened. */
export function Notification({
  tone = "info",
  title,
  children,
  onDismiss,
  action,
  hideIcon = false,
  className,
}: NotificationProps) {
  return (
    <div
      className={cx("cordon-notification", `cordon-notification--${tone}`, className)}
      role={tone === "critical" ? "alert" : "status"}
    >
      {!hideIcon ? (
        <span className="cordon-notification__icon" aria-hidden="true">
          <Icon name={TONE_ICON[tone]} />
        </span>
      ) : null}
      <div className="cordon-notification__text">
        {title ? <p className="cordon-notification__title">{title}</p> : null}
        {children ? <div className="cordon-notification__body">{children}</div> : null}
      </div>
      {action ? <div className="cordon-notification__action">{action}</div> : null}
      {onDismiss ? (
        <button type="button" className="cordon-notification__close" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}

/* ---- toast stack --------------------------------------------------------- */

export interface Toast extends Omit<NotificationProps, "onDismiss" | "className"> {
  id: string;
  /** Milliseconds before it removes itself. 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  notify: (toast: Omit<Toast, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

/**
 * Two contexts, not one, and the reason is a bug that reached a user.
 *
 * A screen that only raises toasts used to subscribe to the list of them as
 * well, so every toast re-rendered every caller. A caller whose effect
 * depended on an inline callback then got a new callback, re-ran the effect,
 * raised the toast again — and the console's funding failure notified in a
 * loop until the tab was closed.
 *
 * `notify` and `dismiss` never change identity. Only the stack that draws the
 * toasts reads the list.
 */
interface ToastActions {
  notify: (toast: Omit<Toast, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const ToastActionsContext = createContext<ToastActions | null>(null);
const ToastListContext = createContext<Toast[]>([]);

export function useToast(): ToastContextValue {
  const actions = useContext(ToastActionsContext);
  const toasts = useContext(ToastListContext);
  if (!actions) throw new Error("useToast must be used inside <ToastProvider>");
  /* The object is new each render, but its members are stable — an effect
     should depend on `notify`, never on the value this returns. */
  return { toasts, notify: actions.notify, dismiss: actions.dismiss };
}

/** Raise toasts without subscribing to them. Stable for the life of the
 *  provider, so it is safe in an effect's dependency list. */
export function useNotify(): ToastActions["notify"] {
  const actions = useContext(ToastActionsContext);
  if (!actions) throw new Error("useNotify must be used inside <ToastProvider>");
  return actions.notify;
}

export interface ToastProviderProps {
  children: ReactNode;
  placement?: "top-right" | "top-center" | "bottom-right" | "bottom-center";
}

export function ToastProvider({ children, placement = "bottom-right" }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const frames = useFrames();

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback<ToastContextValue["notify"]>(
    (toast) => {
      const id = toast.id ?? `cordon-toast-${Math.random().toString(36).slice(2, 9)}`;
      const duration = toast.duration ?? 5200;
      /* An id is a name, so raising the same one twice replaces the toast
         rather than stacking a second copy of it under a duplicate key. A
         caller that wants two toasts gives them two ids. */
      setToasts((list) => {
        const next = { ...toast, id };
        const at = list.findIndex((existing) => existing.id === id);
        if (at === -1) return [...list, next];
        const copy = [...list];
        copy[at] = next;
        return copy;
      });
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const actions = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastListContext.Provider value={toasts}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div className={cx("cordon-toasts", `cordon-toasts--${placement}`)} aria-live="polite">
              {/* Same reason as Modal's: the timer that dismisses a toast is a
                  `setTimeout` and runs in a hidden document, but the exit
                  animation that removes the node needs frames — so without
                  this a toast dismissed in a background tab stays for good. */}
              <AnimatePresence initial={false}>
                {toasts.map((toast) => (
                  <motion.div
                    key={toast.id}
                    layout={frames}
                    initial={frames ? { opacity: 0, y: 14, scale: 0.97 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={frames ? { opacity: 0, x: 24, scale: 0.97 } : { opacity: 0 }}
                    transition={frames ? transition.settle : { duration: 0 }}
                  >
                    <Notification
                      {...toast}
                      className="cordon-notification--toast"
                      onDismiss={() => dismiss(toast.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
      </ToastListContext.Provider>
    </ToastActionsContext.Provider>
  );
}
