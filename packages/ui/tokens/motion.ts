import type { Transition, Variants } from "framer-motion";

/* ==========================================================================
   CORDON — motion
   The stage uses exactly two curves and one stagger. Everything a Cordon
   component does in motion is assembled from the constants below; nothing
   introduces a third easing, because a third easing is what makes a system
   read as "several people made this".
   ========================================================================== */

/** The entrance / settle curve. Overshoot-free, long tail. */
export const EASE_SETTLE = [0.16, 1, 0.3, 1] as const;
/** The supporting-copy curve. Slightly softer landing. */
export const EASE_SUPPORT = [0.22, 1, 0.36, 1] as const;
/** The only curve allowed to feel abrupt: things leaving. */
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

export const DUR = {
  control: 0.18,
  fast: 0.32,
  settle: 0.52,
  support: 0.54,
  reveal: 0.62,
  metric: 0.66,
  establish: 0.76,
  resolve: 0.82,
  headline: 0.84,
} as const;

/** Card 1 lands at .46s, card 2 at .58s, card 3 at .70s. */
export const STAGGER = 0.12;

/** Offsets a card's own children take from the card's landing. */
export const CHILD_OFFSET = {
  title: 0.14,
  figure: 0.3,
  metric: 0.48,
  caption: 0.64,
  control: 0.8,
} as const;

export const transition = {
  control: { duration: DUR.control, ease: EASE_SETTLE },
  settle: { duration: DUR.settle, ease: EASE_SETTLE },
  support: { duration: DUR.support, ease: EASE_SUPPORT },
  reveal: { duration: DUR.reveal, ease: EASE_SUPPORT },
  establish: { duration: DUR.establish, ease: EASE_SETTLE },
  resolve: { duration: DUR.resolve, ease: EASE_SETTLE },
  exit: { duration: DUR.fast, ease: EASE_EXIT },
} satisfies Record<string, Transition>;

/* ---- shared variant sets ------------------------------------------------ */

/** Headline behaviour: rises and un-clips, as the masthead does. */
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: "0.52em", clipPath: "inset(0 0 56% 0)" },
  visible: {
    opacity: 1,
    y: 0,
    clipPath: "inset(-8% -2% -8% -2%)",
    transition: { duration: DUR.headline, ease: EASE_SETTLE },
  },
};

/** Supporting copy: a short rise, nothing else. */
export const supportVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.support },
};

/** A tile arriving. Never fades from zero — a tile is already there, dimly. */
export const establishVariants: Variants = {
  hidden: { opacity: 0.52, y: 10, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transition.establish },
};

/** A figure inside a tile resolving into focus. */
export const resolveVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.972, filter: "blur(2px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: transition.resolve,
  },
};

/** A number landing. */
export const metricVariants: Variants = {
  hidden: { opacity: 0, y: 7, scale: 0.985, filter: "blur(2.5px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: DUR.metric, ease: EASE_SETTLE },
  },
};

/** A control settling last. */
export const controlVariants: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.975 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transition.settle },
};

/** Overlays: modal, popover, dropdown, tooltip. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transition.settle },
  exit: { opacity: 0, y: 4, scale: 0.98, transition: transition.exit },
};

export const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DUR.fast, ease: EASE_SETTLE } },
  exit: { opacity: 0, transition: transition.exit },
};

/** Height-collapsing disclosure (accordion, details). */
export const collapseVariants: Variants = {
  hidden: { height: 0, opacity: 0, transition: transition.exit },
  visible: {
    height: "auto",
    opacity: 1,
    transition: { duration: DUR.settle, ease: EASE_SETTLE },
  },
};

/** A list that lands one item at a time. */
export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER * 0.5, delayChildren: 0.06 } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.support },
};

/** Hover / press behaviour shared by every pressable Cordon surface. */
export const pressable = {
  whileHover: { y: -2 },
  whileTap: { y: 0, scale: 0.985 },
  transition: transition.control,
} as const;

/** Delay for the nth tile in a row, matching the stage exactly. */
export const tileDelay = (index: number, base = 0.46): number =>
  base + index * STAGGER;
