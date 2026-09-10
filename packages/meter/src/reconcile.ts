/**
 * Reconciliation: does the money outside the vault match what the vault let out?
 *
 * `TreeVault.draw` tops up a node operator's Gateway balance and emits a
 * `Drawn` event saying so. After that the money is in Circle's custody and is
 * spent by an off-chain EIP-3009 signature that no contract sees — that is the
 * fast lane, and it is deliberately not ours. What can still be checked, from
 * chain state alone, is the direction that would matter:
 *
 *     an operator's Gateway balance must never exceed what the vault released
 *     to it.
 *
 * If it does, the money came from somewhere other than the tree, and the claim
 * that the vault is the only funding source is false for that node. It is a
 * one-sided check on purpose: a balance *below* the total released is the
 * ordinary case — it means the agent bought something.
 *
 * The other half — matching each declared counterparty against the seller who
 * was actually paid — needs Circle's `search-x402transfers`, and whether a
 * buyer can read their own transfers is unresolved (risk 5 in the plan). It is
 * reported as `unavailable` rather than approximated, because a reconciliation
 * that quietly compares nothing always passes.
 */
import { parseAbi, type Address, type PublicClient } from "viem";
import type { Ledger } from "./ledger.ts";

const GATEWAY = parseAbi([
  "function availableBalance(address token, address depositor) view returns (uint256)",
]);

export interface OperatorRow {
  operator: Address;
  /** Nodes this key operates. One daemon may hold several. */
  nodes: number;
  /** Of those, how many are still live. A cut node can draw nothing. */
  liveNodes: number;
  /** Everything the vault released to this operator, all-time, from events. */
  released6: bigint;
  /** What Circle says it can still spend, read from the Gateway contract. */
  available6: bigint;
  /** False means this operator holds money the vault did not release to it. */
  withinRelease: boolean;
}

export interface Reconciliation {
  chainId: number;
  toBlock: bigint;
  operators: OperatorRow[];
  /**
   * True when every operator of a **live** node is inside what the vault
   * released to it.
   *
   * The distinction was found by the hostile drill: an agent may name any
   * address as its child's operator, and naming one that already holds a
   * Gateway balance imports a stranger's money into this tree's arithmetic.
   * The answer is to cut that node — which the owner or any ancestor operator
   * can do in one transaction — and a cut node can draw nothing afterwards.
   * Its row stays visible below, because a reconciliation that drops what it
   * cannot explain is a reconciliation that always passes.
   */
  ok: boolean;
  /**
   * Seller-side matching, which needs an API this project has not been able to
   * verify a buyer can read. `pending` is a value here, not a placeholder to
   * be tidied away later.
   */
  counterpartyMatching: "unavailable";
}

export async function reconcileGateway(
  client: PublicClient,
  ledger: Ledger,
  contracts: { gateway: Address; usdc: Address },
): Promise<Reconciliation> {
  /* Draws are attributed to nodes, and `TreeVault.draw` credits the drawing
     node's own operator. Summing by operator is therefore the same money,
     grouped the way the Gateway holds it. */
  const released = new Map<Address, { released6: bigint; nodes: number; liveNodes: number }>();
  for (const row of Object.values(ledger.nodes)) {
    const key = row.operator.toLowerCase() as Address;
    const entry = released.get(key) ?? { released6: 0n, nodes: 0, liveNodes: 0 };
    entry.released6 += row.drawn6;
    entry.nodes += 1;
    if (!row.revoked) entry.liveNodes += 1;
    released.set(key, entry);
  }

  const operators: OperatorRow[] = [];
  for (const [operator, entry] of released) {
    const available6 = (await client.readContract({
      address: contracts.gateway,
      abi: GATEWAY,
      functionName: "availableBalance",
      args: [contracts.usdc, operator],
    })) as bigint;

    operators.push({
      operator,
      nodes: entry.nodes,
      liveNodes: entry.liveNodes,
      released6: entry.released6,
      available6,
      withinRelease: available6 <= entry.released6,
    });
  }

  operators.sort((a, b) => (b.released6 > a.released6 ? 1 : b.released6 < a.released6 ? -1 : 0));

  return {
    chainId: ledger.chainId,
    toBlock: ledger.toBlock,
    operators,
    ok: operators.every((operator) => operator.liveNodes === 0 || operator.withinRelease),
    counterpartyMatching: "unavailable",
  };
}
