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
  /** Draws the contract released, all-time, from events. */
  drawn6: bigint;
  /**
   * Money an owner signed out to this operator after a refusal.
   *
   * `TreeVault.release` calls `depositFor` exactly as `draw` does, so this is
   * the vault funding an operator too, and leaving it out of the total below
   * is what made the first release an owner ever signed read as money from
   * outside the tree.
   */
  bySignature6: bigint;
  /** Everything the vault released to this operator, both ways. */
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
  /**
   * Whether every figure above could be attributed.
   *
   * `partial` means the ledger holds a `Released` whose refusal is outside the
   * range it was built over, so the amount the vault released to somebody is
   * known to be understated by `unattributedReleases6`. The check is
   * one-sided — a balance above what was released is the failure — so an
   * understated release is exactly the direction that produces a false
   * accusation, and a report that did not say so would make one.
   */
  attribution: "complete" | "partial";
  unattributedReleases6: bigint;
}

export async function reconcileGateway(
  client: PublicClient,
  ledger: Ledger,
  contracts: { gateway: Address; usdc: Address },
): Promise<Reconciliation> {
  /* Draws are attributed to nodes, and `TreeVault.draw` credits the drawing
     node's own operator. Summing by operator is therefore the same money,
     grouped the way the Gateway holds it. */
  const released = new Map<
    Address,
    { drawn6: bigint; bySignature6: bigint; nodes: number; liveNodes: number }
  >();
  for (const row of Object.values(ledger.nodes)) {
    const key = row.operator.toLowerCase() as Address;
    const entry = released.get(key) ?? { drawn6: 0n, bySignature6: 0n, nodes: 0, liveNodes: 0 };
    entry.drawn6 += row.drawn6;
    /* Both are the vault calling `depositFor` on this operator's balance. A
       total that counted only the first read a signed release as a stranger's
       money and reported MISMATCH against Cordon's own exit. */
    entry.bySignature6 += row.releasedTo6 ?? 0n;
    entry.nodes += 1;
    if (!row.revoked) entry.liveNodes += 1;
    released.set(key, entry);
  }

  const keys = [...released.keys()];
  /* One read per operator, gathered rather than awaited in turn. The client the
     meter builds packs them into Multicall3, so a tree with a dozen operators
     is one request every tick and not a dozen — against a public endpoint that
     rate limits, on a loop that runs every five seconds. */
  const balances = (await Promise.all(
    keys.map((operator) =>
      client.readContract({
        address: contracts.gateway,
        abi: GATEWAY,
        functionName: "availableBalance",
        args: [contracts.usdc, operator],
      }),
    ),
  )) as bigint[];

  const operators: OperatorRow[] = keys.map((operator, i) => {
    const entry = released.get(operator)!;
    const released6 = entry.drawn6 + entry.bySignature6;
    const available6 = balances[i]!;
    return {
      operator,
      nodes: entry.nodes,
      liveNodes: entry.liveNodes,
      drawn6: entry.drawn6,
      bySignature6: entry.bySignature6,
      released6,
      available6,
      withinRelease: available6 <= released6,
    };
  });

  operators.sort((a, b) => (b.released6 > a.released6 ? 1 : b.released6 < a.released6 ? -1 : 0));

  const unattributedReleases6 = ledger.releasedUnattributed6 ?? 0n;

  return {
    chainId: ledger.chainId,
    toBlock: ledger.toBlock,
    operators,
    ok: operators.every((operator) => operator.liveNodes === 0 || operator.withinRelease),
    counterpartyMatching: "unavailable",
    attribution: unattributedReleases6 === 0n ? "complete" : "partial",
    unattributedReleases6,
  };
}
