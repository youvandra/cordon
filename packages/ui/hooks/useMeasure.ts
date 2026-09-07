import { useCallback, useEffect, useRef, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Real pixel dimensions of an element, kept current by ResizeObserver.
 *
 * Charts need this. Drawing into a fixed viewBox and stretching it with
 * `preserveAspectRatio="none"` is the shortcut, and it silently ruins every
 * round thing in the drawing: dots become ellipses, stroke joins skew, corner
 * radii turn oval. Measure, then draw in the space you actually have.
 *
 * Two rules keep a measurement from becoming a way to hide the drawing:
 *
 *   1. **A zero is never a measurement.** An element inside a collapsed
 *      ancestor, or measured before its stylesheet has applied, reports 0.
 *      Callers gate their geometry on width, so writing that 0 into state
 *      blanks a chart that was drawing a moment ago. We keep the last real
 *      number instead, and fall back to `fallback` until a real one arrives.
 *   2. **Delivery cannot depend on a frame loop.** ResizeObserver, like
 *      requestAnimationFrame, only delivers during a rendering step, and a
 *      hidden document runs none. A tab opened in the background therefore
 *      never receives the entry that would give it a width — so an element
 *      that grew after mount stays at its mount size for as long as the tab
 *      stays hidden, which for a late stylesheet means zero, which means the
 *      drawing never appears at all. We re-measure on `visibilitychange` and
 *      on `load`, and retry on timers, which run while hidden.
 *
 * `fallback` is what callers draw into before the first real measurement. It
 * is painted only when measuring genuinely could not happen — the ref callback
 * measures during commit, before the browser paints — so a sensible width here
 * costs nothing in the normal case and is the difference between a drawing and
 * an empty box in the abnormal one.
 */
export function useMeasure<T extends HTMLElement | SVGElement>(
  fallback: Size = { width: 0, height: 0 },
): [(node: T | null) => void, Size] {
  const [size, setSize] = useState<Size>(fallback);
  const node = useRef<T | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  /* Zero is the absence of a measurement, not a measurement of zero — and it
     is absent per axis. An element in a collapsed viewport reports a real
     height beside a zero width, so accepting the pair wholesale is what
     overwrites a usable fallback width with nothing. */
  const commit = useCallback((box: Size) => {
    setSize((previous) => {
      const width = box.width > 0 ? box.width : previous.width;
      const height = box.height > 0 ? box.height : previous.height;
      return width === previous.width && height === previous.height
        ? previous
        : { width, height };
    });
  }, []);

  const remeasure = useCallback(() => {
    const element = node.current;
    if (!element) return 0;
    const box = element.getBoundingClientRect();
    commit({ width: box.width, height: box.height });
    return box.width;
  }, [commit]);

  const ref = useCallback(
    (next: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      node.current = next;
      if (!next) return;

      if (typeof ResizeObserver !== "undefined") {
        observer.current = new ResizeObserver(([entry]) => {
          const box = entry.contentRect;
          commit({ width: box.width, height: box.height });
        });
        observer.current.observe(next);
      }
      remeasure();
    },
    [commit, remeasure],
  );

  /* Everything below exists for the case where the first measurement was not
     possible: a hidden tab, or a stylesheet that had not applied yet. Timers
     fire while a document is hidden; rendering-step callbacks do not. */
  useEffect(() => {
    if (remeasure() > 0) return;

    const timers = [0, 60, 250, 1000].map((delay) =>
      window.setTimeout(remeasure, delay),
    );
    const onVisible = () => remeasure();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("load", onVisible);

    return () => {
      timers.forEach(window.clearTimeout);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("load", onVisible);
    };
  }, [remeasure]);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, size];
}
