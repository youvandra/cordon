import { Fragment } from "react";
import { Tag } from "cordon-ui";
import { formatUsdc } from "@cordon/fixtures";

/* ==========================================================================
   The tree as a tree.

   A disclosure list can show that one node is inside another; it cannot show
   that a grandchild's draw lands on a grandparent's bar, which is the whole
   claim. So the nodes are laid out and the descent is drawn.

   Geometry is computed from the data and never measured: every node is one
   fixed size, so there is no ResizeObserver and no frame loop between the data
   and the picture. It draws correctly in a hidden tab, in a print, and on the
   first frame — the same rule the rest of this project follows for figures.

   Leaves are placed left to right in order; a parent sits at the midpoint of
   its own children. That is the whole layout, and it is enough for a tree that
   is bounded at depth three.
   ========================================================================== */

export interface GraphNode {
  id: string;
  label: string;
  parent: string | null;
  /** Its own window: how much of it is gone. */
  spent6: bigint;
  budget6: bigint;
  /** What it may actually draw now — often held by an ancestor. */
  available6: bigint;
  /** Set when something above it is the reason, and worth naming. */
  heldBy?: string | null;
  revoked?: boolean;
  refusals?: number;
}

/* Wide enough for the names people actually give agents. At 208 every label
   in the demo tree truncated, and a truncated name is a node you cannot tell
   from its sibling. */
const NODE_W = 240;
const NODE_H = 92;
const GAP_X = 28;
const GAP_Y = 56;

interface Placed extends GraphNode {
  x: number;
  y: number;
  depth: number;
}

function layout(nodes: GraphNode[]): { placed: Placed[]; width: number; height: number } {
  const childrenOf = new Map<string | null, GraphNode[]>();
  for (const node of nodes) {
    const list = childrenOf.get(node.parent) ?? [];
    list.push(node);
    childrenOf.set(node.parent, list);
  }

  const placed: Placed[] = [];
  let cursor = 0;

  /* Depth-first, so leaves take the next free column and a parent lands over
     the span its own subtree occupies. */
  const walk = (node: GraphNode, depth: number): number => {
    const children = childrenOf.get(node.id) ?? [];
    let centre: number;

    if (children.length === 0) {
      centre = cursor * (NODE_W + GAP_X);
      cursor += 1;
    } else {
      const spans = children.map((child) => walk(child, depth + 1));
      centre = (spans[0]! + spans[spans.length - 1]!) / 2;
    }

    placed.push({ ...node, x: centre, y: depth * (NODE_H + GAP_Y), depth });
    return centre;
  };

  for (const root of childrenOf.get(null) ?? []) walk(root, 0);

  const width = Math.max(...placed.map((node) => node.x), 0) + NODE_W;
  const height = Math.max(...placed.map((node) => node.y), 0) + NODE_H;
  return { placed, width, height };
}

/** A descent, drawn as one curve rather than an elbow: an elbow reads as a
 *  pipe and a pipe suggests flow, and nothing flows down these edges. */
function edge(from: Placed, to: Placed): string {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const mid = y1 + (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
}

export function TreeGraph({
  nodes,
  onSelect,
  selected,
}: {
  nodes: GraphNode[];
  onSelect?: (id: string) => void;
  selected?: string | null;
}) {
  const { placed, width, height } = layout(nodes);
  const at = new Map(placed.map((node) => [node.id, node]));

  return (
    <div className="graph" role="group" aria-label="The mandate tree">
      <div className="graph__canvas" style={{ width, height }}>
        <svg className="graph__edges" width={width} height={height} aria-hidden="true">
          {placed.map((node) => {
            const parent = node.parent ? at.get(node.parent) : undefined;
            if (!parent) return null;
            return (
              <path
                key={`${parent.id}-${node.id}`}
                d={edge(parent, node)}
                className={node.revoked ? "graph__edge graph__edge--cut" : "graph__edge"}
              />
            );
          })}
        </svg>

        {placed.map((node) => {
          const share =
            node.budget6 > 0n ? Number((node.spent6 * 100n) / node.budget6) : 0;
          return (
            <Fragment key={node.id}>
              <button
                type="button"
                className="graph__node"
                data-revoked={node.revoked ? "" : undefined}
                data-selected={selected === node.id ? "" : undefined}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                onClick={onSelect ? () => onSelect(node.id) : undefined}
              >
                <span className="graph__head">
                  <span className="graph__label">{node.label}</span>
                  {node.revoked ? (
                    <Tag tone="critical" size="sm">
                      revoked
                    </Tag>
                  ) : node.refusals ? (
                    <span className="graph__refusals mono">{node.refusals} refused</span>
                  ) : null}
                </span>

                {/* The bar is this node's own window. The figure under it is
                    what it may actually draw, which is a different number
                    whenever something above it is tighter — and that gap is
                    the argument the whole screen exists to make. */}
                <span className="graph__bar" aria-hidden="true">
                  <span
                    className="graph__fill"
                    style={{ width: `${Math.min(100, share)}%` }}
                    data-hot={share >= 95 ? "" : undefined}
                  />
                </span>

                <span className="graph__foot">
                  <span className="graph__draw num">{formatUsdc(node.available6)}</span>
                  <span className="graph__note">
                    {node.heldBy ? `held by ${node.heldBy}` : "can still draw"}
                  </span>
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
