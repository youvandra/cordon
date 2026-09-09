import { useEffect, useState } from "react";

/**
 * Whether this document is getting rendering steps at all.
 *
 * `requestAnimationFrame` does not run in a hidden document, and framer-motion
 * needs it for both halves of a transition. That makes an animation the thing
 * that decides whether an element is *present*, which is the failure this
 * project's working rules name: an entrance that never runs leaves content
 * invisible, and an exit that never runs leaves it on screen forever. A modal
 * that cannot close is the worse of the two.
 *
 * So components that mount and unmount with motion ask this first, and render
 * in their final state — no entrance, no exit, no `AnimatePresence` — whenever
 * frames are not coming. Nothing about the DOM depends on a frame loop.
 */
export function useFrames(): boolean {
  const [frames, setFrames] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  useEffect(() => {
    const read = () => setFrames(!document.hidden);
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  return frames;
}
