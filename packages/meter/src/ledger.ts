/**
 * The ledger: what the chain said, folded into the shape a page renders.
 *
 * Arc is public with sub-second deterministic finality, so **its events are
 * the log**. This file is a pure reducer over those events and nothing else —
 * no reads, no clock, no network. Feed it the same events in the same order
 * and it produces the same ledger, which is what "the cache is rebuildable
 * from chain" has to mean if it is to mean anything.
 *
 * Two disciplines hold here, and both are easy to lose:
 *
 * 1. **Only facts the chain emitted.** Counts and sums, each traceable to an
 *    event and a transaction. No score, no rate, no "risk". A number that is
 *    not in an event and is not enforced by a contract does not belong in a
 *    ledger a surface renders.
 * 2. **The live bounds are read from the vault, not recomputed here.** The
 *    contract's concentration and window figures are window-scoped and roll;
 *    an all-time total computed from history would look like the same number
 *    and refuse nothing. The totals below are labelled for what they are.
 */
import type { Address, Hex } from "viem";

/** Mirrors TreeVault.Reason. The order is part of the ABI. */
export const REASONS = [
  "none",
  "revoked",
  "tranche-cap",
  "window-budget",
  "concentration",
  "vault-balance",
  /* Appended, never inserted: the index is the on-chain enum value, so a new
     reason goes on the end or every stored refusal changes meaning. */
  "lifetime-cap",
] as const;
export type Reason = (typeof REASONS)[number];

/** Where an event happened. Every row keeps this, because "here are the
 *  transactions" is the claim the record is built on. */
export interface Site {
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

export type Event =
  | ({ kind: "MandateOpened"; node: Hex; owner: Address; operator: Address; budget6: bigint; lifetimeCap6: bigint; windowSeconds: number; maxDepth: number } & Site)
  | ({ kind: "MandateSpawned"; node: Hex; parent: Hex; operator: Address; budget6: bigint; lifetimeCap6: bigint; depth: number } & Site)
  | ({ kind: "MandateRevoked"; node: Hex; by: Address } & Site)
  | ({ kind: "Funded"; root: Hex; from: Address; amount6: bigint } & Site)
  | ({ kind: "Withdrawn"; root: Hex; to: Address; amount6: bigint } & Site)
  | ({ kind: "Drawn"; node: Hex; counterparty: Address; beneficiary: Address; amount6: bigint; root: Hex } & Site)
  | ({ kind: "AncestorDebited"; node: Hex; ancestor: Hex; amount6: bigint; spent6: bigint; budget6: bigint } & Site)
  | ({ kind: "Refused"; refusalId: bigint; node: Hex; breachedAt: Hex; counterparty: Address; amount6: bigint; reason: Reason } & Site)
  | ({ kind: "Released"; refusalId: bigint; by: Address; counterparty: Address; amount6: bigint } & Site)
  | ({ kind: "Bound"; node: Hex; agentId: bigint; operator: Address } & Site)
  | ({ kind: "Attested"; refusalId: bigint; node: Hex; agentId: bigint; recordHash: Hex } & Site);

export interface NodeRow {
  node: Hex;
  parent: Hex | null;
  root: Hex;
  operator: Address;
  depth: number;
  budget6: bigint;
  /** The total this mandate may ever draw. It never rolls, so unlike
   *  `budget6` it is not a rate — see `lifetimeOf`. */
  lifetimeCap6: bigint;
  revoked: boolean;
  /** ERC-8004 identity, once its operator bound one. */
  agentId: bigint | null;

  /** Draws this node made that the contract released. */
  draws: number;
  /** Draws this node made that the contract refused. */
  refusals: number;
  /**
   * Refusals where THIS node's bound is what stopped the draw — usually a
   * descendant's. A parent with breaches and no refusals of its own is doing
   * exactly what it exists for.
   */
  breaches: number;
  drawn6: bigint;
  refused6: bigint;
  /** Ancestor debit landing here, including this node's own draws. */
  debited6: bigint;
  /** Declared spend per counterparty, all-time. Not the enforced window. */
  counterparties: Record<Address, bigint>;
  openedAt: Site;
}

export interface RefusalRow {
  id: bigint;
  node: Hex;
  breachedAt: Hex;
  counterparty: Address;
  amount6: bigint;
  reason: Reason;
  /** The transaction the refusal is in. This is the linkage, and it is why
   *  every record Cordon writes has one and 98.7–100% of the registry's do not. */
  site: Site;
  /** A named human signed an exception, later, from their own key. */
  released: { by: Address; site: Site } | null;
  /** Written into the ERC-8004 Reputation Registry from the seat. */
  attested: { agentId: bigint; recordHash: Hex; site: Site } | null;
}

export interface Ledger {
  chainId: number;
  /** The range these facts were read from. A ledger is only as complete as
   *  the range it was built over, and pretending otherwise is how a cache
   *  starts disagreeing with the chain. */
  fromBlock: bigint;
  toBlock: bigint;
  nodes: Record<Hex, NodeRow>;
  refusals: RefusalRow[];
  /** Treasury movements per root, in and out. */
  funded6: Record<Hex, bigint>;
  withdrawn6: Record<Hex, bigint>;
  /** Money a human signed out after a refusal. Counted apart from draws,
   *  because an override is not a purchase inside the bound. */
  released6: bigint;
}

export function emptyLedger(chainId: number, fromBlock = 0n): Ledger {
  return {
    chainId,
    fromBlock,
    /* A ledger that has read nothing covers nothing, and the block before the
       first is the only honest way to say so. Writing `fromBlock` here made an
       unread ledger indistinguishable from one that had read a quiet range,
       which is what made a resumed sync start over from the deploy block. */
    toBlock: fromBlock - 1n,
    nodes: {},
    refusals: [],
    funded6: {},
    withdrawn6: {},
    released6: 0n,
  };
}

/**
 * Fold events into a ledger.
 *
 * Order matters and is the caller's job: block, then log index. The reducer
 * does not sort, because a reducer that quietly reorders its input hides the
 * one bug worth catching — a reader that fetched ranges out of order.
 */
export function reduce(ledger: Ledger, events: Event[]): Ledger {
  for (const event of events) {
    apply(ledger, event);
    if (event.blockNumber > ledger.toBlock) ledger.toBlock = event.blockNumber;
  }
  return ledger;
}

function node(ledger: Ledger, id: Hex): NodeRow | undefined {
  return ledger.nodes[id.toLowerCase() as Hex];
}

function apply(ledger: Ledger, event: Event): void {
  switch (event.kind) {
    case "MandateOpened": {
      ledger.nodes[event.node.toLowerCase() as Hex] = blank(event.node, {
        parent: null,
        root: event.node,
        operator: event.operator,
        depth: 0,
        budget6: event.budget6,
        lifetimeCap6: event.lifetimeCap6,
        openedAt: site(event),
      });
      return;
    }

    case "MandateSpawned": {
      const parent = node(ledger, event.parent);
      ledger.nodes[event.node.toLowerCase() as Hex] = blank(event.node, {
        parent: event.parent,
        /* A child's root is its parent's. If the parent is outside the range
           we read, the root is unknown rather than guessed — an invented root
           would silently attach a subtree to the wrong tree. */
        root: parent ? parent.root : event.parent,
        operator: event.operator,
        depth: event.depth,
        budget6: event.budget6,
        lifetimeCap6: event.lifetimeCap6,
        openedAt: site(event),
      });
      return;
    }

    case "MandateRevoked": {
      const row = node(ledger, event.node);
      if (row) row.revoked = true;
      return;
    }

    case "Funded": {
      const key = event.root.toLowerCase() as Hex;
      ledger.funded6[key] = (ledger.funded6[key] ?? 0n) + event.amount6;
      return;
    }

    case "Withdrawn": {
      const key = event.root.toLowerCase() as Hex;
      ledger.withdrawn6[key] = (ledger.withdrawn6[key] ?? 0n) + event.amount6;
      return;
    }

    case "Drawn": {
      const row = node(ledger, event.node);
      if (!row) return;
      row.draws += 1;
      row.drawn6 += event.amount6;
      const payee = event.counterparty.toLowerCase() as Address;
      row.counterparties[payee] = (row.counterparties[payee] ?? 0n) + event.amount6;
      return;
    }

    case "AncestorDebited": {
      /* One draw emits one of these per ancestor, including the drawing node
         itself. This is the only number on the tree screen that a per-agent
         wallet cannot produce, so it is kept per ancestor rather than summed
         at the root. */
      const row = node(ledger, event.ancestor);
      if (row) row.debited6 += event.amount6;
      return;
    }

    case "Refused": {
      const row = node(ledger, event.node);
      if (row) {
        row.refusals += 1;
        row.refused6 += event.amount6;
      }
      const bound = node(ledger, event.breachedAt);
      if (bound) bound.breaches += 1;

      ledger.refusals.push({
        id: event.refusalId,
        node: event.node,
        breachedAt: event.breachedAt,
        counterparty: event.counterparty,
        amount6: event.amount6,
        reason: event.reason,
        site: site(event),
        released: null,
        attested: null,
      });
      return;
    }

    case "Released": {
      const refusal = ledger.refusals.find((r) => r.id === event.refusalId);
      if (refusal) refusal.released = { by: event.by, site: site(event) };
      ledger.released6 += event.amount6;
      return;
    }

    case "Bound": {
      const row = node(ledger, event.node);
      if (row) row.agentId = event.agentId;
      return;
    }

    case "Attested": {
      const refusal = ledger.refusals.find((r) => r.id === event.refusalId);
      if (refusal) {
        refusal.attested = { agentId: event.agentId, recordHash: event.recordHash, site: site(event) };
      }
      return;
    }
  }
}

function site(event: Site): Site {
  return {
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
    logIndex: event.logIndex,
  };
}

function blank(
  id: Hex,
  fields: Pick<NodeRow, "parent" | "root" | "operator" | "depth" | "budget6" | "lifetimeCap6" | "openedAt">,
): NodeRow {
  return {
    node: id,
    ...fields,
    revoked: false,
    agentId: null,
    draws: 0,
    refusals: 0,
    breaches: 0,
    drawn6: 0n,
    refused6: 0n,
    debited6: 0n,
    counterparties: {},
  };
}

/* ------------------------------------------------------------------ */
/* Views — the numbers the pages ask for, derived in one place          */
/* ------------------------------------------------------------------ */

/** Every node under `root`, the root included, in depth order. */
export function subtree(ledger: Ledger, root: Hex): NodeRow[] {
  const key = root.toLowerCase();
  return Object.values(ledger.nodes)
    .filter((n) => n.root.toLowerCase() === key)
    .sort((a, b) => a.depth - b.depth || a.node.localeCompare(b.node));
}

/** The refusals belonging to one node, newest last. */
export function refusalsOf(ledger: Ledger, node: Hex): RefusalRow[] {
  const key = node.toLowerCase();
  return ledger.refusals.filter((r) => r.node.toLowerCase() === key);
}

/**
 * The conduct record for one agent, as the public page states it: breaches out
 * of draws, and every breach linked to its transaction.
 *
 * `linkage` is the comparison the page prints. It is 1 by construction — every
 * refusal here came out of an event that has a transaction hash — and it is
 * computed rather than asserted so that a bug which loses a hash shows up as a
 * number below 1 instead of as a sentence that is quietly untrue.
 */
export interface Conduct {
  node: Hex;
  agentId: bigint | null;
  /** The total signed for and what is left of it. A record that shows only a
   *  window shows a rate, and a reader takes a rate for a total. */
  lifetime: Lifetime;
  draws: number;
  refusals: number;
  breaches: number;
  drawn6: bigint;
  refused6: bigint;
  attested: number;
  linkage: number;
  rows: RefusalRow[];
}

export function conductOf(ledger: Ledger, nodeId: Hex): Conduct | null {
  const row = node(ledger, nodeId);
  if (!row) return null;
  const rows = refusalsOf(ledger, nodeId);
  const linked = rows.filter((r) => Boolean(r.site.transactionHash)).length;
  return {
    node: row.node,
    agentId: row.agentId,
    lifetime: lifetimeOf(ledger, row),
    draws: row.draws,
    refusals: row.refusals,
    breaches: row.breaches,
    drawn6: row.drawn6,
    refused6: row.refused6,
    attested: rows.filter((r) => r.attested !== null).length,
    linkage: rows.length === 0 ? 1 : linked / rows.length,
    rows,
  };
}

/**
 * What is left of the total the owner signed for, and whether that figure is
 * whole.
 *
 * The lifetime is not in an event of its own: `AncestorDebited` carries the
 * window figures, and one is emitted per ancestor on every draw, so the sum of
 * those debits at a node is what the contract holds in `_lifetimeSpent` — the
 * two are written in the same loop, from the same amount, and neither is
 * touched by a release. Summing them is therefore a reading of the chain
 * rather than a model of it.
 *
 * It is only whole if the ledger read the node from birth. `complete` states
 * that, and a caller that cares must check it: a lifetime total over a partial
 * range is smaller than the truth, which is the direction that flatters. Read
 * `TreeVault.lifetimeSpent(node)` when the answer has to be exact.
 */
export interface Lifetime {
  cap6: bigint;
  spent6: bigint;
  left6: bigint;
  complete: boolean;
}

export function lifetimeOf(ledger: Ledger, row: NodeRow): Lifetime {
  const spent6 = row.debited6;
  return {
    cap6: row.lifetimeCap6,
    spent6,
    left6: row.lifetimeCap6 > spent6 ? row.lifetimeCap6 - spent6 : 0n,
    complete: row.openedAt.blockNumber >= ledger.fromBlock,
  };
}

/** The largest declared counterparty, and what it took. All-time, not the
 *  enforced window — read `TreeVault.concentrationBound` for that. */
export function topCounterparty(row: NodeRow): { payee: Address; amount6: bigint } | null {
  let best: { payee: Address; amount6: bigint } | null = null;
  for (const [payee, amount6] of Object.entries(row.counterparties) as [Address, bigint][]) {
    if (!best || amount6 > best.amount6) best = { payee, amount6 };
  }
  return best;
}
