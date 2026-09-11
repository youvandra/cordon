/**
 * Reconciliation, against the way it accused its own exit path.
 *
 * The check is one-sided and that is the whole design: an operator's Gateway
 * balance must never exceed what the vault released to it, because a balance
 * above that came from somewhere other than the tree. The failure mode of a
 * one-sided check is a total that is too low — and this one was, by exactly the
 * amount of every release an owner had ever signed.
 *
 * `TreeVault.release` calls `gateway.depositFor` with the same argument
 * `draw` does. It emits `Released`, not `Drawn`, and the reconciliation summed
 * `drawn6`. So the first time an owner signed an exception to a refusal, the
 * operator's balance went up and the figure it was compared against did not,
 * and `/reconcile` answered MISMATCH: money from outside the tree, about money
 * the tree had just let out on the owner's own signature.
 *
 * Nothing here needs a chain. The Gateway balance is the one thing read from
 * one, and a stub says what it holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex, PublicClient } from "viem";
import { emptyLedger, reduce, type Event } from "../src/ledger.ts";
import { reconcileGateway } from "../src/reconcile.ts";

const ROOT = `0x${"a1".repeat(32)}` as Hex;
const CHILD = `0x${"b2".repeat(32)}` as Hex;

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const OP_ROOT = "0x2222222222222222222222222222222222222222" as Address;
const OP_CHILD = "0x3333333333333333333333333333333333333333" as Address;
const SELLER = "0x5555555555555555555555555555555555555555" as Address;

const GATEWAY = "0x7777777777777777777777777777777777777777" as Address;
const USDC = "0x3600000000000000000000000000000000000000" as Address;

let block = 1n;
let index = 0;
function at<T extends object>(fields: T): T & { blockNumber: bigint; transactionHash: Hex; logIndex: number } {
  return {
    ...fields,
    blockNumber: block++,
    transactionHash: `0x${block.toString(16).padStart(64, "0")}` as Hex,
    logIndex: index++,
  };
}

/** Circle's view of a balance, without Circle. */
function gatewayHolding(balances: Record<string, bigint>): PublicClient {
  return {
    readContract: async ({ args }: { args: readonly unknown[] }) =>
      balances[String(args[1]).toLowerCase()] ?? 0n,
  } as unknown as PublicClient;
}

/** A root and one child, one draw of $1, and a refusal the vault holds. */
function tree(): Event[] {
  block = 1n;
  index = 0;
  return [
    at({ kind: "MandateOpened", node: ROOT, owner: OWNER, operator: OP_ROOT, budget6: 100_000_000n, lifetimeCap6: 250_000_000n, windowSeconds: 86_400, maxDepth: 3 } as const),
    at({ kind: "MandateSpawned", node: CHILD, parent: ROOT, operator: OP_CHILD, budget6: 60_000_000n, lifetimeCap6: 150_000_000n, depth: 1 } as const),
    at({ kind: "Drawn", node: CHILD, counterparty: SELLER, beneficiary: OP_CHILD, amount6: 1_000_000n, root: ROOT } as const),
    at({ kind: "Refused", refusalId: 7n, node: CHILD, breachedAt: ROOT, counterparty: SELLER, amount6: 4_000_000n, reason: "window-budget" } as const),
  ];
}

test("a refusal an owner released is money the vault let out, not money from outside", async () => {
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    /* The human exit, on chain and signed. The vault deposits it into the same
       operator balance a draw would have. */
    at({ kind: "Released", refusalId: 7n, by: OWNER, counterparty: SELLER, amount6: 4_000_000n } as const),
  ]);

  const row = ledger.nodes[CHILD.toLowerCase() as Hex]!;
  assert.equal(row.drawn6, 1_000_000n);
  assert.equal(row.releasedTo6, 4_000_000n, "the release lands on the node whose operator was credited");
  assert.equal(row.draws, 1, "and it is not counted as a purchase inside the bound");

  /* Everything the vault let out, still sitting there unspent. */
  const report = await reconcileGateway(
    gatewayHolding({ [OP_CHILD.toLowerCase()]: 5_000_000n }),
    ledger,
    { gateway: GATEWAY, usdc: USDC },
  );

  const operator = report.operators.find((o) => o.operator === OP_CHILD.toLowerCase())!;
  assert.equal(operator.drawn6, 1_000_000n);
  assert.equal(operator.bySignature6, 4_000_000n);
  assert.equal(operator.released6, 5_000_000n, "both ways the vault funds an operator, in one total");
  assert.equal(operator.withinRelease, true);
  assert.equal(report.ok, true, "an owner signing an exception does not make the tree look compromised");
  assert.equal(report.attribution, "complete");
});

test("a balance above the release is still the thing this check is for", async () => {
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    at({ kind: "Released", refusalId: 7n, by: OWNER, counterparty: SELLER, amount6: 4_000_000n } as const),
  ]);

  /* One base unit more than the vault ever released. A check that cannot fail
     is decoration, and widening the total must not have widened it past this. */
  const report = await reconcileGateway(
    gatewayHolding({ [OP_CHILD.toLowerCase()]: 5_000_001n }),
    ledger,
    { gateway: GATEWAY, usdc: USDC },
  );

  assert.equal(report.ok, false);
  assert.equal(report.operators.find((o) => o.operator === OP_CHILD.toLowerCase())!.withinRelease, false);
});

test("a release whose refusal predates the range is reported rather than assumed", async () => {
  /* `Released` names a refusal id and no node, so a range that begins after
     the refusal has nothing to join it to. The amount is real and the
     attribution is not, which is the direction that produces a false
     accusation — so the report says which. */
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    at({ kind: "Released", refusalId: 999n, by: OWNER, counterparty: SELLER, amount6: 2_000_000n } as const),
  ]);

  assert.equal(ledger.released6, 2_000_000n, "the money moved and the ledger says so");
  assert.equal(ledger.releasedUnattributed6, 2_000_000n, "but not to a node this range knows");

  const report = await reconcileGateway(
    gatewayHolding({ [OP_CHILD.toLowerCase()]: 1_000_000n }),
    ledger,
    { gateway: GATEWAY, usdc: USDC },
  );

  assert.equal(report.attribution, "partial");
  assert.equal(report.unattributedReleases6, 2_000_000n);
});
