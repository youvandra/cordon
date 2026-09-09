import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button,
  CardBody,
  DataTable,
  Enforced,
  Grid,
  IconMenu,
  MetricCard,
  Modal,
  ProgressBar,
  Section,
  Stack,
  Tag,
  Text,
  useToast,
} from "cordon-ui";
import { ARC, ENFORCED_BY, MANDATE, STRENGTH, formatUsdc } from "@cordon/fixtures";
import { TREE, flatten, lifetime, pathTo, type TreeNode } from "@cordon/fixtures/preview";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";
import { useWallet } from "../lib/wallet";
import { useChainTree, type ChainNode } from "../lib/tree";
import { TreeGraph } from "../parts/TreeGraph";
import { useEntrance } from "../lib/entrance";

/** The path from the root down to `id`, excluding `id` itself. */
function ancestorsOf(
  root: TreeNode,
  id: string,
  path: string[] = [],
): string[] | null {
  if (root.id === id) return path;
  for (const child of root.children) {
    const found = ancestorsOf(child, id, [...path, root.id]);
    if (found) return found;
  }
  return null;
}

function subtreeOf(root: TreeNode, id: string): string[] {
  const find = (node: TreeNode): TreeNode | null =>
    node.id === id ? node : (node.children.map(find).find(Boolean) ?? null);
  const target = find(root);
  if (!target) return [];
  const out: string[] = [];
  const walk = (node: TreeNode) => {
    out.push(node.id);
    node.children.forEach(walk);
  };
  walk(target);
  return out;
}

const DRAW6 = 1_000_000n;


/**
 * The tree as the chain holds it — no indexer, no meter, no server.
 *
 * `MandateRegistry` derives ids instead of listing them, so every node under an
 * owner is reachable from that owner's address; the bounds come from the
 * registry and the spending from the vault's own views. Nothing here is a
 * reduction of events, so nothing here can disagree with the contract.
 *
 * There are no draw or revoke controls on these rows. A draw is the daemon's
 * to make and a revocation is a transaction, and a button that pretends to do
 * either from a table would be the surface lying about what it can do.
 */
function ChainTree({ nodes }: { nodes: ChainNode[] }) {
  const root = nodes.find((node) => node.parent === null);

  return (
    <>
      <Grid columns={2} min={360} gap="lg" align="start">
        <MetricCard
          title={
            <>
              Root window
              <br />
              Drawn across the whole tree
            </>
          }
          value={formatUsdc(root ? root.windowSpent6 : 0n).replace("$", "")}
          unit="USDC"
          progress={
            root && root.budget6 > 0n
              ? Math.min(1, Number(root.windowSpent6) / Number(root.budget6))
              : 0
          }
          caption={
            root ? (
              <>
                of {formatUsdc(root.budget6)}
                <br />
                {formatUsdc(root.lifetimeSpent6)} of {formatUsdc(root.lifetimeCap6)} in total
              </>
            ) : null
          }
          glaze="violet"
        />

        <Section title={`${nodes.length} ${nodes.length === 1 ? "node" : "nodes"} on ${ARC.name}`}>
          <CardBody>
            <Text variant="body" tone="copy" as="p">
              Read from the registry and the vault directly. The ids are derived
              from your address, so nobody had to be asked how many agents you
              have — and nothing between you and the contract could have got the
              answer wrong.
            </Text>
          </CardBody>
        </Section>
      </Grid>

      <Section title="delegation tree" aside={<Enforced>{ENFORCED_BY.treeBar}</Enforced>}>
        <TreeGraph
          nodes={nodes.map((node) => ({
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
          }))}
        />
      </Section>

      <Section title="every node, as figures">
        <DataTable
          rows={nodes}
          rowKey={(node) => node.node}
          columns={[
            {
              id: "node",
              header: "Node",
              cell: (node) => (
                <span className="cell__node" style={{ paddingLeft: node.depth * 16 }}>
                  <span className="mono cell__id">
                    {node.node.slice(0, 10)}…{node.node.slice(-6)}
                  </span>
                  {node.revoked ? (
                    <Tag tone="critical" size="sm">
                      revoked
                    </Tag>
                  ) : null}
                </span>
              ),
            },
            {
              id: "operator",
              header: "Operator",
              cell: (node) => (
                <span className="mono">
                  {node.operator.slice(0, 8)}…{node.operator.slice(-4)}
                </span>
              ),
            },
            {
              id: "spent",
              header: "Spent this window",
              numeric: true,
              cell: (node) => formatUsdc(node.windowSpent6),
            },
            {
              id: "total",
              header: "Spent in total",
              numeric: true,
              cell: (node) => formatUsdc(node.lifetimeSpent6),
            },
            {
              id: "headroom",
              header: "Can still draw",
              numeric: true,
              cell: (node) => (
                <span className="headroom">
                  <b className="num">{formatUsdc(node.available6)}</b>
                  {node.boundBy.toLowerCase() === node.node.toLowerCase() ? null : (
                    <span className="headroom__bound mono">
                      held by {node.boundBy.slice(0, 8)}…
                    </span>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}

export default function Tree() {
  useTitle("Tree · Cordon console");
  const animate = useEntrance();

  const navigate = useNavigate();
  const nodes = useMemo(() => flatten(TREE), []);
  const [spend, setSpend] = useState<Record<string, bigint>>(() =>
    Object.fromEntries(nodes.map((node) => [node.id, node.spent6])),
  );
  const [revoked, setRevoked] = useState<Set<string>>(new Set());

  /** The debit every other layer skips: every ancestor, not only the node that asked. */
  const draw = (id: string) => {
    const chain = [...(ancestorsOf(TREE, id) ?? []), id];
    setSpend((previous) => {
      const next = { ...previous };
      for (const nodeId of chain) next[nodeId] = (next[nodeId] ?? 0n) + DRAW6;
      return next;
    });
  };

  /* Cutting a branch kills every node under it, and the console's own copy
     says a refusal must survive its authors — so the same rule applies to the
     owner's hand slipping. Asked for once, then reported. */
  const [cutting, setCutting] = useState<TreeNode | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  /* The parent of a node, from the tree the fixtures already describe. The
     graph needs an edge list and the preview tree is nested, so this is the
     one place the two shapes meet. */
  const parentOf = (id: string): string | null => {
    const path = pathTo(id);
    return path.length > 1 ? path[path.length - 2]!.id : null;
  };
  const { notify } = useToast();

  const revoke = (node: TreeNode) => {
    setCutting(null);
    const subtree = subtreeOf(TREE, node.id);
    setRevoked((previous) => new Set([...previous, ...subtree]));
    notify({
      tone: "caution",
      title: `${node.label} is cut`,
      children: `${subtree.length} ${subtree.length === 1 ? "node" : "nodes"} can draw nothing. The branch stays in the record; conduct under a cut mandate is the point.`,
      duration: 8000,
    });
  };

  const share = (node: TreeNode) =>
    Number(((spend[node.id] ?? node.spent6) * 100n) / node.budget6);

  /**
   * What this node may actually still draw. `TreeVault.headroom(node)`.
   *
   * A node's own budget is an upper bound, not an amount: a grandchild with
   * $48 of its own window untouched can still draw nothing when the root two
   * levels up is full, and every one of those dollars would be refused. The
   * share bar above answers "how full is this node"; this answers "what would
   * happen if it asked", which is the only one an owner can act on.
   */
  /** What this node has drawn since it was opened, including the draws made
   *  on this screen. The window figure resets and this one does not. */
  const lifetimeSpentOf = (node: TreeNode) =>
    lifetime(node).spent6 + ((spend[node.id] ?? node.spent6) - node.spent6);

  const headroomOf = (node: TreeNode) => {
    const path = pathTo(node.id);
    let available: bigint | null = null;
    let boundBy = node;

    for (const step of path) {
      if (revoked.has(step.id)) return { available6: 0n, boundBy: step };
      /* Two bounds on one node, and the answer is the tighter one. A column
         that reads only the window tells the owner a node may draw money the
         lifetime cap will refuse. */
      const windowLeft = step.budget6 - (spend[step.id] ?? step.spent6);
      const lifetimeLeft = lifetime(step).cap6 - lifetimeSpentOf(step);
      const left = lifetimeLeft < windowLeft ? lifetimeLeft : windowLeft;
      if (available === null || left < available) {
        available = left;
        boundBy = step;
      }
    }

    return { available6: available === null || available < 0n ? 0n : available, boundBy };
  };

  const rootSpent = spend.root ?? TREE.spent6;
  const rootShare = Number((rootSpent * 100n) / TREE.budget6);

  /* A wallet with mandates on chain gets its own tree; everyone else gets the
     illustration, which says so. Both cannot be shown at once — two trees on
     one screen is a reader asking which one is theirs. */
  const { address, real } = useWallet();
  const chain = useChainTree(real ? address : null);

  if (chain.state === "read") {
    return (
      <>
        <ScreenHead
          title="Live exposure across the whole tree"
          lede="Every node here is one of your own agents, running on your own daemon keys. Every figure is read from the contract that enforces it."
          note={`read from ${ARC.name}`}
        />
        <ChainTree nodes={chain.nodes} />
      </>
    );
  }

  return (
    <>
      <ScreenHead
        title="Live exposure across the whole tree"
        lede="Every node here is one of your own agents, running on your own daemon keys. Draw on a grandchild; its grandparent's bar moves."
        note={chain.state === "looking" ? "reading the chain…" : "sample tree; draws are local"}
      />

      <Grid columns={2} min={360} gap="lg" align="start">
        {/* The one number this screen exists to show, and the only LED face on it. */}
        <Text variant="micro" tone="dim" as="h2" id="the-exposure" className="eyebrow visually-hidden">
          Root window across the whole tree
        </Text>
        <MetricCard
          animate={animate}
          title={
            <>
              Root window · {MANDATE.windowSeconds.toLocaleString()}s
              <br />
              Drawn across the whole tree
            </>
          }
          value={formatUsdc(rootSpent).replace("$", "")}
          unit="USDC"
          progress={Math.min(1, rootShare / 100)}
          caption={
            <>
              of {formatUsdc(TREE.budget6)}
              <br />
              {/* The window is a rate. The total is what was signed, and it is
                  the bound that does not come back tomorrow. */}
              {formatUsdc(lifetimeSpentOf(TREE))} of{" "}
              {formatUsdc(MANDATE.lifetimeCap6)} in total
              <br />
              {TREE.refused} refusals at the root
            </>
          }
          glaze="violet"
        />

        <Stack direction="column" gap="md" align="start">
          <Text variant="body" tone="copy" as="p">
            The bar on each node is its own window. The figure under it is what
            that node may actually draw, and the two are different numbers
            whenever something above it is tighter — which is the whole claim
            this screen exists to make.
          </Text>
          <Enforced>{ENFORCED_BY.treeBar}</Enforced>
        </Stack>
      </Grid>

      {/* Full width, because a tree is wider than a column. Sharing a row with
          the metric put a 680px drawing inside 330px and scrolled the root out
          of sight. */}
      <Section title="delegation tree">
        <CardBody>
          <TreeGraph
            nodes={nodes.map((node) => {
              const room = headroomOf(node);
              return {
                id: node.id,
                label: node.label,
                parent: parentOf(node.id),
                spent6: spend[node.id] ?? node.spent6,
                budget6: node.budget6,
                available6: room.available6,
                heldBy: room.boundBy.id === node.id ? null : room.boundBy.label,
                revoked: revoked.has(node.id),
                refusals: node.refused,
              };
            })}
            selected={selected}
            onSelect={setSelected}
          />
        </CardBody>
      </Section>

      <Section
        title={`${nodes.length} nodes · depth ${MANDATE.maxDepth}`}
        aside={<Enforced>{ENFORCED_BY.revoke}</Enforced>}
      >
        <DataTable
          rows={nodes}
          rowKey={(node) => node.id}
          columns={[
            {
              id: "node",
              header: "Node",
              /* The node's name is the way to its public record. A command
                 palette was carrying that, which meant the one link a reader
                 wants was hidden behind a keyboard shortcut. */
              cell: (node) => (
                <span
                  className="cell__node"
                  style={{ paddingLeft: node.depth * 16 }}
                >
                  <Link to={`/agent/${node.agentId}`} className="cell__link">
                    {node.label}
                  </Link>
                  <span className="mono cell__id">8004 #{node.agentId}</span>
                  {revoked.has(node.id) ? (
                    <Tag tone="critical" size="sm">
                      revoked
                    </Tag>
                  ) : share(node) >= 100 ? (
                    <Tag tone="critical" size="sm">
                      at bound
                    </Tag>
                  ) : null}
                </span>
              ),
            },
            {
              id: "window",
              header: "Share of its own window",
              width: 200,
              cell: (node) => (
                <ProgressBar value={Math.min(100, share(node))} size="sm" />
              ),
            },
            {
              id: "spent",
              header: "Spent",
              numeric: true,
              width: 100,
              sortBy: (node) => Number(spend[node.id] ?? node.spent6),
              cell: (node) => formatUsdc(spend[node.id] ?? node.spent6),
            },
            {
              id: "headroom",
              header: "Can still draw",
              numeric: true,
              width: 172,
              sortBy: (node) => Number(headroomOf(node).available6),
              cell: (node) => {
                const { available6, boundBy } = headroomOf(node);
                return (
                  <span className="headroom">
                    <b className="num">{formatUsdc(available6)}</b>
                    {/* Naming the limit only when it is somebody else's is the
                        whole point of the column. A node bound by its own
                        window is the unremarkable case. */}
                    {boundBy.id === node.id ? null : (
                      <span className="headroom__bound mono">
                        held by {boundBy.label}
                      </span>
                    )}
                  </span>
                );
              },
            },
            {
              id: "concentration",
              /* "Declared" is in the header rather than in every row because
                 it is a property of the column, not of any one node. The
                 contract bounds the counterparty a daemon names on chain; the
                 payment itself leaves a Gateway balance through a signature no
                 contract reads. */
              header: "Top declared counterparty",
              width: 200,
              cell: (node) => (
                <span className="mono cell__cp" data-strength={STRENGTH.concentration}>
                  {node.concentrationPct}% · {node.topCounterparty}
                </span>
              ),
            },
            {
              id: "act",
              header: "",
              align: "end",
              width: 132,
              /* Draw is the routine action and sits in the row. Revoke kills a
                 whole subtree, and it used to sit eight pixels away at the same
                 size — two targets of equal cost to hit and wildly unequal cost
                 to hit wrongly. It moves behind the kebab, which is the glyph
                 for actions on one row. */
              cell: (node) => (
                <Stack direction="row" gap="xs" justify="end" align="center">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={revoked.has(node.id)}
                    onClick={() => draw(node.id)}
                  >
                    Draw $1
                  </Button>
                  <IconMenu
                    glyph="kebab"
                    label={`Actions for ${node.label}`}
                    size="sm"
                    variant="ghost"
                    align="end"
                    items={[
                      {
                        id: "record",
                        label: "Public conduct record",
                        icon: "external",
                        onSelect: () => navigate(`/agent/${node.agentId}`),
                      },
                      {
                        id: "revoke",
                        label: "Revoke subtree",
                        icon: "trash",
                        destructive: true,
                        meta: `${subtreeOf(TREE, node.id).length} nodes`,
                        disabled: revoked.has(node.id),
                        onSelect: () => setCutting(node),
                      },
                    ]}
                  />
                </Stack>
              ),
            },
          ]}
        />
      </Section>

      <Modal
        open={cutting !== null}
        onClose={() => setCutting(null)}
        title={cutting ? `Cut ${cutting.label} and everything under it?` : ""}
        description="Revocation is permanent. The branch keeps its record — conduct under a cut mandate is exactly what the record is for — but nothing under it can draw again."
        hideClose
        dismissOnScrim={false}
        footer={
          <Stack direction="row" gap="sm">
            <Button variant="secondary" onClick={() => setCutting(null)}>
              Leave it running
            </Button>
            <Button variant="danger" onClick={() => cutting && revoke(cutting)}>
              Cut the branch
            </Button>
          </Stack>
        }
      >
        <Text variant="body" tone="copy" as="p">
          {cutting ? subtreeOf(TREE, cutting.id).length : 0} node
          {cutting && subtreeOf(TREE, cutting.id).length === 1 ? "" : "s"} stop
          being able to draw, including any child spawned after this.
        </Text>
      </Modal>
    </>
  );
}
