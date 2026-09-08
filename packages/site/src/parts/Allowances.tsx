import { motion } from "framer-motion";
import { MANDATE, formatUsdc } from "@cordon/fixtures";
import { TREE } from "@cordon/fixtures/preview";
import { useEntrance } from "./motion";

/* ==========================================================================
   What was signed, and what was handed out.

   Two bars on one scale: the window the owner signed, and the two workers'
   own limits laid end to end against it. The second is longer, and the tail
   past the bound is hatched because nothing funds it.

   It ran without labels for a while, on the theory that proportions are the
   only honest claim a figure makes. They are, but a reader arriving cold read
   two pink rectangles and moved on: the drawing was carrying an argument that
   only made sense to someone who already knew it. So the lengths still do the
   arguing and four short labels say what is being measured. They are the
   figures the bars are drawn from, printed once each, not a caption restating
   the lede.

   Every width is computed from the mandate in `packages/fixtures` and the
   tick spacing is a round number of dollars, so the bound falls on a division
   rather than between two. Nothing here is drawn to look convincing.

   Only the fills move, and they move behind geometry that is already in
   place. A hidden tab runs no frames, so the figure is complete and readable
   whether the entrance happens or not.
   ========================================================================== */

const ROOT = MANDATE.budget6;
const WORKERS = TREE.children;
const PERMITTED = WORKERS.reduce((total, node) => total + node.budget6, 0n);
const OVER = PERMITTED - ROOT;

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
        `${formatUsdc(PERMITTED, 0)}, which is ${formatUsdc(OVER, 0)} more than the ` +
        `window they are drawn against. The excess is hatched because nobody funded it.`
      }
    >
      <div className="allow__stack">
        {/* The measure. Regular divisions give the two bars a common scale,
            and the bound sits on a division rather than between two because
            the budget is a whole multiple of the step. */}
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

        {/* ---- the window that was signed ---------------------------- */}
        <p className="allow__key" aria-hidden="true">
          <span>signed by the owner</span>
          <span className="allow__figure" style={{ left: `${BOUND * 100}%` }}>
            {formatUsdc(ROOT, 0)}
          </span>
        </p>
        <div className="allow__row">
          {/* Solid, because it is the one bar here that is money rather than
              permission. */}
          <div className="allow__signed" style={{ width: `${BOUND * 100}%` }}>
            <motion.span
              className="allow__fill allow__fill--signed"
              initial={animate ? { scaleX: 0.04 } : false}
              animate={animate ? { scaleX: 1 } : undefined}
              transition={{ duration: 0.72, ease: EASE, delay: 0.34 }}
            />
          </div>
        </div>

        {/* ---- what the two workers may draw ------------------------- */}
        <p className="allow__key" aria-hidden="true">
          <span>handed to two workers</span>
          <span className="allow__figure allow__figure--end">{formatUsdc(PERMITTED, 0)}</span>
        </p>
        <div className="allow__row">
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
              {/* Each worker's own limit, inside its own bar. Both are
                  under the window; that is the point, and a reader who
                  cannot see the two numbers cannot check it. */}
              <span className="allow__seg-value">{formatUsdc(worker.budget6, 0)}</span>
            </div>
          ))}

          {/* Drawn over the segments rather than beside them: it is not a
              third allowance, it is the tail of the second one. It has no
              right-hand edge, because nothing downstream is what stops it. */}
          <div className="allow__over" style={{ width: `${(1 - BOUND) * 100}%` }} />
        </div>

        {/* One line through the rail and both bars: everything right of it was
            handed out and never signed for. */}
        <div className="allow__bound" style={{ left: `${BOUND * 100}%` }} aria-hidden="true" />

        <p className="allow__over-key" style={{ width: `${(1 - BOUND) * 100}%` }} aria-hidden="true">
          {formatUsdc(OVER, 0)} nobody funded
        </p>
      </div>
    </div>
  );
}
