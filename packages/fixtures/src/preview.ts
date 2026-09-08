/**
 * Frontend preview data.
 *
 * Every figure here is derived from the fixtures beside it, or is a shaped
 * sample of what the indexer will return once the daemon and contracts are
 * wired. Nothing in this file is a chain read, and every surface that renders
 * it says so.
 *
 * It lives in `fixtures` rather than in an app because both surfaces render
 * it: the console shows an owner their own tree, and the public record pages
 * show anyone the same tree's conduct. Two copies of a figure is the one
 * defect this project has already decided it will not ship.
 *
 * Rule 1: the console may not display a number the contract does not enforce.
 * Each figure below therefore carries the function that produces it.
 */
import { MANDATE, ENFORCED_BY, ARC } from "./index.ts";

export type NodeId = string;

export interface TreeNode {
  id: NodeId;
  label: string;
  address: string;
  /** ERC-8004 identity token id for this node. */
  agentId: number;
  depth: number;
  /** TreeVault.windowSpent(node), base units 6dp. */
  spent6: bigint;
  /** MandateRegistry.mandateOf(node).budget, base units 6dp. */
  budget6: bigint;
  /** Share of this node's window taken by its largest counterparty. */
  concentrationPct: number;
  topCounterparty: string;
  refused: number;
  draws: number;
  revoked?: boolean;
  children: TreeNode[];
}

/**
 * The demo tree, and it is over-provisioned on purpose.
 *
 * The two workers are sized $70 and $70 under a $100 root, which is $140 the
 * tree cannot afford. That is the shape the product exists for: nobody knows
 * in advance which branch will need the money, so no branch is throttled by a
 * forecast and the root is the only real total. A tree whose children summed
 * to less than their parent would never once exercise ancestor debit, and
 * every figure on the screen would be explained by the node's own limit.
 */
export const TREE: TreeNode = {
  id: "root",
  label: "orchestrator",
  address: "0x9d41…7c02",
  agentId: 41822,
  depth: 0,
  spent6: 71_420_000n,
  budget6: MANDATE.budget6,
  concentrationPct: 22,
  topCounterparty: "api.aisa.one",
  refused: 3,
  draws: 41_200,
  children: [
    {
      id: "research",
      label: "research-worker",
      address: "0x2b70…9ae1",
      agentId: 41823,
      depth: 1,
      spent6: 38_900_000n,
      budget6: 70_000_000n,
      concentrationPct: 31,
      topCounterparty: "api.aisa.one",
      refused: 1,
      draws: 22_840,
      children: [
        {
          id: "scholar",
          label: "scholar-fetch",
          address: "0x7c19…33fd",
          agentId: 41825,
          depth: 2,
          spent6: 21_400_000n,
          budget6: 70_000_000n,
          concentrationPct: 34,
          topCounterparty: "api.aisa.one",
          refused: 1,
          draws: 14_020,
          children: [],
        },
        {
          id: "prices",
          label: "price-fetch",
          address: "0x51aa…08b4",
          agentId: 41826,
          depth: 2,
          spent6: 17_500_000n,
          budget6: 20_000_000n,
          concentrationPct: 28,
          topCounterparty: "agents.allium.so",
          refused: 0,
          draws: 8_820,
          children: [],
        },
      ],
    },
    {
      id: "enrich",
      label: "enrichment-worker",
      address: "0xc408…12d7",
      agentId: 41824,
      depth: 1,
      spent6: 32_520_000n,
      budget6: 70_000_000n,
      concentrationPct: 47,
      topCounterparty: "api.arkm.com",
      refused: 2,
      draws: 18_360,
      children: [
        {
          id: "arkham",
          label: "address-enrich",
          address: "0xe6f2…5b90",
          agentId: 41827,
          depth: 2,
          spent6: 30_000_000n,
          budget6: 30_000_000n,
          concentrationPct: 61,
          topCounterparty: "api.arkm.com",
          refused: 2,
          draws: 1_180,
          children: [],
        },
      ],
    },
  ],
};

/**
 * What a node may still draw, in total. `TreeVault.headroom(node)`.
 *
 * A node's own budget is an upper bound, not an amount. A grandchild with $30
 * of its own window untouched can still draw nothing if the root two levels
 * above it is full, and a screen that shows the $30 is promising something the
 * contract will refuse. So the figure is the tightest remaining window on the
 * path, and it comes with the node that produced it — a refusal should never
 * be the first time an owner hears which limit was the real one.
 *
 * Concentration is deliberately not folded in. It bounds how the headroom may
 * be split between counterparties, not how much of it there is.
 */
export function headroom(
  node: TreeNode,
  root: TreeNode = TREE,
): { available6: bigint; boundBy: TreeNode } {
  const path = pathTo(node.id, root);
  let available = root.budget6 - root.spent6;
  let boundBy = root;

  for (const step of path) {
    if (step.revoked) return { available6: 0n, boundBy: step };
    const left = step.budget6 - step.spent6;
    if (left < available) {
      available = left;
      boundBy = step;
    }
  }

  return { available6: available < 0n ? 0n : available, boundBy };
}

/** The path from the root down to `id`, inclusive. Empty if `id` is unknown. */
export function pathTo(id: NodeId, from: TreeNode = TREE): TreeNode[] {
  if (from.id === id) return [from];
  for (const child of from.children) {
    const below = pathTo(id, child);
    if (below.length) return [from, ...below];
  }
  return [];
}

export function flatten(node: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(node);
  node.children.forEach((c) => flatten(c, out));
  return out;
}

export interface Refusal {
  id: string;
  node: NodeId;
  nodeLabel: string;
  /** The bound the contract evaluated. Always one of ENFORCED_BY. */
  bound: string;
  boundLabel: string;
  requested6: bigint;
  headroom6: bigint;
  counterparty: string;
  at: string;
  tx: string;
  released: boolean;
}

export const REFUSALS: Refusal[] = [
  {
    id: "r-3",
    node: "arkham",
    nodeLabel: "address-enrich",
    bound: ENFORCED_BY.treeBar,
    boundLabel: "ancestor debit — root window",
    requested6: 200_000_000n,
    headroom6: 28_580_000n,
    counterparty: "api.arkm.com/x402/intelligence/address-enriched-batch",
    at: "2026-09-07 09:41:22Z",
    tx: "0x6c1f9a7be0a54d3f2b8e77c419ad0e5b3f81c92d47ae6b05d1f3a2c88e740b19",
    released: false,
  },
  {
    id: "r-2",
    node: "arkham",
    nodeLabel: "address-enrich",
    bound: ENFORCED_BY.concentration,
    boundLabel: "counterparty concentration",
    requested6: 1_000_000n,
    headroom6: 0n,
    counterparty: "api.arkm.com/x402/balances/entity",
    at: "2026-09-07 08:12:04Z",
    tx: "0x9a03e51cd7b2480fa16c3e9d5528b70f4c1ae836209db47f5c0a1e6b83d2947c",
    released: false,
  },
  {
    id: "r-1",
    node: "scholar",
    nodeLabel: "scholar-fetch",
    bound: ENFORCED_BY.tranche,
    boundLabel: "per-tranche cap",
    requested6: 8_000_000n,
    headroom6: MANDATE.tranche6,
    counterparty: "api.aisa.one/apis/v2/scholar/search/explain",
    at: "2026-09-06 23:55:41Z",
    tx: "0x41bd28e6c093f7a5104b8e2df6390c7ab5e1420d98cf3b6a7e05d419c283f7a0",
    released: true,
  },
];

export interface RecordEntry {
  kind: "draw" | "refusal" | "revocation" | "feedback";
  at: string;
  detail: string;
  amount6?: bigint;
  /** Every record names the draw transaction that produced it. G6. */
  tx: string;
}

export const RECORD: RecordEntry[] = [
  {
    kind: "feedback",
    at: "2026-09-07 09:41:26Z",
    detail: "ReputationRegistry.giveFeedback — breach recorded, tag: ancestor-debit",
    tx: "0x6c1f9a7be0a54d3f2b8e77c419ad0e5b3f81c92d47ae6b05d1f3a2c88e740b19",
  },
  {
    kind: "refusal",
    at: "2026-09-07 09:41:22Z",
    detail: "refused — root window headroom exceeded",
    amount6: 200_000_000n,
    tx: "0x6c1f9a7be0a54d3f2b8e77c419ad0e5b3f81c92d47ae6b05d1f3a2c88e740b19",
  },
  {
    kind: "refusal",
    at: "2026-09-07 08:12:04Z",
    detail: "refused — counterparty concentration bound",
    amount6: 1_000_000n,
    tx: "0x9a03e51cd7b2480fa16c3e9d5528b70f4c1ae836209db47f5c0a1e6b83d2947c",
  },
  {
    kind: "draw",
    at: "2026-09-07 08:11:58Z",
    detail: "tranche released — api.arkm.com/x402/balances/entity",
    amount6: 1_000_000n,
    tx: "0x77f0b3a9e21c48d5069ba3e7c1d84f20395ea6bc7014d9f2a8e35c60b19d4e2f",
  },
  {
    kind: "revocation",
    at: "2026-09-06 19:02:10Z",
    detail: "subtree revoked — draft-writer and 2 descendants",
    tx: "0x0d94ac6e17f3b5820ce49a1d6b7f0523e8ca94f16d203b7e5a8c1f04927db3e6",
  },
];

export const AGENT_PROFILE = {
  agentId: 41827,
  label: "address-enrich",
  owner: MANDATE.owner,
  mandate: MANDATE.id,
  registeredAt: "2026-09-05",
  depth: 2,
  parent: "enrichment-worker",
};

export const txUrl = (tx: string) => `${ARC.explorer}/tx/${tx}`;
export const addrUrl = (a: string) => `${ARC.explorer}/address/${a}`;
export const shortTx = (tx: string) => `${tx.slice(0, 10)}…${tx.slice(-6)}`;
