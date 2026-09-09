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
  Tree as TreeView,
  useToast,
} from "cordon-ui";
import type { TreeNode as UiTreeNode } from "cordon-ui";
import { ENFORCED_BY, MANDATE, STRENGTH, formatUsdc } from "@cordon/fixtures";
import { TREE, flatten, lifetime, pathTo, type TreeNode } from "@cordon/fixtures/preview";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";
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

  const toUi = (node: TreeNode): UiTreeNode => ({
    id: node.id,
    label: node.label,
    meta: (
      <span
        className="mono treemeta"
        data-hot={share(node) >= 95 ? "" : undefined}
      >
        {share(node)}%{node.refused ? ` · ${node.refused} refused` : ""}
      </span>
    ),
    children: node.children.length ? node.children.map(toUi) : undefined,
  });

  const rootSpent = spend.root ?? TREE.spent6;
  const rootShare = Number((rootSpent * 100n) / TREE.budget6);

  return (
    <>
      <ScreenHead
        title="Live exposure across the whole tree"
        lede="Every node here is one of your own agents, running on your own daemon keys. Draw on a grandchild; its grandparent's bar moves."
        note="sample tree; draws are local"
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

        <Section
          title="delegation tree"
          aside={<Enforced>{ENFORCED_BY.treeBar}</Enforced>}
        >
          <CardBody>
            <TreeView
              nodes={[toUi(TREE)]}
              defaultExpanded={nodes.map((node) => node.id)}
            />
          </CardBody>
        </Section>
      </Grid>

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
