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
import { conductOf, type Ledger, type NodeRow } from "../../meter/src/index.ts";
/* The response shape lives in fixtures, where the public page reads it too. A
   body drawn by a surface and a body returned by a server are one fact, and
   this project has already paid twice for writing one fact down in two
   places. */
import type { Attestation } from "../../fixtures/src/preview.ts";

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
    /* The terms come from the meter's own projection rather than being read
       off the row a second time here: the public page reads the same fields
       from the same function, and two copies of one fact is what this
       repository keeps paying for. */
    mandate: {
      live: conduct.mandate.live,
      revoked: conduct.mandate.revoked,
      root: conduct.mandate.root,
      parent: conduct.mandate.parent,
      depth: conduct.mandate.depth,
      operator: conduct.mandate.operator,
      budget6: conduct.mandate.budget6.toString(),
      lifetimeCap6: conduct.mandate.lifetimeCap6.toString(),
    },
    conduct: {
      draws: conduct.draws,
      refusals: conduct.refusals,
      breaches: conduct.breaches,
      drawn6: conduct.drawn6.toString(),
      refused6: conduct.refused6.toString(),
      lifetimeSpent6: conduct.lifetime.spent6.toString(),
      /* False means this answer was built from a range that starts after the
         mandate was opened, so the total is a floor rather than the figure.
         The payer is told, because a total that is quietly short is worse
         than one that is absent. */
      lifetimeComplete: conduct.lifetime.complete,
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

export type { Attestation };
