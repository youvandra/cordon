import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { Target, Transition } from "framer-motion";
import { useCordonReducedMotion } from "cordon-ui";

/* ==========================================================================
   Entrance motion that cannot hide the page.

   Framer drives animations on requestAnimationFrame, and rAF does not fire
   while a document is hidden. A tab opened in the background therefore never
   runs its entrance — every element stays at its `initial` value, which for a
   fade-in means opacity 0. The page is blank until it is focused, and if
   anything else stops the animation it is blank for good.

   So the rule here is: content is visible unless we know we can animate it.
     - hidden document, or reduced motion -> render the final state, no motion
     - otherwise animate, with a failsafe that reveals everything after 1.6s
       if the entrance has not completed
   ========================================================================== */

export function useEntrance(): boolean {
  const reduced = useCordonReducedMotion();
  const [allowed, setAllowed] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.visibilityState === "visible";
  });

  useEffect(() => {
    if (allowed || typeof document === "undefined") return;
    /* The tab was hidden at mount. If it is ever shown we still do not start a
       late entrance — the content is already on screen by then, and animating
       it out and back in would be worse than not animating at all. */
    const onVisible = () => setAllowed(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [allowed]);

  return allowed && !reduced;
}

/** Failsafe: after this, nothing on the page may still be invisible. */
export function useEntranceFailsafe(delay = 1600) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => document.documentElement.classList.add("entrance-done"),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [delay]);
}

export interface AppearProps {
  children: ReactNode;
  from?: Target;
  transition?: Transition;
  delay?: number;
  /** Waits until it is scrolled into view instead of animating on mount. */
  inView?: boolean;
  className?: string;
  as?: "div" | "span" | "p";
}

const SETTLE: Transition = { duration: 0.72, ease: [0.16, 1, 0.3, 1] };

export function Appear({
  children,
  from = { opacity: 0, y: 16 },
  transition = SETTLE,
  delay = 0,
  inView = false,
  className,
  as = "div",
}: AppearProps) {
  const animate = useEntrance();
  const Tag = as === "span" ? motion.span : as === "p" ? motion.p : motion.div;

  if (!animate) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  /* Animate back only the properties `from` actually set, so a caller that
     nudges y does not silently get its scale reset too. */
  const rest: Record<string, string | number> = {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    clipPath: "inset(-8% -2% -8% -2%)",
  };
  const target = Object.fromEntries(
    Object.keys(from).map((key) => [key, rest[key] ?? 1]),
  ) as Target;

  return (
    <Tag
      className={["appear", className].filter(Boolean).join(" ")}
      initial={from}
      {...(inView
        ? { whileInView: target, viewport: { once: true, margin: "-80px" } }
        : { animate: target })}
      transition={{ ...transition, delay }}
    >
      {children}
    </Tag>
  );
}
