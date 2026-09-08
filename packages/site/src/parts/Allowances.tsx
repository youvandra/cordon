import { motion } from "framer-motion";
import { MANDATE, formatUsdc } from "@cordon/fixtures";
import { TREE } from "@cordon/fixtures/preview";
import { useEntrance } from "./motion";

/* ==========================================================================
   What was signed, and what was handed out.

   The hero used to draw the delegation tree. The counterfactual draws the same
   tree twice, two screens down, where the reader has finally been given a
   reason to read it; running it three times on one page spends the hero on a
   picture that only pays off later.

   So the hero shows the arithmetic instead, on one scale and in two rows. The
   top row is the window the owner signed. The bottom row is what the two
   workers may draw between them, and the part of it past the signed line is
   hatched, because it is not money the tree has — it is permission nobody
   funded.

   Nothing here is a forecast or a simulation. The budgets are the ones in the
   mandate, the sum is their sum, and the overrun is the difference.

   Only the fills animate, and they animate behind labels that are already in
   place. A hidden tab runs no frames, so every figure on this drawing is
   readable whether the motion happens or not.
   ========================================================================== */

const ROOT = MANDATE.budget6;
const WORKERS = TREE.children;
const PERMITTED = WORKERS.reduce((total, node) => total + node.budget6, 0n);
const OVER = PERMITTED - ROOT;

/** Where the root's window ends, as a share of what the children may draw. */
const BOUND = Number(ROOT) / Number(PERMITTED);

const EASE = [0.16, 1, 0.3, 1] as const;

export function Allowances({ className }: { className?: string }) {
  const animate = useEntrance();

  return (
    <div className={`allow ${className ?? ""}`}>
      <div className="allow__stack">
        <div className="allow__row">
          <div className="allow__signed" style={{ width: `${BOUND * 100}%` }}>
            <motion.span
              className="allow__fill allow__fill--signed"
              initial={animate ? { scaleX: 0.04 } : false}
              animate={animate ? { scaleX: 1 } : undefined}
              transition={{ duration: 0.72, ease: EASE, delay: 0.34 }}
            />
            <span className="allow__signed-name">the window the owner signed</span>
            <span className="allow__signed-figure mono">{formatUsdc(ROOT, 0)}</span>
          </div>
        </div>

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
              <span className="allow__seg-name">{worker.label}</span>
              <span className="allow__seg-figure mono">{formatUsdc(worker.budget6, 0)}</span>
              <span className="allow__seg-note">inside its own limit</span>
            </div>
          ))}

          {/* Drawn over the segments rather than beside them: it is not a
              third allowance, it is the tail of the second one. */}
          <div className="allow__over" style={{ width: `${(1 - BOUND) * 100}%` }}>
            <span className="allow__over-figure mono">{formatUsdc(OVER, 0)}</span>
            <span className="allow__over-note">nobody funded</span>
          </div>
        </div>

        {/* One line across both rows. It is the whole comparison: everything
            to the right of it was handed out and never signed for. */}
        <div className="allow__bound" style={{ left: `${BOUND * 100}%` }} aria-hidden="true" />
      </div>

      <p className="allow__note">
        Neither worker has passed the limit its owner set, and the contract that
        set them agreed to both. Nothing in the path adds them up.
      </p>
    </div>
  );
}
