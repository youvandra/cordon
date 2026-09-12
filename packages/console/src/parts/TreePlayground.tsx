import { useEffect, useState } from "react";
import { Button, Modal, Tag, Text } from "cordon-ui";
import { ARC, formatUsdc } from "@cordon/fixtures";
import { TreeGraph, type GraphNode } from "./TreeGraph";
import type { ChainNode } from "../lib/tree";

/* ==========================================================================
   The tree, with room to be looked at.

   The drawing was inline under the figures, 2,388 pixels of it inside a card
   684 wide. So the thing the whole product is about arrived as a strip you
   scrolled sideways through, three nodes at a time, and the only way to learn
   anything about a node was the table further down — which has five columns
   and a mandate has twelve fields.

   So it moves: a card that says what is in there and opens it, and a surface
   with the window to itself. Selecting a node is the point of the surface, and
   the panel beside it is every field the registry and the vault hold for that
   node, not the five that fit in a row.
   ========================================================================== */

/** One field of a mandate, as it is shown. */
function Row({
  label,
  value,
  enforced,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  /** The contract function that produces it, when there is one. */
  enforced?: string;
  mono?: boolean;
}) {
  return (
    <div className="detail__row">
      <dt className="detail__label">
        {label}
        {enforced ? <span className="detail__fn mono">{enforced}</span> : null}
      </dt>
      <dd className={mono ? "detail__value mono" : "detail__value"}>{value}</dd>
    </div>
  );
}

function short(id: string): string {
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

function Detail({ node, all }: { node: ChainNode; all: ChainNode[] }) {
  const parent = all.find((candidate) => candidate.node === node.parent);
  const bound = all.find(
    (candidate) => candidate.node.toLowerCase() === node.boundBy.toLowerCase(),
  );
  const children = all.filter((candidate) => candidate.parent === node.node);
  const heldElsewhere = bound && bound.node.toLowerCase() !== node.node.toLowerCase();

  /**
   * Why this node can draw no more than it can.
   *
   * `headroom` returns the tightest bound on the whole path and the node that
   * produced it, and for three of the four reasons that node is this one — its
   * own window, its own lifetime cap, or the treasury, which comes back as the
   * root. Only the panel has the fields to tell those apart, which is why the
   * card outside says the true thing it knows and this says which.
   */
  const windowLeft = node.budget6 - node.windowSpent6;
  const lifetimeLeft = node.lifetimeCap6 - node.lifetimeSpent6;
  const limit = node.revoked
    ? "cut"
    : heldElsewhere
      ? "ancestor"
      : node.available6 >= windowLeft
        ? "window"
        : lifetimeLeft <= node.available6
          ? "lifetime"
          : "treasury";

  /* A window figure is a share of that node's own budget. The available figure
     is not — it is the tightest bound on the whole path, which is why it can be
     smaller than this node's own remaining window and why saying so is the
     entire argument. */
  const share =
    node.budget6 > 0n ? Math.min(100, Number((node.windowSpent6 * 1000n) / node.budget6) / 10) : 0;

  return (
    <div className="detail">
      <header className="detail__head">
        <Text variant="micro" tone="dim" as="p" className="eyebrow">
          {node.parent === null ? "root mandate" : `depth ${node.depth}`}
        </Text>
        <p className="detail__id mono">{node.node}</p>
        <div className="detail__flags">
          {node.revoked ? <Tag tone="critical" size="sm">revoked</Tag> : null}
          {limit === "ancestor" ? <Tag tone="caution" size="sm">capped by an ancestor</Tag> : null}
          {limit === "lifetime" ? <Tag tone="caution" size="sm">lifetime cap spent</Tag> : null}
          {limit === "treasury" ? <Tag tone="caution" size="sm">capped by the vault balance</Tag> : null}
        </div>
      </header>

      <div className="detail__headline">
        <span className="detail__big num">{formatUsdc(node.available6)}</span>
        <span className="detail__note">
          {limit === "cut"
            ? "nothing: this branch was cut"
            : limit === "ancestor"
              ? `left to draw — the limit is ${short(bound!.node)}`
              : limit === "lifetime"
                ? "left to draw — the total this mandate was signed for is spent, and it does not come back"
                : limit === "treasury"
                  ? "left to draw — its own window allows more than the vault holds"
                  : "left to draw, and its own window is the limit"}
        </span>
      </div>

      <dl className="detail__list">
        <Row
          label="Window"
          enforced="TreeVault.windowSpent(node)"
          value={`${formatUsdc(node.windowSpent6)} of ${formatUsdc(node.budget6)} · ${share.toFixed(1)}%`}
        />
        <Row
          label="Lifetime"
          enforced="TreeVault.lifetimeSpent(node)"
          value={`${formatUsdc(node.lifetimeSpent6)} of ${formatUsdc(node.lifetimeCap6)}`}
        />
        <Row
          label="Headroom"
          enforced="TreeVault.headroom(node)"
          value={`${formatUsdc(node.available6)}, bound by ${short(node.boundBy)}`}
        />
        <Row label="Per draw" value={formatUsdc(node.trancheCap6)} />
        <Row
          label="Per seller"
          value={`${node.concentrationBps / 100}% of the window`}
        />
        <Row
          label="Window length"
          value={`${node.windowSeconds.toLocaleString()}s`}
          mono
        />
        <Row label="Operator" value={node.operator} />
        <Row label="Parent" value={parent ? short(parent.node) : "none — this is a root"} />
        <Row
          label="Children"
          value={
            children.length === 0
              ? "none yet"
              : children.map((child) => short(child.node)).join(", ")
          }
        />
        <Row label="Depth" value={`${node.depth} of ${node.maxDepth} allowed`} />
      </dl>

      <footer className="detail__foot">
        <a
          className="detail__link"
          href={`${ARC.explorer}/address/${node.operator}`}
          target="_blank"
          rel="noreferrer"
        >
          This node's operator on arcscan
        </a>
      </footer>
    </div>
  );
}

export function TreePlayground({ nodes }: { nodes: ChainNode[] }) {
  const [open, setOpen] = useState(false);
  const root = nodes.find((node) => node.parent === null);
  const [selected, setSelected] = useState<string | null>(root?.node ?? null);

  /* Opening on a node that is no longer in the tree shows an empty panel next
     to a drawing that has it. The root is always there. */
  useEffect(() => {
    if (selected && nodes.some((node) => node.node === selected)) return;
    setSelected(root?.node ?? null);
  }, [nodes, selected, root]);

  const chosen = nodes.find((node) => node.node === selected) ?? root;

  const graph: GraphNode[] = nodes.map((node) => ({
    id: node.node,
    label: `${node.node.slice(0, 8)}…${node.node.slice(-4)}`,
    parent: node.parent,
    spent6: node.windowSpent6,
    budget6: node.budget6,
    available6: node.available6,
    heldBy:
      node.boundBy.toLowerCase() === node.node.toLowerCase()
        ? null
        : `${node.boundBy.slice(0, 8)}…`,
    revoked: node.revoked,
  }));

  const cut = nodes.filter((node) => node.revoked).length;
  const deepest = nodes.reduce((most, node) => Math.max(most, node.depth), 0);

  return (
    <>
      <div className="playground__pitch">
        <Text variant="body" tone="copy" as="p">
          Every node from the root down, with the draw each one has made and the
          bound that would stop the next. Selecting one shows every field the
          registry and the vault hold for it — which is twelve, and the table
          below has room for five.
        </Text>
        <div className="playground__counts">
          <span>
            <strong className="num">{nodes.length}</strong> nodes
          </span>
          <span>
            <strong className="num">{deepest + 1}</strong>{" "}
            {deepest === 0 ? "level" : "levels"}
          </span>
          {cut > 0 ? (
            <span>
              <strong className="num">{cut}</strong> cut
            </span>
          ) : null}
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open the tree
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="The delegation tree"
        description="Every draw at any node debits that node and every ancestor above it, up to the root. Select a node to see what it is allowed and what it has spent."
        size="full"
      >
        <div className="playground">
          <div className="playground__canvas">
            <TreeGraph nodes={graph} onSelect={setSelected} selected={selected} />
          </div>
          <aside className="playground__aside">
            {chosen ? (
              <Detail node={chosen} all={nodes} />
            ) : (
              <Text variant="body" tone="dim" as="p">
                No node selected.
              </Text>
            )}
          </aside>
        </div>
      </Modal>
    </>
  );
}
