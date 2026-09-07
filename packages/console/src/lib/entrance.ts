import { useEffect, useState } from "react";

/**
 * Whether an entrance animation may run at all.
 *
 * `MetricCard` and `Headline` animate by default, from `opacity: 0`, on
 * framer-motion — which drives on requestAnimationFrame, and rAF does not fire
 * while a document is hidden. A console opened in a background tab therefore
 * never runs the entrance, every animated element stays at its initial value,
 * and the page is blank until it is focused. If anything else stops the frame
 * loop it is blank for good.
 *
 * So the rule from the root CLAUDE.md holds here: content is visible unless we
 * know we can animate it. A tab that was hidden at mount renders the final
 * state and never animates — starting a late entrance once it is shown would
 * fade out content the reader is already looking at, which is worse than no
 * animation at all.
 */
export function useEntrance(): boolean {
  const [allowed] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible",
  );
  return allowed;
}

/** Belt and braces: after this, nothing may still be mid-entrance. */
export function useEntranceFailsafe(delay = 1600) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => document.documentElement.classList.add("entrance-done"),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [delay]);
}
