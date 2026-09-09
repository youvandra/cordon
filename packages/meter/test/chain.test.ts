/**
 * The meter against a real chain.
 *
 * The reducer suite proves the arithmetic; this proves the part that cannot be
 * unit tested — that the events the contracts actually emit decode into the
 * events the reducer expects. A renamed parameter or a reordered enum is
 * invisible to a test that builds its own events, and it is exactly the defect
 * that produces a ledger full of zeroes on the day of a demo.
 *
 * The last assertion is the one that matters: the ledger, built only from
 * logs, agrees with what the vault says about itself.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, defineChain, http, parseAbi, type Hex, type PublicClient } from "viem";
import { TreeVaultAbi } from "../../daemon/src/abi.gen.ts";
import { startHarness, type Harness, SELLER_PAYOUT, PRICE, TRANCHE, ERC20 } from "../../daemon/test/harness.ts";
import { sync } from "../src/sync.ts";
import { conductOf, subtree } from "../src/ledger.ts";
import { reconcileGateway } from "../src/reconcile.ts";

/** The one selector the vault uses to credit an operator. Declared here rather
 *  than imported so the test funds the Gateway the same way anyone else would. */
const GATEWAY_DEPOSIT = parseAbi(["function depositFor(address token, address depositor, uint256 value)"]);

let h: Harness;
let client: PublicClient;

before(async () => {
  h = await startHarness(8548);
  const chain = defineChain({
    id: h.chainId,
    name: "anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [h.rpc] } },
  });
  /* `cacheTime: 0` because the assertions here are about what is on chain a
     millisecond after a write, and viem caches the block number for the
     polling interval — a suite fast enough to finish inside that window reads
     a stale `latest` and concludes the meter missed a draw. */
  client = createPublicClient({
    chain, transport: http(h.rpc), pollingInterval: 50, cacheTime: 0,
  }) as PublicClient;
});

after(async () => {
  await h.stop();
});

async function draw(node: Hex, amount6: bigint): Promise<void> {
  const hash = await h.asOpChild.writeContract({
    address: h.vault,
    abi: TreeVaultAbi,
    functionName: "draw",
    args: [node, SELLER_PAYOUT, amount6],
    chain: null,
    account: h.asOpChild.account!,
  });
  await h.publicClient.waitForTransactionReceipt({ hash });
}

test("the ledger built from logs alone agrees with the vault about itself", async () => {
  await draw(h.child, PRICE);
  await draw(h.child, PRICE);
  /* Over the tranche cap: refused, recorded, and no budget consumed. */
  await draw(h.child, TRANCHE + 1n);

  const ledger = await sync(client, {
    contracts: { registry: h.registry, vault: h.vault },
    fromBlock: 0n,
  });

  const nodes = subtree(ledger, h.root);
  assert.ok(nodes.length >= 2, "the tree the harness opened is in the ledger");

  const child = ledger.nodes[h.child.toLowerCase() as Hex]!;
  const root = ledger.nodes[h.root.toLowerCase() as Hex]!;

  assert.equal(child.draws, 2, "two purchases went through");
  assert.equal(child.refusals, 1, "one did not");
  assert.equal(child.drawn6, PRICE * 2n);
  assert.equal(root.breaches, 0, "the child's own tranche cap is what refused");
  assert.equal(child.breaches, 1);

  /* Ancestor debit, read back two ways. The event log and the contract's own
     window must agree, or one of them is decorative. */
  const windowSpent = (await client.readContract({
    address: h.vault,
    abi: TreeVaultAbi,
    functionName: "windowSpent",
    args: [h.root],
  })) as bigint;

  assert.equal(root.debited6, windowSpent, "the root paid for its grandchild's purchases");
  assert.equal(root.debited6, PRICE * 2n);
});

test("the refusal in the ledger is the refusal in the vault, and it names its transaction", async () => {
  const ledger = await sync(client, {
    contracts: { registry: h.registry, vault: h.vault },
    fromBlock: 0n,
  });

  const conduct = conductOf(ledger, h.child)!;
  assert.equal(conduct.rows.length, 1);

  const row = conduct.rows[0]!;
  assert.equal(row.reason, "tranche-cap", "the enum decoded to the word, not to an index");
  assert.equal(row.amount6, TRANCHE + 1n);

  const onChain = (await client.readContract({
    address: h.vault,
    abi: TreeVaultAbi,
    functionName: "refusal",
    args: [row.id],
  })) as { node: Hex; amount6: bigint; breachedAt: Hex };

  assert.equal(onChain.node.toLowerCase(), row.node.toLowerCase());
  assert.equal(onChain.amount6, row.amount6);
  assert.equal(onChain.breachedAt.toLowerCase(), row.breachedAt.toLowerCase());

  const receipt = await client.getTransactionReceipt({ hash: row.site.transactionHash });
  assert.equal(receipt.status, "success", "the transaction the record names is a real one");
});

test("a second sync reads forward and does not count the same draw twice", async () => {
  const first = await sync(client, {
    contracts: { registry: h.registry, vault: h.vault },
    fromBlock: 0n,
  });
  const before = first.nodes[h.child.toLowerCase() as Hex]!.draws;

  await draw(h.child, PRICE);
  const second = await sync(client, { contracts: { registry: h.registry, vault: h.vault }, fromBlock: 0n }, first);

  assert.equal(
    second.nodes[h.child.toLowerCase() as Hex]!.draws,
    before + 1,
    "resuming from the last block read is the difference between a cache and a fabrication",
  );
});

test("no operator holds more Gateway balance than the vault released to it", async () => {
  const ledger = await sync(client, { contracts: { registry: h.registry, vault: h.vault }, fromBlock: 0n });
  const report = await reconcileGateway(client, ledger, { gateway: h.gateway, usdc: h.usdc });

  assert.equal(report.ok, true, "the vault is the only funding source, and this is where that stops being a slogan");
  assert.equal(
    report.counterpartyMatching,
    "unavailable",
    "the seller-side match needs an API we have not verified a buyer can read, and pending is a value",
  );
});

test("money reaching an agent from outside the tree is what reconciliation is for", async () => {
  /* Fund the operator's Gateway balance directly, the way a second funding
     source would. Nothing in the tree released it, so the check must fail —
     a reconciliation that cannot fail is decoration. */
  const outside = 1_000_000n;
  const operator = h.asOpChild.account!.address;

  /* The harness funds the vault with everything it minted, so the owner has
     nothing left. This is a second funding source appearing from outside the
     tree, which is the whole scenario. */
  let hash = await h.asOwner.writeContract({
    address: h.usdc, abi: ERC20, functionName: "mint", args: [h.asOwner.account!.address, outside],
    chain: null, account: h.asOwner.account!,
  });
  await h.publicClient.waitForTransactionReceipt({ hash });
  hash = await h.asOwner.writeContract({
    address: h.usdc, abi: ERC20, functionName: "approve", args: [h.gateway, outside],
    chain: null, account: h.asOwner.account!,
  });
  await h.publicClient.waitForTransactionReceipt({ hash });
  hash = await h.asOwner.writeContract({
    address: h.gateway, abi: GATEWAY_DEPOSIT, functionName: "depositFor", args: [h.usdc, operator, outside],
    chain: null, account: h.asOwner.account!,
  });
  await h.publicClient.waitForTransactionReceipt({ hash });

  const ledger = await sync(client, { contracts: { registry: h.registry, vault: h.vault }, fromBlock: 0n });
  const report = await reconcileGateway(client, ledger, { gateway: h.gateway, usdc: h.usdc });

  assert.equal(report.ok, false);
  const row = report.operators.find((o) => o.operator === operator.toLowerCase())!;
  assert.equal(row.withinRelease, false, "its balance is larger than everything the vault ever let out to it");
});
