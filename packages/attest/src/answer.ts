/**
 * What a payer gets for their $0.001.
 *
 * The same facts `/agent/<id>` shows a human, in the shape a machine reads.
 * Every line is either an event the chain emitted or a count of them, and
 * every refusal carries the transaction it happened in, so the buyer of this
 * answer can check it against Arc without trusting this process at all. That
 * is the point of selling it: the value is the seat that produced the record,
 * not the server that serves it.
 *
 * There is no score here, and there will not be one. A score is an opinion,
 * an opinion is what the ERC-8004 baseline already has too much of, and the
 * whole argument of the record is that a measurement is a different object.
 */
import type { Hex } from "viem";
import { conductOf, type Ledger, type NodeRow } from "../../meter/src/index.ts";

export interface Attestation {
  agentId: string;
  node: Hex;
  /** Facts about the mandate, not a judgement about the agent. */
  mandate: {
    live: boolean;
    revoked: boolean;
    root: Hex;
    parent: Hex | null;
    depth: number;
    operator: string;
    budget6: string;
  };
  conduct: {
    draws: number;
    refusals: number;
    breaches: number;
    drawn6: string;
    refused6: string;
    attested: number;
    /** Share of refusals carrying a transaction hash. 1 by construction. */
    linkage: number;
  };
  refusals: {
    id: string;
    reason: string;
    amount6: string;
    counterparty: string;
    breachedAt: Hex;
    blockNumber: string;
    transactionHash: Hex;
    released: boolean;
    attested: boolean;
  }[];
  /** How far the answer reaches. A record is only as complete as its range. */
  range: { chainId: number; fromBlock: string; toBlock: string };
  /** Where to check every line of it. */
  verify: { vault: string; registry: string; record?: string; explorer: string };
}

export interface Sources {
  vault: string;
  registry: string;
  record?: string;
  explorer: string;
}

/** The node an ERC-8004 identity is bound to, or null. Free to ask: a payer
 *  must never be charged for an answer this range does not contain. */
export function nodeForAgent(ledger: Ledger, agentId: bigint): NodeRow | null {
  if (agentId === 0n) return null;
  return Object.values(ledger.nodes).find((n) => n.agentId === agentId) ?? null;
}

export function attestation(ledger: Ledger, row: NodeRow, sources: Sources): Attestation {
  const conduct = conductOf(ledger, row.node)!;
  return {
    agentId: (row.agentId ?? 0n).toString(),
    node: row.node,
    mandate: {
      /* "Live" is a fact with two parts, both from events: the mandate was
         opened and it was not revoked. Whether it has headroom right now is a
         window question the vault answers, not history. */
      live: !row.revoked,
      revoked: row.revoked,
      root: row.root,
      parent: row.parent,
      depth: row.depth,
      operator: row.operator,
      budget6: row.budget6.toString(),
    },
    conduct: {
      draws: conduct.draws,
      refusals: conduct.refusals,
      breaches: conduct.breaches,
      drawn6: conduct.drawn6.toString(),
      refused6: conduct.refused6.toString(),
      attested: conduct.attested,
      linkage: conduct.linkage,
    },
    refusals: conduct.rows.map((r) => ({
      id: r.id.toString(),
      reason: r.reason,
      amount6: r.amount6.toString(),
      counterparty: r.counterparty,
      breachedAt: r.breachedAt,
      blockNumber: r.site.blockNumber.toString(),
      transactionHash: r.site.transactionHash,
      released: r.released !== null,
      attested: r.attested !== null,
    })),
    range: {
      chainId: ledger.chainId,
      fromBlock: ledger.fromBlock.toString(),
      toBlock: ledger.toBlock.toString(),
    },
    verify: sources,
  };
}
