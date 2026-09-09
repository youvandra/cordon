/**
 * One run of each condition against a real chain, real contracts and real
 * sellers — asserting the structural claims the gate rests on rather than the
 * headline numbers, which are the run's to produce.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startWorld, ERC20, type World } from "../src/world.ts";
import { startSellers, type Sellers } from "../src/sellers.ts";
import { cordonBuyer, sharedCapBuyer } from "../src/conditions.ts";
import { faultyAgent, scriptedAgent } from "../src/agent.ts";
import { accept, taskCost6, SOURCES } from "../src/task.ts";

let world: World;
let sellers: Sellers;

before(async () => {
  world = await startWorld(8549);
  sellers = await startSellers({ window6: world.window6, usdc: world.usdc, network: "eip155:31337" });
});
after(async () => {
  await sellers.stop();
  await world.stop();
});

const balanceOf = (who: string) => world.publicClient.readContract({
  address: world.usdc, abi: ERC20, functionName: "balanceOf", args: [who as `0x${string}`],
});

test("under Cordon the brief completes and every seller was really paid", async () => {
  const before = await Promise.all(sellers.list.map((s) => balanceOf(s.payTo)));
  const result = await scriptedAgent.run(sellers, cordonBuyer(world));
  const verdict = accept(result.brief, sellers.served());

  assert.equal(verdict.complete, true, `refused: ${JSON.stringify(result.refusals)}`);
  assert.deepEqual(result.refusals, []);
  assert.equal(result.spent6, taskCost6(world.window6));

  /* The acceptance check compares bodies, and a body only comes back once the
     seller has seen a payment. This is the same claim from the other side:
     the money moved on chain, to the address the seller named. */
  const after = await Promise.all(sellers.list.map((s) => balanceOf(s.payTo)));
  for (const [i, seller] of sellers.list.entries()) {
    assert.equal(after[i]! - before[i]!, seller.price6, `${seller.source.id} was not paid`);
  }
});

test("nothing leaves the vault before the work does", async () => {
  /* The figure the comparison turns on. Under Cordon the owner's money is
     still the owner's until a purchase has been evaluated; a shared cap has
     already handed over the whole of it. */
  const cordon = cordonBuyer(world);
  assert.equal(cordon.exposureAtStart6, 0n);

  const cap6 = taskCost6(world.window6);
  const shared = await sharedCapBuyer(world, cap6);
  assert.equal(shared.exposureAtStart6, cap6);
});

test("the shared cap completes the same task, which is why it is the control", async () => {
  const fresh = await startSellers({ window6: world.window6, usdc: world.usdc, network: "eip155:31337" });
  try {
    const buyer = await sharedCapBuyer(world, taskCost6(world.window6));
    const result = await scriptedAgent.run(fresh, buyer);
    assert.equal(accept(result.brief, fresh.served()).complete, true);
    assert.equal(result.spent6, taskCost6(world.window6));
    /* One transaction against Cordon's two. The fence costs a write per
       purchase and that is the honest price of it. */
    assert.equal(result.chainWrites, SOURCES.length);
  } finally {
    await fresh.stop();
  }
});

test("a purchase larger than a tranche is refused, and the refusal names the bound", async () => {
  /* Not the subject of this gate, and here on purpose: a run where nothing can
     be refused would prove the fence was never in the path. */
  const greedy = await startSellers({
    window6: world.window6 * 100n, usdc: world.usdc, network: "eip155:31337",
  });
  try {
    const purchase = await cordonBuyer(world).buy("left", greedy.byId(SOURCES[0]!.id).url);
    assert.equal(purchase.ok, false);
    assert.equal(purchase.refusedBy, "tranche-cap");
    assert.equal(purchase.chainWrites, 0, "a refusal costs no transaction");
  } finally {
    await greedy.stop();
  }
});

test("a worker in a loop is stopped at its own bound, and its sibling still finishes", async () => {
  /* The claim a shared cap cannot make. One worker does its job and then keeps
     buying; the question is whether the other worker's section survives it. */
  const narrow = await startWorld(8551, 5_000);
  const shop = await startSellers({
    window6: narrow.window6, usdc: narrow.usdc, network: "eip155:31337",
  });
  try {
    const result = await faultyAgent.run(shop, cordonBuyer(narrow));

    assert.equal(accept(result.brief, shop.served()).complete, true, "the sibling's section was not delivered");
    assert.ok(result.runaway6 > 0n, "the loop bought nothing, so nothing was under test");
    assert.equal(result.refusals.length, 1, "the loop should be stopped exactly once");
    /* Which bound stops it is the contract's to decide and is recorded rather
       than asserted by name — except that it must not be the shared cap, which
       does not exist on this side. */
    assert.notEqual(result.refusals[0]!.reason, "shared-cap");

    /* And it may not have taken more than the window its own node was given. */
    assert.ok(result.runaway6 < narrow.window6 / 2n);
  } finally {
    await shop.stop();
    await narrow.stop();
  }
});
