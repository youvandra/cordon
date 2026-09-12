import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, DataTable, SearchField, Segmented, Sheet, Tag } from "cordon-ui";
import { formatUsdc } from "@cordon/fixtures";
import { useTitle } from "../parts/Shell";
import { Meter, PageHeader, PageSkeleton, Panel, ReadFailed } from "../parts/Page";
import { NodeDetail } from "../parts/NodeDetail";
import { RevokeDialog, SpawnDialog } from "../parts/OwnerDialogs";
import { TreeGraph, type GraphNode } from "../parts/TreeGraph";
import { useConsoleTree } from "../lib/useConsoleTree";
import { cutLookup, isHeld, share, shortId } from "../lib/format";
import type { ChainNode } from "../lib/tree";

type Filter = "all" | "live" | "held" | "revoked";

export default function Agents() {
  useTitle("Agents · Cordon console");
  const { ready, mine, owner, chain, nodes, root } = useConsoleTree();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"list" | "tree">("list");
  const [query, setQuery] = useState("");
  const [spawnParent, setSpawnParent] = useState<ChainNode | null>(null);
  const [revoking, setRevoking] = useState<ChainNode | null>(null);

  const selectedId = params.get("node");
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("node", id);
    else next.delete("node");
    setParams(next, { replace: true });
  };

  if (!ready || chain.state === "looking") return <PageSkeleton />;
  if (chain.state === "unconfigured") return <ReadFailed title="No deployment configured" why="This build has no contract addresses to read." />;
  if (chain.state === "failed") return <ReadFailed why={chain.why} />;

  const isCut = cutLookup(nodes);
  const subtree = (node: ChainNode): number => {
    let count = 1;
    for (const child of nodes.filter((candidate) => candidate.parent === node.node)) count += subtree(child);
    return count;
  };

  const needle = query.trim().toLowerCase();
  const rows = nodes.filter((node) => {
    const cut = isCut(node.node);
    if (filter === "live" && cut) return false;
    if (filter === "revoked" && !cut) return false;
    if (filter === "held" && !isHeld(node)) return false;
    if (needle && !node.node.toLowerCase().includes(needle) && !node.operator.toLowerCase().includes(needle)) return false;
    return true;
  });

  const selected = nodes.find((node) => node.node.toLowerCase() === selectedId?.toLowerCase());
  const counts = {
    all: nodes.length,
    live: nodes.filter((node) => !isCut(node.node)).length,
    held: nodes.filter(isHeld).length,
    revoked: nodes.filter((node) => isCut(node.node)).length,
  };

  const graph: GraphNode[] = nodes.map((node) => ({
    id: node.node,
    label: shortId(node.node),
    parent: node.parent,
    spent6: node.windowSpent6,
    budget6: node.budget6,
    available6: node.available6,
    heldBy: isHeld(node) ? shortId(node.boundBy) : null,
    revoked: isCut(node.node),
  }));

  return (
    <div className="stack">
      <PageHeader
        title="Agents"
        subtitle="Every agent under this mandate. Each purchase is charged to the agent and every agent above it."
        actions={
          mine && root && !root.revoked ? (
            <Button variant="primary" iconStart="plus" onClick={() => setSpawnParent(root)}>
              Spawn agent
            </Button>
          ) : null
        }
      />

      <div className="toolbar">
        <SearchField
          className="toolbar__search"
          size="sm"
          placeholder="Search by node or operator"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Segmented
          size="sm"
          label="Filter agents"
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
          options={[
            { value: "all", label: `All ${counts.all}` },
            { value: "live", label: `Live ${counts.live}` },
            { value: "held", label: `Held ${counts.held}` },
            { value: "revoked", label: `Revoked ${counts.revoked}` },
          ]}
        />
        <span className="toolbar__grow" />
        <Segmented
          size="sm"
          label="View"
          value={view}
          onValueChange={(value) => setView(value as "list" | "tree")}
          options={[
            { value: "list", label: "List", icon: "hamburger" },
            { value: "tree", label: "Tree", icon: "layers" },
          ]}
        />
      </div>

      {view === "list" ? (
        <Panel flush>
          <DataTable
            rows={rows}
            rowKey={(node) => node.node}
            onRowClick={(node) => select(node.node)}
            empty={<p className="muted table-empty">No agents match.</p>}
            columns={[
              {
                id: "agent",
                header: "Agent",
                cell: (node) => (
                  <span className="agent" style={{ paddingLeft: node.depth * 18 }}>
                    <span className="mono agent__id">{shortId(node.node)}</span>
                    {node.parent === null ? <Tag size="sm">Root</Tag> : null}
                    {isCut(node.node) ? <Tag tone="critical" size="sm">Revoked</Tag> : null}
                  </span>
                ),
              },
              {
                id: "available",
                header: "Can draw now",
                numeric: true,
                sortBy: (node) => Number(node.available6),
                cell: (node) => (
                  <span className="cell-stack cell-stack--end">
                    <span className="num strong">{formatUsdc(node.available6)}</span>
                    {isHeld(node) ? <span className="accent-text small">held by {shortId(node.boundBy)}</span> : null}
                  </span>
                ),
              },
              {
                id: "window",
                header: "This window",
                sortBy: (node) => share(node.windowSpent6, node.budget6),
                cell: (node) => (
                  <span className="cell-stack">
                    <Meter value={share(node.windowSpent6, node.budget6)} />
                    <span className="small muted num">
                      {formatUsdc(node.windowSpent6)} of {formatUsdc(node.budget6)}
                    </span>
                  </span>
                ),
              },
              {
                id: "lifetime",
                header: "Lifetime",
                numeric: true,
                cell: (node) => (
                  <span className="num muted">
                    {formatUsdc(node.lifetimeSpent6)} / {formatUsdc(node.lifetimeCap6)}
                  </span>
                ),
              },
              {
                id: "operator",
                header: "Operator",
                cell: (node) => <span className="mono muted">{shortId(node.operator)}</span>,
              },
            ]}
          />
        </Panel>
      ) : (
        <Panel flush className="panel--canvas">
          <TreeGraph nodes={graph} selected={selected?.node ?? root?.node ?? null} onSelect={(id) => select(id)} />
        </Panel>
      )}

      <Sheet
        open={Boolean(selected)}
        onClose={() => select(null)}
        side="right"
        size={460}
        title="Agent"
        description={selected ? shortId(selected.node, 10, 8) : undefined}
        footer={
          mine && selected && !isCut(selected.node) ? (
            <div className="sheet-actions">
              <Button
                variant="secondary"
                iconStart="plus"
                disabled={selected.depth + 1 > selected.maxDepth}
                onClick={() => setSpawnParent(selected)}
              >
                {selected.depth + 1 > selected.maxDepth ? "At max depth" : "Spawn under this agent"}
              </Button>
              <Button variant="danger" onClick={() => setRevoking(selected)}>
                Revoke
              </Button>
            </div>
          ) : undefined
        }
      >
        {selected ? <NodeDetail node={selected} all={nodes} cut={isCut(selected.node)} /> : null}
      </Sheet>

      {mine && root ? (
        <>
          <SpawnDialog open={Boolean(spawnParent)} onClose={() => setSpawnParent(null)} parent={spawnParent ?? root} owner={owner} />
          <RevokeDialog node={revoking} affected={revoking ? subtree(revoking) : 0} onClose={() => setRevoking(null)} owner={owner} />
        </>
      ) : null}
    </div>
  );
}
