import { motion } from "framer-motion";
import { MANDATE, formatUsdc } from "@cordon/fixtures";
import { TREE } from "@cordon/fixtures/preview";
import { useEntrance } from "./motion";

/* ==========================================================================
   What was signed, and what was handed out. No words on it.

   The hero figure carries no labels and no figures. Everything it says, it
   says with length: the top band is the window the owner signed, the bottom
   band is what the two workers may draw between them, both are drawn on one
   scale, and the bottom one is longer. That is the entire argument, and it
   needs no sentence next to it — the lede beside the drawing is where the
   words live.

   It is still data. Every width here is computed from the mandate in
   `packages/fixtures`, the tick spacing is a round number of dollars rather
   than a decorative interval, and the bound falls exactly on a tick because
   the root's budget is a whole multiple of that step. Nothing is drawn to
   look convincing: strip the labels off a figure and the proportions are the
   only claim left, so they had better be the real ones.

   Because there is no visible text, the drawing carries a description for
   anyone who cannot see it. That is not a caption — it never renders — it is
   the alternative to a picture that says nothing to a screen reader.

   Only the fills move, and they move behind geometry that is already in
   place. A hidden tab runs no frames, so the figure is complete and readable
   whether the entrance happens or not.
   ========================================================================== */

const ROOT = MANDATE.budget6;
const WORKERS = TREE.children;
const PERMITTED = WORKERS.reduce((total, node) => total + node.budget6, 0n);

/** Where the root's window ends, as a share of what the children may draw. */
const BOUND = Number(ROOT) / Number(PERMITTED);

/**
 * A round step, so the rail measures in dollars rather than in twelfths of a
 * container. Chosen from the same set a hand-drawn axis would use, and picked
 * so the rail carries somewhere between eight and twenty divisions at any
 * budget rather than only at this one.
 */
function tickStep6(span6: bigint): bigint {
  const dollars = Number(span6) / 1e6;
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000]) {
    if (dollars / step <= 20) return BigInt(Math.round(step * 1e6));
  }
  return span6 / 10n;
}

const STEP = tickStep6(PERMITTED);
const TICKS = Array.from({ length: Number(PERMITTED / STEP) }, (_, i) => (i + 1) / Number(PERMITTED / STEP));

const EASE = [0.16, 1, 0.3, 1] as const;

export function Allowances({ className }: { className?: string }) {
  const animate = useEntrance();

  return (
    <div
      className={`allow ${className ?? ""}`}
      role="img"
      aria-label={
        `The window the owner signed is ${formatUsdc(ROOT, 0)}. Beneath it, on the same scale, ` +
        `the ${WORKERS.length} workers' own limits: ` +
        `${WORKERS.map((w) => formatUsdc(w.budget6, 0)).join(" and ")}. ` +
        `Each is inside the limit its owner set, and together they permit ` +
        `${formatUsdc(PERMITTED, 0)} — ${formatUsdc(PERMITTED - ROOT, 0)} more than the ` +
        `window they are drawn against. The excess is hatched because nobody funded it.`
      }
    >
      <div className="allow__stack">
        {/* The measure. Regular divisions give the two bands a common scale
            without stating one, and the bound sits on a division rather than
            between two, because the budget is a whole multiple of the step. */}
        <div className="allow__rail" aria-hidden="true">
          {TICKS.map((at) => (
            <span
              key={at}
              className="allow__tick"
              data-bound={Math.abs(at - BOUND) < 1e-9 ? "" : undefined}
              style={{ left: `${at * 100}%` }}
            />
          ))}
        </div>

        {/* The signed window. Solid, because it is the one band on this
            drawing that is money rather than permission. */}
        <div className="allow__row">
          <div className="allow__signed" style={{ width: `${BOUND * 100}%` }}>
            <motion.span
              className="allow__fill allow__fill--signed"
              initial={animate ? { scaleX: 0.04 } : false}
              animate={animate ? { scaleX: 1 } : undefined}
              transition={{ duration: 0.72, ease: EASE, delay: 0.34 }}
            />
          </div>
        </div>

        {/* What was handed out. Outlined rather than solid, and divided, so
            the two limits read as two decisions that were each allowed. */}
        <div className="allow__row allow__row--tall">
          {WORKERS.map((worker, index) => (
            <div
              key={worker.id}
              className="allow__seg"
              style={{ width: `${(Number(worker.budget6) / Number(PERMITTED)) * 100}%` }}
            >
              <motion.span
                className="allow__fill"
                initial={animate ? { scaleX: 0.04 } : false}
                animate={animate ? { scaleX: 1 } : undefined}
                transition={{ duration: 0.78, ease: EASE, delay: 0.58 + index * 0.14 }}
              />
            </div>
          ))}

          {/* Drawn over the segments rather than beside them: it is not a
              third allowance, it is the tail of the second one. It has no
              right-hand edge, because the drawing's point is that nothing
              downstream stops it. */}
          <div className="allow__over" style={{ width: `${(1 - BOUND) * 100}%` }} />
        </div>

        {/* One line through the rail and both bands. It is the whole
            comparison: everything right of it was handed out and never
            signed for. */}
        <div className="allow__bound" style={{ left: `${BOUND * 100}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}
