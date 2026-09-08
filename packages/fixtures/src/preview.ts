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
import { MANDATE, ENFORCED_BY, ARC, PENDING_ADDRESS } from "./index.ts";
import { DEPLOYMENT } from "./deployment.gen.ts";

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
 * The two workers are each sized at 70% of the root, which is 140% of a tree
 * that only has 100%. That is the shape the product exists for: nobody knows
 * in advance which branch will need the money, so no branch is throttled by a
 * forecast and the root is the only real total. A tree whose children summed
 * to less than their parent would never once exercise ancestor debit, and
 * every figure on the screen would be explained by the node's own limit.
 */
/**
 * A node's size, as a share of the root's window in basis points.
 *
 * Written as dollars, every figure in this tree has to be retyped whenever the
 * mandate is resized, and the failure is silent: a child left at $70 under a
 * root resized to $20 is a child larger than the tree it hangs from. The
 * proportions are the illustration; the amounts follow from the mandate.
 */
const share = (bps: number): bigint => (MANDATE.budget6 * BigInt(bps)) / 10_000n;

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/**
 * How many windows of draws this preview tree has behind it.
 *
 * The window rolls and the lifetime does not, so a tree that has only ever run
 * one window shows the same figure twice and teaches a reader that the two
 * bounds are one bound. This says the tree has been working for three windows,
 * which is what makes the total visibly larger than the rate.
 *
 * Every node is multiplied by the same number, so the sums that hold across
 * the tree in one window hold across its life: a parent's lifetime is still
 * its subtree's, and no child's total exceeds the parent that debits for it.
 */
export const WINDOWS_RUN = 3n;

/**
 * The total a node has drawn since it was opened, and what is left of the
 * total the owner signed for. `TreeVault.lifetimeSpent(node)`.
 *
 * The cap is the root's at every depth: a child may be given a narrower total
 * but never a wider one, and this tree gives none of them a narrower one, so
 * the mandate has exactly one total and it is the one on the signature.
 */
export function lifetime(node: TreeNode): {
  cap6: bigint;
  spent6: bigint;
  left6: bigint;
} {
  const spent6 = node.spent6 * WINDOWS_RUN;
  return {
    cap6: MANDATE.lifetimeCap6,
    spent6,
    left6: MANDATE.lifetimeCap6 > spent6 ? MANDATE.lifetimeCap6 - spent6 : 0n,
  };
}

export const TREE: TreeNode = {
  id: "root",
  label: "orchestrator",
  address: "0x9d41…7c02",
  agentId: 41822,
  depth: 0,
  spent6: share(7_142),
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
      spent6: share(3_890),
      budget6: share(7_000),
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
          spent6: share(2_140),
          budget6: share(7_000),
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
          spent6: share(1_750),
          budget6: share(2_000),
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
      spent6: share(3_252),
      budget6: share(7_000),
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
          spent6: share(3_000),
          budget6: share(3_000),
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
  let available = min(root.budget6 - root.spent6, lifetime(root).left6);
  let boundBy = root;

  for (const step of path) {
    if (step.revoked) return { available6: 0n, boundBy: step };
    /* Two bounds on one node, and the answer is the tighter one. A headroom
       that reports only the window promises money the lifetime will refuse. */
    const left = min(step.budget6 - step.spent6, lifetime(step).left6);
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
  /**
   * Who signed the exception, and where it is. `released` stays a boolean
   * because three views count with it; this is the detail the public page
   * needs, and it is present exactly when `released` is true.
   *
   * A release pays the refused counterparty without moving the bound it
   * stepped around, so it is a separate transaction from the refusal and
   * carries its own signer. Recording only "released: true" would hide the
   * one thing that makes an override accountable: a name.
   */
  release?: { by: string; at: string; tx: string };
  /**
   * Where the refusal was published, when it was. Absent means the recorder
   * had no seat or has not caught up — never that the refusal did not happen,
   * which is why the page says which of those it is looking at.
   */
  attested?: { agentId: number; at: string; tx: string };
}

export const REFUSALS: Refusal[] = [
  {
    id: "r-3",
    node: "arkham",
    nodeLabel: "address-enrich",
    bound: ENFORCED_BY.treeBar,
    boundLabel: "ancestor debit, at the root window",
    requested6: 200_000_000n,
    /* What the root window had left, which is the whole point of this refusal:
       the node's own limit was untouched and an ancestor's was not. Derived,
       because a headroom typed beside a budget it no longer matches is the
       figure a reader would use to check the arithmetic. */
    headroom6: MANDATE.budget6 - TREE.spent6,
    counterparty: "api.arkm.com/x402/intelligence/address-enriched-batch",
    at: "2026-09-07 09:41:22Z",
    tx: "0x6c1f9a7be0a54d3f2b8e77c419ad0e5b3f81c92d47ae6b05d1f3a2c88e740b19",
    released: false,
    attested: {
      agentId: 41827,
      at: "2026-09-07 09:41:26Z",
      tx: "0x6c1f9a7be0a54d3f2b8e77c419ad0e5b3f81c92d47ae6b05d1f3a2c88e740b19",
    },
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
    attested: {
      agentId: 41827,
      at: "2026-09-07 08:12:09Z",
      tx: "0x9a03e51cd7b2480fa16c3e9d5528b70f4c1ae836209db47f5c0a1e6b83d2947c",
    },
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
    release: {
      by: MANDATE.owner,
      at: "2026-09-07 07:20:11Z",
      tx: "0xb52ce7401f8a396d2074cbe15a9df3806e1c4a72953bd0f6817e2c4a90db5f31",
    },
    attested: {
      agentId: 41827,
      at: "2026-09-06 23:55:47Z",
      tx: "0x41bd28e6c093f7a5104b8e2df6390c7ab5e1420d98cf3b6a7e05d419c283f7a0",
    },
  },
];

/**
 * Resolve what the chain wrote into what this preview holds.
 *
 * `ConductRecord.RECORD_BASE` is compiled into the contract as
 * `https://getcordon.xyz/refusal/`, and the path it appends is
 * `TreeVault`'s refusal id: a plain decimal counter starting at 1. The ids in
 * this file read `r-1`, so the two forms have to meet somewhere, and this is
 * the somewhere — one resolver rather than a slice in a component, because
 * the day the page and the record disagree about which refusal `3` is, the
 * page will look fine.
 *
 * Both forms are accepted. Anything else resolves to nothing, and the caller
 * says so rather than falling back to the first row: a record URI that
 * silently shows a different refusal is worse than one that 404s.
 */
export function refusalByPath(path: string | undefined): Refusal | undefined {
  if (!path) return undefined;
  const id = /^\d+$/.test(path) ? `r-${path}` : path;
  return REFUSALS.find((refusal) => refusal.id === id);
}

/** The decimal id the chain writes, for a refusal held in this form. */
export const refusalOrdinal = (refusal: Refusal): string => refusal.id.replace(/^r-/, "");

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
    detail: "breach recorded in the reputation registry, tagged ancestor-debit",
    tx: "0x6c1f9a7be0a54d3f2b8e77c419ad0e5b3f81c92d47ae6b05d1f3a2c88e740b19",
  },
  {
    kind: "refusal",
    at: "2026-09-07 09:41:22Z",
    detail: "refused, no room left in the root window",
    amount6: 200_000_000n,
    tx: "0x6c1f9a7be0a54d3f2b8e77c419ad0e5b3f81c92d47ae6b05d1f3a2c88e740b19",
  },
  {
    kind: "refusal",
    at: "2026-09-07 08:12:04Z",
    detail: "refused, this seller has taken its share",
    amount6: 1_000_000n,
    tx: "0x9a03e51cd7b2480fa16c3e9d5528b70f4c1ae836209db47f5c0a1e6b83d2947c",
  },
  {
    kind: "draw",
    at: "2026-09-07 08:11:58Z",
    detail: "tranche released for api.arkm.com/x402/balances/entity",
    amount6: 1_000_000n,
    tx: "0x77f0b3a9e21c48d5069ba3e7c1d84f20395ea6bc7014d9f2a8e35c60b19d4e2f",
  },
  {
    kind: "revocation",
    at: "2026-09-06 19:02:10Z",
    detail: "subtree revoked: draft-writer and 2 descendants",
    tx: "0x0d94ac6e17f3b5820ce49a1d6b7f0523e8ca94f16d203b7e5a8c1f04927db3e6",
  },
];

/**
 * The refusal a ledger row is about, when it is about one.
 *
 * A `RecordEntry` names its transaction and nothing else, and that stays the
 * case: the transaction is the fact, and giving the row a refusal id of its
 * own would write one linkage down twice and let the two drift apart. So the
 * join is computed here, once, from the field both sides already carry.
 *
 * Only the kinds that describe a refusal join. A draw never shares a
 * transaction with a refusal, and a revocation is about a subtree rather than
 * a draw, so neither is handed a link it would have to invent.
 */
export function refusalForRecord(entry: RecordEntry): Refusal | undefined {
  if (entry.kind !== "refusal" && entry.kind !== "feedback") return undefined;
  return REFUSALS.find((refusal) => refusal.tx === entry.tx);
}

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

/* ------------------------------------------------------------------ */
/* /attest — the response, and a sample of it                          */
/* ------------------------------------------------------------------ */

/**
 * What `GET /attest/<8004-id>` returns.
 *
 * The type lives here rather than in the server because two surfaces render
 * it: `packages/attest` builds one from the chain, and the public page shows a
 * sample of the same object. A page that draws a body the endpoint does not
 * return is the same defect as a figure the contract does not enforce, and it
 * is the one this project keeps finding: one fact written down twice.
 *
 * Every amount is a base-unit string. Money is never a JSON number.
 */
export interface Attestation {
  agentId: string;
  node: string;
  /** Facts about the mandate, not a judgement about the agent. */
  mandate: {
    live: boolean;
    revoked: boolean;
    root: string;
    parent: string | null;
    depth: number;
    operator: string;
    budget6: string;
    /** The total the owner signed for. `budget6` is what may be drawn in one
     *  window and it resets; this does not, and the binding limit is whichever
     *  is reached first. A reader given only the first takes a rate for a
     *  total. */
    lifetimeCap6: string;
  };
  conduct: {
    draws: number;
    refusals: number;
    breaches: number;
    drawn6: string;
    refused6: string;
    /** Drawn since the mandate was opened, across every window. Whole only if
     *  `range` reaches back to the node's own opening; `lifetimeComplete` says
     *  whether it does. */
    lifetimeSpent6: string;
    lifetimeComplete: boolean;
    attested: number;
    /** Share of refusals carrying a transaction hash. 1 by construction. */
    linkage: number;
  };
  refusals: {
    id: string;
    reason: string;
    amount6: string;
    counterparty: string;
    breachedAt: string;
    blockNumber: string;
    transactionHash: string;
    released: boolean;
    attested: boolean;
  }[];
  /** How far the answer reaches. A record is only as complete as its range. */
  range: { chainId: number; fromBlock: string; toBlock: string };
  /** Where to check every line of it. */
  verify: { vault: string; registry: string; record?: string; explorer: string };
}

/**
 * The three contracts are written by the deploy script into
 * `deployments/<chainId>.json`, folded into `deployment.gen.ts` and read from
 * there. Until that file names a deployment they are `pending`, and the sample
 * says so rather than carrying an address nobody can open.
 */

/** The block range this sample covers. Marked as a sample, not a chain read. */
const SAMPLE_RANGE = { fromBlock: "0", toBlock: "pending" };

/** Which bound refused a draw, in the vault's own vocabulary. */
const REASONS: Record<string, string> = {
  [ENFORCED_BY.tranche]: "tranche-cap",
  [ENFORCED_BY.treeBar]: "window-budget",
  [ENFORCED_BY.concentration]: "concentration",
  [ENFORCED_BY.revoke]: "revoked",
  [ENFORCED_BY.lifetime]: "lifetime-cap",
};

/**
 * The sample body for one node, in the exact shape the endpoint returns.
 *
 * Built from the same preview tree the console renders, so the page cannot
 * drift from the rest of the surface either. `breaches` is deliberately not
 * `refusals`: a refusal is filed against the node that drew, and a breach
 * against the node whose bound stopped it, which is usually an ancestor.
 */
export function attestationOf(node: TreeNode, root: TreeNode = TREE): Attestation {
  const path = pathTo(node.id, root);
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const mine = REFUSALS.filter((refusal) => refusal.node === node.id);
  const breaches = REFUSALS.filter(
    (refusal) => refusal.node !== node.id && pathTo(refusal.node, node).length > 0,
  ).length;

  return {
    agentId: `${node.agentId}`,
    node: node.address,
    mandate: {
      live: !node.revoked,
      revoked: Boolean(node.revoked),
      root: root.address,
      parent: parent ? parent.address : null,
      depth: node.depth,
      operator: node.address,
      budget6: node.budget6.toString(),
      lifetimeCap6: lifetime(node).cap6.toString(),
    },
    conduct: {
      draws: node.draws,
      refusals: node.refused,
      breaches,
      drawn6: node.spent6.toString(),
      lifetimeSpent6: lifetime(node).spent6.toString(),
      /* A sample covers the whole life of a tree it invented. A real answer
         says so from its range. */
      lifetimeComplete: true,
      refused6: mine.reduce((total, refusal) => total + refusal.requested6, 0n).toString(),
      /* Read off the refusal, not inferred from `released`. This was
         `!refusal.released`, which said a refusal the owner later signed off
         was never published — the daemon publishes every refusal with no
         filter, before anyone decides anything about it, so a release cannot
         retract a record. Two rules for one field, and the derived one was
         the wrong rule. */
      attested: mine.filter((refusal) => Boolean(refusal.attested)).length,
      /* Computed, never asserted. A bug that loses a transaction hash has to
         show up as a number below 1 rather than as a sentence that is quietly
         untrue. */
      linkage: mine.length === 0 ? 1 : mine.filter((r) => Boolean(r.tx)).length / mine.length,
    },
    refusals: mine.map((refusal) => ({
      id: refusal.id,
      reason: REASONS[refusal.bound] ?? "window-budget",
      amount6: refusal.requested6.toString(),
      counterparty: refusal.counterparty,
      breachedAt: refusal.bound === ENFORCED_BY.treeBar ? root.address : node.address,
      blockNumber: "pending",
      transactionHash: refusal.tx,
      released: refusal.released,
      attested: Boolean(refusal.attested),
    })),
    range: { chainId: ARC.chainId, ...SAMPLE_RANGE },
    verify: {
      vault: DEPLOYMENT?.vault ?? PENDING_ADDRESS,
      registry: DEPLOYMENT?.registry ?? PENDING_ADDRESS,
      record: DEPLOYMENT?.record ?? PENDING_ADDRESS,
      explorer: ARC.explorer,
    },
  };
}
