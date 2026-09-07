import type { Transition } from "framer-motion";

/* ==========================================================================
   Springs.

   Durations describe how long something takes. Springs describe how it feels
   to push it. Everything a viewer touches — hover, press, drag, reorder, a
   panel opening under the cursor — is spring-driven here, because a fixed
   0.18s ease is the single loudest tell that an interface was drawn rather
   than built. Durations stay for entrances, where there is nothing to react to.
   ========================================================================== */

export const spring = {
  /** Buttons, toggles, anything under a finger. Fast, no visible overshoot. */
  snap: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Panels, cards, layout shifts. A little carry at the end. */
  settle: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 },
  /** Large surfaces and sheets. Heavy, deliberate. */
  heavy: { type: "spring", stiffness: 190, damping: 30, mass: 1.4 },
  /** Cursor-following elements. Loose enough to lag the pointer visibly. */
  magnetic: { type: "spring", stiffness: 320, damping: 22, mass: 0.5 },
  /** Numbers counting. Slow enough to read the digits change. */
  count: { type: "spring", stiffness: 90, damping: 26, mass: 1 },
} satisfies Record<string, Transition>;

/** Density changes spacing and control height together, never one alone. */
export type Density = "compact" | "default" | "comfortable";
