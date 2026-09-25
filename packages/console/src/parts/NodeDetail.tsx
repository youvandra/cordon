import type { ReactNode } from "react";
import { Tag } from "cordon-ui";
import { ENFORCED_BY, formatUsdc } from "@cordon/fixtures";
import { explorerFor } from "../lib/chain";
import type { ChainNode } from "../lib/tree";
import { share, shortId, windowLabel } from "../lib/format";
import { usePurpose } from "../lib/purpose";

function Row({ label, value, fn }: { label: string; value: ReactNode; fn?: string }) {
  return (
    <div className="detail__row">
      <dt className="detail__label">
        {label}
        {fn ? <span className="detail__fn mono">{fn}</span> : null}
      </dt>
      <dd className="detail__value">{value}</dd>
    </div>
  );
}

/**
 * Every field the registry and the vault hold for one node, and why it can
 * draw no more than it can.
 *
 * `headroom` returns the tightest bound on the whole path and the node that
 * produced it. For three of the four reasons that node is this one — its own
 * window, its lifetime cap, or the treasury — so only a panel holding every
 * field can say which.
 */
export function NodeDetail({ node, all, cut }: { node: ChainNode; all: ChainNode[]; cut: boolean }) {
  const parent = all.find((candidate) => candidate.node === node.parent);
  const children = all.filter((candidate) => candidate.parent === node.node);
  const heldElsewhere = node.boundBy.toLowerCase() !== node.node.toLowerCase();
  const windowLeft = node.budget6 - node.windowSpent6;
  const lifetimeLeft = node.lifetimeCap6 - node.lifetimeSpent6;
  const purpose = usePurpose(node.node);

  const limit = cut
    ? "cut"
    : heldElsewhere
      ? "ancestor"
      : node.available6 >= windowLeft
        ? "window"
        : lifetimeLeft <= node.available6
          ? "lifetime"
          : "treasury";

  const reason = {
    cut: "Nothing — this branch was revoked.",
    ancestor: `Left to draw. The limit is an ancestor, ${shortId(node.boundBy)}.`,
    lifetime: "Left to draw. The total this mandate was signed for is spent.",
    treasury: "Left to draw. Its window allows more than the vault holds.",
    window: "Left to draw. Its own window is the limit.",
  }[limit];

  return (
    <div className="detail">
      <div className="detail__summary">
        <div className="detail__flags">
          <Tag size="sm">{node.parent === null ? "Root" : `Depth ${node.depth}`}</Tag>
          {cut ? <Tag tone="critical" size="sm" dot>Revoked</Tag> : null}
          {limit === "ancestor" ? <Tag tone="rose" size="sm" dot>Held by ancestor</Tag> : null}
        </div>
        <p className="detail__big num">{formatUsdc(node.available6)}</p>
        <p className="detail__note">{reason}</p>
      </div>

      <dl className="detail__list">
        <Row
          label="Purpose"
          value={
            purpose.state === "read" ? (
              <span className="cell-stack">
                <span>{purpose.text}</span>
                {/* Not "stated at spawn": the same call writes it afterwards,
                    and every purpose on this tree was written that way — the
                    nodes predate the field. What is true of all of them is who
                    signed it, which is the operator and nobody else. */}
                <span className="small muted">
                  Stated by its operator on identity #{purpose.agentId.toString()}. A description, not a bound.
                </span>
              </span>
            ) : (
              <span className="muted">
                {purpose.state === "looking" ? "Reading…" : purpose.state === "failed" ? "Could not read its identity" : "None stated"}
              </span>
            )
          }
        />
        <Row
          label="This window"
          fn={ENFORCED_BY.budget}
          value={`${formatUsdc(node.windowSpent6)} of ${formatUsdc(node.budget6)} · ${share(node.windowSpent6, node.budget6)}%`}
        />
        <Row
          label="Lifetime"
          fn={ENFORCED_BY.lifetime}
          value={`${formatUsdc(node.delivered6)} of ${formatUsdc(node.lifetimeCap6)}`}
        />
        <Row label="Per purchase" value={formatUsdc(node.trancheCap6)} />
        <Row label="Per seller" value={`${node.concentrationBps / 100}% of a window`} />
        <Row label="Window length" value={windowLabel(node.windowSeconds)} />
        <Row label="Depth" value={`${node.depth} of ${node.maxDepth}`} />
        <Row
          label="Operator"
          value={
            <a className="mono breakable" href={explorerFor.address(node.operator)} target="_blank" rel="noreferrer">
              {node.operator}
            </a>
          }
        />
        <Row label="Parent" value={parent ? <span className="mono">{shortId(parent.node)}</span> : "None — root"} />
        <Row
          label="Children"
          value={
            children.length === 0 ? "None" : <span className="mono">{children.map((child) => shortId(child.node)).join(", ")}</span>
          }
        />
        <Row label="Node id" value={<span className="mono breakable">{node.node}</span>} />
      </dl>
    </div>
  );
}
