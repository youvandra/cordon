import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, Skeleton, Tag } from "cordon-ui";
import { ENFORCED_BY, formatUsdc } from "@cordon/fixtures";
import { useTitle } from "../parts/Shell";
import { Meter, PageHeader, PageSkeleton, Panel, ReadFailed } from "../parts/Page";
import { FundDialog, SpawnDialog, WithdrawDialog } from "../parts/OwnerDialogs";
import { useConsoleTree } from "../lib/useConsoleTree";
import { useChainRefusals } from "../lib/refusals";
import { cutLookup, isHeld, share, shortId, windowLabel } from "../lib/format";
import type { ChainNode } from "../lib/tree";

function Kpi({
  label,
  value,
  of,
  pct,
  foot,
  fn,
}: {
  label: string;
  value: string;
  of?: string;
  pct?: number;
  foot: string;
  fn?: string;
}) {
  return (
    <div className="panel kpi">
      <p className="kpi__label">{label}</p>
      <p className="kpi__value num">
        {value}
        {of ? <span className="kpi__of"> {of}</span> : null}
      </p>
      {pct === undefined ? <span className="kpi__spacer" /> : <Meter value={pct} />}
      <p className="kpi__foot">{foot}</p>
      {fn ? <p className="kpi__fn mono">{fn}</p> : null}
    </div>
  );
}

export default function Overview() {
  useTitle("Overview · Cordon console");
  const { ready, mine, owner, chain, nodes, root } = useConsoleTree();
  const refusals = useChainRefusals(
    nodes.map((node) => node.node),
    root?.node ?? null,
  );
  const [asking, setAsking] = useState<"fund" | "spawn" | "withdraw" | null>(null);

  if (!ready || chain.state === "looking") return <PageSkeleton />;
  if (chain.state === "unconfigured") return <ReadFailed title="No deployment configured" why="This build has no contract addresses to read." />;
  if (chain.state === "failed") return <ReadFailed why={chain.why} />;

  if (chain.state === "none" || !root) {
    if (!mine) return <ReadFailed title="The public tree was not found" why="No mandate is open under the public owner address." />;
    return (
      <div className="stack">
        <PageHeader title="Overview" subtitle="Your agents share one budget, signed once by you." />
        <Panel>
          <EmptyState
            icon="layers"
            title="You have not opened a mandate yet"
            description="Make operator keys with `npm run init`, then sign one mandate. Agents under it can never spend past what you sign."
            action={
              <Link to="/console/new">
                <Button variant="primary">Open a mandate</Button>
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  const isCut = cutLookup(nodes);
  const cutCount = nodes.filter((node) => isCut(node.node)).length;
  const levels = nodes.reduce((most, node) => Math.max(most, node.depth), 0) + 1;

  const attention = (node: ChainNode) =>
    isCut(node.node) ? -1 : isHeld(node) ? 1000 : share(node.windowSpent6, node.budget6);
  const watch = [...nodes].sort((a, b) => attention(b) - attention(a)).slice(0, 6);

  return (
    <div className="stack">
      <PageHeader
        title="Overview"
        subtitle={
          <>
            Root mandate <span className="mono">{shortId(root.node)}</span> ·{" "}
            {root.revoked ? "revoked" : "live"} · {nodes.length} {nodes.length === 1 ? "agent" : "agents"}
          </>
        }
        actions={
          mine ? (
            <>
              <Button variant="secondary" iconStart="plus" onClick={() => setAsking("spawn")} disabled={root.revoked}>
                Spawn agent
              </Button>
              <Button variant="secondary" onClick={() => setAsking("withdraw")}>
                Withdraw
              </Button>
              <Button variant="primary" onClick={() => setAsking("fund")} disabled={root.revoked}>
                Fund vault
              </Button>
            </>
          ) : null
        }
      />

      <div className="kpis">
        <Kpi
          label="Spent this window"
          value={formatUsdc(root.windowSpent6)}
          of={`of ${formatUsdc(root.budget6)}`}
          pct={share(root.windowSpent6, root.budget6)}
          foot={`Across the whole tree · resets every ${windowLabel(root.windowSeconds)}`}
          fn={ENFORCED_BY.budget}
        />
        <Kpi
          label="Spent in total"
          value={formatUsdc(root.lifetimeSpent6)}
          of={`of ${formatUsdc(root.lifetimeCap6)}`}
          pct={share(root.lifetimeSpent6, root.lifetimeCap6)}
          foot="The lifetime cap never refills"
          fn={ENFORCED_BY.lifetime}
        />
        <Kpi
          label="Can be drawn now"
          value={formatUsdc(root.available6)}
          foot="The tightest bound on the root, including the vault"
          fn={ENFORCED_BY.headroom}
        />
        <Kpi
          label="Agents"
          value={String(nodes.length)}
          foot={`${nodes.length - cutCount} live · ${cutCount} revoked · ${levels} ${levels === 1 ? "level" : "levels"}`}
        />
      </div>

      <div className="split">
        <Panel title="Agents to watch" action={<Link className="panel__link" to="/console/agents">All agents →</Link>}>
          <ul className="list">
            {watch.map((node) => {
              const pct = share(node.windowSpent6, node.budget6);
              const cut = isCut(node.node);
              return (
                <li key={node.node}>
                  <Link className="list__row" to={`/console/agents?node=${node.node}`}>
                    <span className="list__main">
                      <span className="mono list__id">{shortId(node.node)}</span>
                      <span className="list__meta">
                        {node.parent === null ? "Root" : `Depth ${node.depth}`}
                        {cut ? <Tag tone="critical" size="sm">Revoked</Tag> : null}
                        {isHeld(node) ? <span className="accent-text">held by {shortId(node.boundBy)}</span> : null}
                      </span>
                    </span>
                    <span className="list__bar">
                      <Meter value={pct} />
                      <span className="list__small num">{pct}% of window</span>
                    </span>
                    <span className="list__num num">{formatUsdc(node.available6)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Recent refusals" action={<Link className="panel__link" to="/console/refusals">All refusals →</Link>}>
          {refusals.state === "read" ? (
            refusals.refusals.length === 0 ? (
              <p className="muted">Nothing has been refused. Every purchase so far fit every bound.</p>
            ) : (
              <ul className="list">
                {refusals.refusals.slice(0, 5).map((refusal) => (
                  <li key={String(refusal.id)}>
                    <Link className="list__row list__row--two" to={`/console/refusals?id=${refusal.id}`}>
                      <span className="list__main">
                        <span className="list__strong num">{formatUsdc(refusal.amount6)}</span>
                        <span className="list__meta">
                          <span className="mono">{refusal.reason}</span> · {shortId(refusal.node)}
                        </span>
                      </span>
                      {refusal.released ? (
                        <Tag tone="caution" size="sm" dot>Released</Tag>
                      ) : (
                        <Tag size="sm" dot>Standing</Tag>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : refusals.state === "failed" ? (
            <p className="muted">Could not read refusals: {refusals.why}</p>
          ) : (
            <Skeleton variant="text" lines={4} />
          )}
        </Panel>
      </div>

      <Panel title="Mandate terms" action={<span className="panel__hint">Signed once · cannot be edited</span>}>
        <dl className="terms">
          <div className="term"><dt>Budget per window</dt><dd className="num">{formatUsdc(root.budget6)}</dd></div>
          <div className="term"><dt>Window</dt><dd>{windowLabel(root.windowSeconds)}</dd></div>
          <div className="term"><dt>Lifetime cap</dt><dd className="num">{formatUsdc(root.lifetimeCap6)}</dd></div>
          <div className="term"><dt>Per purchase</dt><dd className="num">{formatUsdc(root.trancheCap6)}</dd></div>
          <div className="term"><dt>Per seller</dt><dd className="num">{root.concentrationBps / 100}%</dd></div>
          <div className="term"><dt>Max depth</dt><dd className="num">{root.maxDepth}</dd></div>
          <div className="term term--wide"><dt>Operator</dt><dd className="mono">{shortId(root.operator, 8, 6)}</dd></div>
        </dl>
      </Panel>

      {mine ? (
        <>
          <FundDialog open={asking === "fund"} onClose={() => setAsking(null)} root={root} owner={owner} />
          <SpawnDialog open={asking === "spawn"} onClose={() => setAsking(null)} parent={root} owner={owner} />
          <WithdrawDialog open={asking === "withdraw"} onClose={() => setAsking(null)} root={root} owner={owner} />
        </>
      ) : null}
    </div>
  );
}
