import { useEffect } from "react";
import type { RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Holds focus inside `ref` while `active`, restores it on close, and locks
 * body scroll. Every Cordon overlay uses this rather than rolling its own,
 * because a half-implemented trap is worse than none.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onEscape?: () => void) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFirst = () => {
      const targets = node?.querySelectorAll<HTMLElement>(FOCUSABLE);
      (targets && targets.length ? targets[0] : node)?.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape?.();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const targets = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (!targets.length) return;
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [ref, active, onEscape]);
}
