import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
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
import { TreePlayground } from "../parts/TreePlayground";
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

/**
 * The shape of the tree, as one row of dots per level.
 *
 * A count on its own says how many agents there are and nothing about how they
 * are arranged, and the arrangement is the product: a row of eight at depth
 * three is a very different tree from eight roots. Drawn from the data with no
 * measurement — every dot is a fixed size, so it is right on the first frame
 * and in a hidden tab, which is the rule the rest of this screen follows.
 */
function DepthFigure({ nodes }: { nodes: ChainNode[] }) {
  const levels: ChainNode[][] = [];
  for (const node of nodes) (levels[node.depth] ??= []).push(node);

  return (
    <span className="depths" aria-hidden="true">
      {levels.map((row, depth) => (
        <span className="depths__row" key={depth}>
          {row.map((node) => (
            <span
              key={node.node}
              className="depths__dot"
              data-cut={node.revoked ? "" : undefined}
              data-root={node.depth === 0 ? "" : undefined}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

/** One of the owner's two transactions, as the tile carrying it needs it. */
interface TileAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ChainTree({
  nodes,
  owner,
  fund,
  spawn,
}: {
  nodes: ChainNode[];
  owner: string | null;
  /* The two actions live on the tiles their own figures are on: funding under
     the money, spawning under the count of agents. They were a pair of cards
     at the foot of the screen, each holding one button and a paragraph, which
     put the thing you do furthest from the thing it does. A visitor reading
     the public tree passes neither. */
  fund?: TileAction;
  spawn?: TileAction;
}) {
  const root = nodes.find((node) => node.parent === null);
  const cutNodes = nodes.filter((node) => node.revoked).length;
  const liveNodes = nodes.length - cutNodes;
  const deepest = nodes.reduce((most, node) => Math.max(most, node.depth), 0);
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
      {/* The two figures and the rows they summarise, side by side.

          The table used to sit under a drawing under the tiles, so reading a
          node's line meant scrolling past both. The tiles are the summary of
          this table; a summary belongs beside what it summarises. */}
      <div className="tree__top">
      <Grid columns={2} min={200} gap="md" align="start" className="tree__tiles">
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
          action={fund}
        />

        {/* A count is a figure, and it was set as a heading over a paragraph.
            It gets the same tile the window does — the dot face, the caption
            under it — because a reader scanning this screen is looking for
            numbers and this is one of the two on it. */}
        <MetricCard
          title={
            <>
              Agents under this mandate
              <br />
              Derived, never counted for you
            </>
          }
          value={String(nodes.length)}
          unit={nodes.length === 1 ? "node" : "nodes"}
          figure={<DepthFigure nodes={nodes} />}
          caption={
            <>
              {liveNodes} live{cutNodes > 0 ? `, ${cutNodes} cut` : ""} · {deepest + 1}{" "}
              {deepest === 0 ? "level" : "levels"} deep
              <br />
              every id derived from {owner ? "your address" : "the owner's address"}
            </>
          }
          glaze="ember"
          action={spawn}
        />
      </Grid>

      {/* Named, because the setup screen's "cut any branch" lands here: the
          revoke is per node and this is where the nodes are.

          The drawing had a section of its own — a card carrying a paragraph, a
          count of nodes, a count of levels and a count of cuts, all of which
          the table below was printing already. What was left worth keeping is
          the door, and a door belongs on the thing it opens. */}
      <div id="nodes" className="tree__nodes">
      <Section
        title="every node, as figures"
        aside={
          <Stack direction="row" gap="md" align="center" wrap>
            <Enforced>{ENFORCED_BY.treeBar}</Enforced>
            <TreePlayground nodes={nodes} />
          </Stack>
        }
      >
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
              id: "operator",
              header: "Operator",
              cell: (node) => (
                <span className="mono">
                  {node.operator.slice(0, 8)}…{node.operator.slice(-4)}
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
      </div>
      </div>

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
  nodes,
  root,
  owner,
  onDone,
}: {
  nodes: ChainNode[];
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
  /** Which of the two actions the owner has asked for, if either. */
  const [asking, setAsking] = useState<"fund" | "spawn" | null>(null);

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

  const working = funding.status === "working" || spawning.status === "working";

  return (
    <>
      {/* The tree, with the owner's two transactions on the tiles their own
          figures are on.

          They were two cards at the foot of the screen, each carrying one
          button under a paragraph explaining it — which is a lot of surface
          for two verbs, and it put funding as far from the money as the screen
          allows. A tile already says what it measures; the action that changes
          that measurement belongs on it. The explanations move into the
          dialogs, which is where somebody who has decided is reading. */}
      <ChainTree
        nodes={nodes}
        owner={owner}
        fund={{
          label: funding.status === "working" ? funding.step : "Fund the vault",
          onClick: () => setAsking("fund"),
          disabled: working,
        }}
        spawn={{
          label: spawning.status === "working" ? spawning.step : "Spawn a child",
          onClick: () => setAsking("spawn"),
          disabled: working,
        }}
      />

      <Modal
        open={asking === "fund"}
        onClose={() => setAsking(null)}
        title="Fund the vault"
        description="USDC leaves your wallet for the vault. Only you can take it back out, and only a draw the contract allows can move it anywhere else."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={funding.status === "working" || usdc6(amount) <= 0n}
              onClick={() => {
                setAsking(null);
                void fund(root.node, usdc6(amount));
              }}
            >
              {funding.status === "working" ? funding.step : `Fund ${formatUsdc(usdc6(amount))}`}
            </Button>
          </>
        }
      >
        <Field
          label="Amount"
          info="Two transactions: an approval for the vault to take this much, then the funding itself. Your wallet will ask twice."
        >
          <TextField
            type="number"
            value={amount}
            suffix="USDC"
            autoFocus
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={asking === "spawn"}
        onClose={() => setAsking(null)}
        title="Spawn a child"
        description="A child mandate, narrower than this one on every axis. The contract refuses a wider one no matter who asks, including you."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                spawning.status === "working" ||
                !isAddress(operator) ||
                childBudget6 <= 0n ||
                childBudget6 > root.budget6
              }
              onClick={() => {
                setAsking(null);
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
                });
              }}
            >
              {spawning.status === "working" ? spawning.step : "Spawn"}
            </Button>
          </>
        }
      >
        <Stack direction="column" gap="md" align="stretch">
          <Field
            label="Operator address"
            info="The daemon key that will draw for this child — another address from `cordon init`, not the one you are signed in with. The agent above it never holds this key."
          >
            <TextField
              value={operator}
              placeholder="0x…"
              autoFocus
              onChange={(event) => setOperator(event.target.value)}
            />
          </Field>
          <Field
            label="Share of the parent"
            info="A share and not an amount: window, lifetime and tranche all scale together, so what you pick cannot be wider than the mandate above it on one axis and narrower on another."
          >
            <TextField
              type="number"
              value={share}
              suffix="%"
              onChange={(event) => setShare(event.target.value)}
            />
          </Field>
          <Text variant="caption" tone="dim" as="p">
            {formatUsdc(childBudget6)} of {formatUsdc(root.budget6)} per window.
          </Text>
        </Stack>
      </Modal>
    </>
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
        figures={false}
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

  /* Arriving at the node table from somewhere that named it.
   *
   * The setup screen's "cut any branch" points here, and a router that changes
   * the path without moving the page leaves a reader at the top of a screen
   * whose first two thirds are tiles. It waits for the read, because the table
   * does not exist until the chain has answered, and it runs once per arrival
   * so a re-render does not drag the page back down under somebody who has
   * scrolled away. */
  const { hash } = useLocation();
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    if (hash !== "#nodes" || chain.state !== "read") return;
    if (arrived.current === hash) return;
    const target = document.getElementById("nodes");
    if (!target) return;
    arrived.current = hash;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [hash, chain.state]);

  /* Privy restores its session asynchronously. Deciding whose tree to draw
     before it has finished shows an owner the public one and then swaps it. */
  if (!ready) return <TreeSkeleton note="restoring this session…" />;

  /* A wallet that has mandates is about to be shown them, and the sample tree
     in the meantime is somebody else's numbers under their own heading. Show
     the shape and nothing in it until the chain has answered. */
  if (chain.state === "looking") return <TreeSkeleton note={`reading ${ARC.name}…`} />;

  /* The chain was asked and did not answer. Every figure on this screen is
     captioned as read from the contract that enforces it, so the one thing it
     must never do is draw a tree that is missing a branch — which is exactly
     what it did while a failed read was swallowed one node at a time and a
     rate limit read as the end of a sequence. */
  if (chain.state === "failed") {
    return (
      <>
        <ScreenHead
          title="The chain did not answer."
          lede="This tree is read from the registry and the vault directly, so there is no cached copy of it to fall back on. A shorter tree would be a screen that quietly disagrees with the contract, which is worse than an empty one."
          note="read failed"
          figures={false}
        />
        <Card>
          <CardBody>
            <Text variant="body" tone="copy" as="p" className="mono">
              {chain.why}
            </Text>
          </CardBody>
        </Card>
      </>
    );
  }

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
        {/* Funding and spawning are the owner's, and the owner is the address
            that signed the mandate. A visitor reading the public tree gets the
            same tree with no controls on its tiles, rather than buttons that
            would fail at the wallet. */}
        {mine && rootOf(chain.nodes) && address ? (
          <Operate
            nodes={chain.nodes}
            root={rootOf(chain.nodes)!}
            owner={address}
            onDone={() => window.location.reload()}
          />
        ) : (
          <ChainTree nodes={chain.nodes} owner={mine ? address : null} />
        )}
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
