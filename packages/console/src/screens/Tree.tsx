import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  TextField,
  DataTable,
  Enforced,
  Grid,
  IconMenu,
  MetricCard,
  Modal,
  ProgressBar,
  Section,
  Skeleton,
  Stack,
  Tag,
  Text,
  useNotify,
} from "cordon-ui";
import { ARC, DEMO, ENFORCED_BY, MANDATE, STRENGTH, formatUsdc, isAddress } from "@cordon/fixtures";
import { TREE, flatten, lifetime, pathTo, type TreeNode } from "@cordon/fixtures/preview";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";
import { useWallet } from "../lib/wallet";
import { useChainTree, type ChainNode } from "../lib/tree";
import { useFundVault, useRevoke, useSpawnChild } from "../lib/mandate";
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
 * There is no draw control on these rows: a draw is the daemon's to make, and
 * a button that pretended to make one from a table would be the surface lying
 * about what it can do. Revoking is different — it is the owner's own
 * transaction, and the console had drawn it for the sample tree while leaving
 * the real rows with no way to do it at all. It is here now, for the owner of
 * the tree being shown and nobody else.
 */
/** The root this owner is operating: the first one, and the live one. */
function rootOf(nodes: ChainNode[]): ChainNode | undefined {
  return nodes.find((node) => node.parent === null && !node.revoked);
}

function ChainTree({ nodes, owner }: { nodes: ChainNode[]; owner: string | null }) {
  const root = nodes.find((node) => node.parent === null);
  const notify = useNotify();
  const { state: cut, revoke } = useRevoke(owner);
  const [cutting, setCutting] = useState<ChainNode | null>(null);

  /* Announced once per outcome, for the same reason the funding toast is:
     a toast re-renders this screen, and an effect that announces on every
     render announces for ever. */
  const announced = useRef<string | null>(null);
  useEffect(() => {
    const outcome = `cut:${cut.status}:${"hash" in cut ? cut.hash : "why" in cut ? cut.why : ""}`;
    if (announced.current === outcome) return;
    if (cut.status === "done") {
      announced.current = outcome;
      notify({
        id: cut.hash,
        tone: "caution",
        title: "The branch is cut",
        children: "That node and everything under it draws nothing from this block on. The record stays.",
        duration: 8000,
      });
      window.location.reload();
    }
    if (cut.status === "failed") {
      announced.current = outcome;
      notify({ id: "cut-failed", tone: "critical", title: "Not cut", children: cut.why, duration: 0 });
    }
  }, [cut, notify]);

  /** How many live nodes stop drawing if this one is cut — it and its issue. */
  const subtreeOfChain = (node: ChainNode): ChainNode[] => {
    const out: ChainNode[] = [];
    const walk = (id: string) => {
      for (const candidate of nodes) {
        if (candidate.parent?.toLowerCase() !== id.toLowerCase()) continue;
        out.push(candidate);
        walk(candidate.node);
      }
    };
    walk(node.node);
    return [node, ...out];
  };

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
              Read from the registry and the vault directly. Every id is derived
              from {owner ? "your address" : "the owner's address"}, so nobody
              had to be asked how many agents there are — and nothing between{" "}
              {owner ? "you" : "this screen"} and the contract could have got
              the answer wrong.
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
            /* Only for the owner of this tree. A visitor reading the public
               one is shown no control rather than one that fails at the
               wallet. */
            ...(owner
              ? [
                  {
                    id: "cut",
                    header: "",
                    width: 96,
                    cell: (node: ChainNode) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={node.revoked || cut.status === "working"}
                        onClick={() => setCutting(node)}
                      >
                        {node.revoked ? "cut" : "Revoke"}
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Section>

      <Modal
        open={Boolean(cutting)}
        onClose={() => setCutting(null)}
        title="Cut this branch?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCutting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={cut.status === "working"}
              onClick={() => {
                const node = cutting;
                setCutting(null);
                if (node) void revoke(node.node as `0x${string}`);
              }}
            >
              {cut.status === "working" ? cut.step : "Revoke on chain"}
            </Button>
          </>
        }
      >
        {cutting ? (
          <>
            <Text variant="body" tone="copy" as="p">
              {subtreeOfChain(cutting).length}{" "}
              {subtreeOfChain(cutting).length === 1 ? "node" : "nodes"} stop drawing:{" "}
              this one and everything under it. The branch stays in the record —
              conduct under a cut mandate is the point — and the money already
              released is not recalled.
            </Text>
            <Text variant="caption" tone="dim" as="p" className="mono">
              {cutting.node}
            </Text>
            <Enforced>{ENFORCED_BY.revoke}</Enforced>
          </>
        ) : null}
      </Modal>
    </>
  );
}


/**
 * The two things an owner does to a tree that already exists: put money behind
 * it, and give part of it to somebody narrower.
 *
 * Both are transactions from the owner's own key, and both are checked before
 * they are sent — the contract refuses a child wider than its parent and a
 * draw from an empty vault, and learning either on chain costs gas.
 */
function Operate({
  root,
  owner,
  onDone,
}: {
  root: ChainNode;
  owner: string;
  onDone: () => void;
}) {
  const notify = useNotify();
  const { state: funding, fund } = useFundVault(owner);
  const { state: spawning, spawn } = useSpawnChild(owner);

  const [amount, setAmount] = useState(String(root.budget6 / 1_000_000n));
  const [operator, setOperator] = useState("");
  const [share, setShare] = useState("50");

  const usdc6 = (dollars: string): bigint => {
    const value = Number(dollars || "0");
    if (!Number.isFinite(value) || value < 0) return 0n;
    return BigInt(Math.round(value * 1_000_000));
  };

  /* Once per outcome, and never again for the same one.
     
     These effects used to depend on the callback the parent passes, which was
     written inline and so was a new function on every render — and a toast
     re-renders the parent. A failed funding therefore notified, re-rendered,
     notified again, and did not stop. The ref is what makes an effect that
     performs an action idempotent: the outcome is announced when it arrives
     and the announcement is recorded, so a re-render announces nothing. */
  const announced = useRef<string | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const outcome = `fund:${funding.status}:${"hash" in funding ? funding.hash : "why" in funding ? funding.why : ""}`;
    if (announced.current === outcome) return;

    if (funding.status === "done") {
      announced.current = outcome;
      notify({ id: funding.hash, tone: "positive", title: "The vault is funded", children: "Draws can be released now.", duration: 6000 });
      done.current();
    }
    if (funding.status === "failed") {
      announced.current = outcome;
      notify({ id: "fund-failed", tone: "critical", title: "Not funded", children: funding.why, duration: 0 });
    }
  }, [funding, notify]);

  const announcedSpawn = useRef<string | null>(null);

  useEffect(() => {
    const outcome = `spawn:${spawning.status}:${"hash" in spawning ? spawning.hash : "why" in spawning ? spawning.why : ""}`;
    if (announcedSpawn.current === outcome) return;

    if (spawning.status === "done") {
      announcedSpawn.current = outcome;
      notify({ id: spawning.hash, tone: "positive", title: "A child is open", children: "It is narrower than its parent, and the contract checked that.", duration: 6000 });
      done.current();
    }
    if (spawning.status === "failed") {
      announcedSpawn.current = outcome;
      notify({ id: "spawn-failed", tone: "critical", title: "Not spawned", children: spawning.why, duration: 0 });
    }
  }, [spawning, notify]);

  /* A share of the parent, never an amount: the contract refuses anything
     wider, and a number typed in dollars is one nobody checked against the
     bound it has to fit inside. */
  const childBudget6 = (root.budget6 * BigInt(Math.round(Number(share || "0")))) / 100n;

  return (
    <Grid columns={2} min={320} gap="lg" align="start">
      <Card>
        <CardHeader>
          <Text variant="micro" tone="dim" as="span" className="eyebrow">
            fund the vault
          </Text>
        </CardHeader>
        <CardBody>
          <Stack direction="column" gap="md" align="start">
            <Text variant="body" tone="copy" as="p">
              Nothing can be drawn from a vault with nothing in it. This is the
              only funding source the tree has, and the money stays here until a
              purchase the contract allows.
            </Text>
            <TextField
              type="number"
              value={amount}
              suffix="USDC"
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button
              variant="primary"
              disabled={funding.status === "working" || usdc6(amount) <= 0n}
              onClick={() => void fund(root.node, usdc6(amount))}
            >
              {funding.status === "working" ? funding.step : "Fund the vault"}
            </Button>
          </Stack>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <Text variant="micro" tone="dim" as="span" className="eyebrow">
            spawn a child
          </Text>
        </CardHeader>
        <CardBody>
          <Stack direction="column" gap="md" align="start">
            <Text variant="body" tone="copy" as="p">
              A child can only be narrower. Normally its parent spawns it while
              you sleep; these first ones are yours, because no daemon is
              running yet.
            </Text>
            <Field label="Operator address" hint="another address from `cordon init` — not this one">
              <TextField
                value={operator}
                placeholder="0x…"
                onChange={(event) => setOperator(event.target.value)}
              />
            </Field>
            <Field label="Share of the parent" hint="its window, lifetime and tranche, as a percentage of the parent's">
              <TextField
                type="number"
                value={share}
                suffix="%"
                onChange={(event) => setShare(event.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              disabled={
                spawning.status === "working" ||
                !isAddress(operator) ||
                childBudget6 <= 0n ||
                childBudget6 > root.budget6
              }
              onClick={() =>
                void spawn(root.node, {
                  operator: operator as `0x${string}`,
                  budget6: childBudget6,
                  lifetimeCap6: (root.lifetimeCap6 * BigInt(Math.round(Number(share || "0")))) / 100n,
                  /* The parent's own, read from the chain. The contract wants
                     them equal, not merely narrower — a shorter child window
                     resets faster than the parent it debits — and the fixture's
                     default is not necessarily what this owner signed. */
                  windowSeconds: root.windowSeconds,
                  trancheCap6: root.trancheCap6,
                  concentrationBps: root.concentrationBps,
                  maxDepth: root.maxDepth,
                })
              }
            >
              {spawning.status === "working" ? spawning.step : "Spawn"}
            </Button>
          </Stack>
        </CardBody>
      </Card>
    </Grid>
  );
}

/** The screen with nothing in it yet: the shape of the answer, never a
 *  different tree's numbers under this one's heading. */
function TreeSkeleton({ note }: { note: string }) {
  return (
    <>
      <ScreenHead
        title="Live exposure across the whole tree"
        lede="Every figure on this screen is read from the contract that enforces it."
        note={note}
      />
      <Grid columns={2} min={360} gap="lg" align="start">
        <Card>
          <CardBody>
            <Stack direction="column" gap="md" align="start">
              <Skeleton width="54%" height={12} />
              <Skeleton width="46%" height={48} />
              <Skeleton variant="text" lines={2} />
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stack direction="column" gap="md" align="start">
              <Skeleton width="40%" height={12} />
              <Skeleton variant="text" lines={5} />
            </Stack>
          </CardBody>
        </Card>
      </Grid>
      <Card>
        <CardBody>
          <Stack direction="column" gap="md" align="start">
            <Skeleton width="28%" height={12} />
            <Skeleton height={172} />
          </Stack>
        </CardBody>
      </Card>
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
  const notify = useNotify();

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

  /* A signed-in owner sees their own tree. A visitor sees the public one on
     Arc — the same screen, the same code path, and a banner saying whose it
     is. It used to be a tree of invented agents, which is indistinguishable
     from a mockup in a screenshot and was one. */
  const { address, real, ready } = useWallet();
  const owner = real ? address : DEMO.owner;
  const chain = useChainTree(owner);
  const mine = real && Boolean(address);

  /* Privy restores its session asynchronously. Deciding whose tree to draw
     before it has finished shows an owner the public one and then swaps it. */
  if (!ready) return <TreeSkeleton note="restoring this session…" />;

  /* A wallet that has mandates is about to be shown them, and the sample tree
     in the meantime is somebody else's numbers under their own heading. Show
     the shape and nothing in it until the chain has answered. */
  if (chain.state === "looking") return <TreeSkeleton note={`reading ${ARC.name}…`} />;

  if (chain.state === "read") {
    return (
      <>
        <ScreenHead
          title="Live exposure across the whole tree"
          lede={
            mine
              ? "Every node here is one of your own agents, running on your own daemon keys. Every figure is read from the contract that enforces it."
              : "This is the tree Cordon runs on Arc, read from the contract that enforces it. It is not yours: opening one of your own takes a signature from your own key, and nothing on this screen can produce one."
          }
          note={mine ? `read from ${ARC.name}` : `the public tree · read from ${ARC.name}`}
          live
        />
        <ChainTree nodes={chain.nodes} owner={mine ? address : null} />
        {/* Funding and spawning are the owner's, and the owner is the address
            that signed the mandate. A visitor reading the public tree is shown
            what they can do about it, which is nothing, rather than a form
            that would fail at the wallet. */}
        {mine && rootOf(chain.nodes) && address ? (
          <Operate root={rootOf(chain.nodes)!} owner={address} onDone={() => window.location.reload()} />
        ) : null}
      </>
    );
  }

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
