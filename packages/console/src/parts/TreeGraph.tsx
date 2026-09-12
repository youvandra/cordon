import { Fragment, useEffect, useRef } from "react";
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
const NODE_H = 116;
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
  const scroller = useRef<HTMLDivElement | null>(null);

  /* Bring the selected node into the scroller.
   *
   * A real tree is several times wider than any box it is in, so whatever is
   * selected is usually off to one side — on opening, that is the root, and a
   * drawing of a tree that opens somewhere in the middle of it reads as
   * broken. Convenience only: nothing here decides whether a node is drawn,
   * and a scroller nobody scrolled still holds every node. */
  useEffect(() => {
    const box = scroller.current;
    if (!box || !selected) return;
    const node = at.get(selected);
    if (!node) return;
    const middle = node.x + NODE_W / 2 - box.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, middle), behavior: "auto" });
    /* `at` is rebuilt every render; the selection and the shape are what
       should move this. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, width, height]);

  return (
    <div className="graph" role="group" aria-label="The mandate tree" ref={scroller}>
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
          const pct = (value: bigint) =>
            node.budget6 > 0n ? Math.min(100, Number((value * 1000n) / node.budget6) / 10) : 0;
          const spent = pct(node.spent6);
          /* Where this node's own window stops being spendable. Below 100 it
             is an ancestor that stops it, and the gap between this mark and
             the end of the bar is authority the node holds on paper and cannot
             use — which is the one thing no per-agent wallet can draw. */
          const ceiling = pct(node.spent6 + node.available6);
          /* Short of its own window, whatever the reason. The tick is drawn
             for both reasons because both are true and both are the contract's,
             but the words under it are not interchangeable. An ancestor can be
             named here because `headroom` returns it. The other three reasons
             a node is short of its own window — its lifetime cap, its own
             window, the treasury — all come back as the node itself, and this
             card does not carry the fields to tell them apart. So it says the
             true thing it knows and the panel, which has every field, names
             which. Saying "capped by an ancestor" on a root was the first
             thing this drawing got wrong, and "the vault holds no more" over a
             spent lifetime cap was the second. */
          const short = ceiling < 99.5 && !node.revoked;
          const held = short && Boolean(node.heldBy);

          return (
            <Fragment key={node.id}>
              <button
                type="button"
                className="graph__node"
                data-revoked={node.revoked ? "" : undefined}
                data-root={node.parent === null ? "" : undefined}
                data-bound={held ? "" : undefined}
                data-short={short ? "" : undefined}
                data-depth={Math.min(node.depth, 3)}
                data-selected={selected === node.id ? "" : undefined}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                onClick={onSelect ? () => onSelect(node.id) : undefined}
              >
                <span className="graph__rail" aria-hidden="true" />

                <span className="graph__head">
                  <span className="graph__label mono">{node.label}</span>
                  <span className="graph__role">
                    {node.parent === null ? "root" : `depth ${node.depth}`}
                  </span>
                </span>

                {/* The headline is what this node may actually draw, because
                    that is the figure an owner is looking for. Its own window
                    is the bar underneath, and the tick on the bar is where an
                    ancestor cuts the window short. */}
                <span className="graph__foot">
                  <span className="graph__draw num">{formatUsdc(node.available6)}</span>
                  <span className="graph__note">
                    {node.revoked
                      ? "cut"
                      : held
                        ? `left · capped by ${node.heldBy}`
                        : short
                          ? "left · less than this window allows"
                          : "left to draw"}
                  </span>
                </span>

                <span className="graph__meter">
                  <span className="graph__bar" aria-hidden="true">
                    <span
                      className="graph__fill"
                      style={{ width: `${spent}%` }}
                      data-hot={spent >= 95 ? "" : undefined}
                    />
                    {short ? (
                      <span className="graph__ceiling" style={{ left: `${ceiling}%` }} />
                    ) : null}
                  </span>
                  <span className="graph__spent mono">
                    {formatUsdc(node.spent6)} <span className="graph__of">of</span>{" "}
                    {formatUsdc(node.budget6)}
                  </span>
                </span>

                {node.revoked || node.refusals ? (
                  <span className="graph__flags">
                    {node.revoked ? (
                      <Tag tone="critical" size="sm">
                        revoked
                      </Tag>
                    ) : null}
                    {!node.revoked && node.refusals ? (
                      <span className="graph__refusals mono">{node.refusals} refused</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
