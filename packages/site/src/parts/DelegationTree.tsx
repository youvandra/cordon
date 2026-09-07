import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMeasure, useCordonReducedMotion } from "cordon-ui";
import { MANDATE } from "@cordon/fixtures";

/* ==========================================================================
   The delegation tree, drawing.

   This is the product in one picture, so it is drawn rather than described.
   A leaf asks for a tranche; the request travels up the filament to the root;
   every ancestor's window is debited on the way. When the root's window cannot
   carry the draw, the draw is refused — at the root, not at the leaf that
   asked. That is the whole mechanism, and it is the part no amount of prose
   makes legible.

   `cordoned={false}` runs the same tree without ancestor debit: every node
   obeys its own limit, nobody computes the total, and the root drains past
   its own bound while every individual check passes.
   ========================================================================== */

interface Node {
  id: string;
  depth: number;
  /** Position within its depth, 0..1. */
  slot: number;
  parent: string | null;
}

/** Depth 3, matching MandateRegistry.maxDepth(). */
function buildTree(): Node[] {
  const nodes: Node[] = [{ id: "root", depth: 0, slot: 0.5, parent: null }];
  const mid = ["a", "b"];
  mid.forEach((id, index) => {
    nodes.push({ id, depth: 1, slot: (index + 0.5) / mid.length, parent: "root" });
  });
  const leaves = [
    ["a1", "a"], ["a2", "a"], ["b1", "b"], ["b2", "b"],
  ] as const;
  leaves.forEach(([id, parent], index) => {
    nodes.push({ id, depth: 2, slot: (index + 0.5) / leaves.length, parent });
  });
  return nodes;
}

const TREE = buildTree();
const LEAVES = TREE.filter((node) => node.depth === 2);

/** Ancestors of a node, nearest first, ending at the root. */
function ancestorsOf(id: string): string[] {
  const chain: string[] = [];
  let current = TREE.find((node) => node.id === id)?.parent ?? null;
  while (current) {
    chain.push(current);
    current = TREE.find((node) => node.id === current)?.parent ?? null;
  }
  return chain;
}

export interface DelegationTreeProps {
  /** Off = every node obeys its own limit and nobody computes the total. */
  cordoned?: boolean;
  height?: number;
  /** Seconds between draws. */
  interval?: number;
  onRefuse?: () => void;
  className?: string;
}

interface Draw {
  key: number;
  leaf: string;
  chain: string[];
  refused: boolean;
}

const TRANCHE_SHARE = Number(MANDATE.tranche6) / Number(MANDATE.budget6);

/** Where an uncordoned run has made its point and starts over. */
const OVERRUN_STOP = 1.3;

export function DelegationTree({
  cordoned = true,
  height = 300,
  interval = 1.5,
  onRefuse,
  className,
}: DelegationTreeProps) {
  /* The drawing is the argument, so it may not wait on a measurement that a
     hidden tab never delivers. See useMeasure. */
  const [ref, size] = useMeasure<HTMLDivElement>({ width: 520, height });
  const reduced = useCordonReducedMotion();

  /** Fraction of each node's own window already drawn. */
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [draw, setDraw] = useState<Draw | null>(null);
  const counter = useRef(0);

  const layout = useMemo(() => {
    if (!size.width) return null;
    const padX = 26;
    const padY = 30;
    const levels = 3;
    const usable = height - padY * 2;

    const at = (node: Node) => ({
      x: padX + node.slot * (size.width - padX * 2),
      y: padY + (node.depth / (levels - 1)) * usable,
    });

    const points = Object.fromEntries(TREE.map((node) => [node.id, at(node)]));

    const edges = TREE.filter((node) => node.parent).map((node) => {
      const from = points[node.parent!];
      const to = points[node.id];
      const mid = (from.y + to.y) / 2;
      return {
        id: node.id,
        parent: node.parent!,
        /* The map's grammar: leave vertically, bend once, arrive vertically. */
        d: `M${from.x} ${from.y}C${from.x} ${mid} ${to.x} ${mid} ${to.x} ${to.y}`,
      };
    });

    return { points, edges };
  }, [size.width, height]);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => {
      const leaf = LEAVES[Math.floor(Math.random() * LEAVES.length)].id;
      const chain = ancestorsOf(leaf);

      setSpent((previous) => {
        const rootSpent = previous.root ?? 0;
        /* Cordoned: the root's window is the bound, so the draw is refused
           when this tranche would carry it past 1. Uncordoned: nothing looks
           at the root at all, and every local check still passes. */
        const wouldBreach = rootSpent + TRANCHE_SHARE > 1;
        const refused = cordoned && wouldBreach;

        counter.current += 1;
        setDraw({ key: counter.current, leaf, chain, refused });
        if (refused) onRefuse?.();

        if (refused) return previous;

        const next = { ...previous };
        /* The debit every other layer skips: not just the node that asked. */
        for (const id of [leaf, ...chain]) {
          next[id] = Math.min(OVERRUN_STOP + 0.05, (next[id] ?? 0) + TRANCHE_SHARE);
        }
        return next;
      });
    }, interval * 1000);

    return () => window.clearInterval(timer);
  }, [cordoned, interval, reduced, onRefuse]);

  const rootSpent = spent.root ?? 0;
  /* Floating-point: twenty debits of 0.05 land on 1.0000000000000002, so a
     bare `> 0` reports a breach of 0% — a status line announcing that nothing
     has happened yet. A breach has to be worth a percentage point to be one. */
  const overRun = cordoned ? 0 : Math.max(0, rootSpent - 1);
  const breaching = overRun > 0.01;

  /* Both endings are terminal. A refused tree has nothing left to draw, and an
     uncordoned one has pinned every ring past its bound and will draw the same
     breached picture for as long as it is left running — which is what a hero
     figure gets. Hold the ending long enough to read, then start over. */
  const finished = Boolean(draw?.refused) || (!cordoned && rootSpent >= OVERRUN_STOP);

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => setSpent({}), 2200);
    return () => window.clearTimeout(timer);
  }, [finished]);

  return (
    <div className={`tree ${className ?? ""}`}>
      {/* The measured box is the drawing only. Letting the status line share a
          fixed height is what makes it collide with whatever sits below it. */}
      <div ref={ref} className="tree__canvas" style={{ height }}>
      {layout ? (
        <svg width={size.width} height={height} aria-hidden="true">
          {/* edges */}
          {layout.edges.map((edge) => {
            const live = draw && (draw.leaf === edge.id || draw.chain.includes(edge.id));
            return (
              <g key={edge.id}>
                <path d={edge.d} className="tree__edge" />
                {live && !reduced ? (
                  <motion.path
                    key={`${draw!.key}-${edge.id}`}
                    d={edge.d}
                    className={draw!.refused ? "tree__edge-refused" : "tree__edge-live"}
                    initial={{ pathLength: 0, opacity: 1 }}
                    animate={{ pathLength: 1, opacity: [1, 1, 0] }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  />
                ) : null}
              </g>
            );
          })}

          {/* nodes */}
          {TREE.map((node) => {
            const point = layout.points[node.id];
            const radius = node.depth === 0 ? 21 : node.depth === 1 ? 15 : 11;
            const used = Math.min(1, spent[node.id] ?? 0);
            const breached = (spent[node.id] ?? 0) > 1;
            const circumference = 2 * Math.PI * (radius + 5);
            const asking = draw?.leaf === node.id;
            const debiting = draw?.chain.includes(node.id);

            return (
              <g key={node.id} transform={`translate(${point.x} ${point.y})`}>
                {/* the window ring: what this node has left */}
                <circle r={radius + 5} className="tree__ring" />
                <circle
                  r={radius + 5}
                  className={breached ? "tree__ring-breached" : "tree__ring-used"}
                  strokeDasharray={`${circumference * used} ${circumference}`}
                  transform="rotate(-90)"
                />
                <motion.circle
                  r={radius}
                  className={`tree__node tree__node--d${node.depth}${
                    draw?.refused && node.depth === 0 ? " tree__node--refused" : ""
                  }`}
                  animate={
                    reduced
                      ? undefined
                      : asking || debiting
                        ? { scale: [1, 1.14, 1] }
                        : { scale: 1 }
                  }
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
                {node.depth === 0 ? (
                  <text className="tree__label" y="1" dy="0.32em">
                    root
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      </div>

      <div className="tree__status" data-state={draw?.refused ? "refused" : breaching ? "over" : "ok"}>
        {draw?.refused ? (
          <>Refused at the root — the tranche would breach the window the owner signed.</>
        ) : breaching ? (
          <>Root window exceeded by {Math.round(overRun * 100)}% — every local check passed.</>
        ) : cordoned ? (
          <>Every draw debits every ancestor.</>
        ) : (
          <>Each child obeys its own limit. Nobody computes the total.</>
        )}
      </div>
    </div>
  );
}
