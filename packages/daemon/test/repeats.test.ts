/**
 * What a repeated refusal is allowed to cost.
 *
 * The bound that matters is not USDC — a refusal spends none. It is gas, which
 * sits outside the mandate entirely, and the conduct record, which is the
 * thing a stranger reads. A looping agent was writing one transaction per
 * refusal with no ceiling of any kind.
 *
 * The rule under test: a refusal that says something new goes to the chain, and
 * one identical to a refusal already there is answered from it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { RefusalRepeats, type Bound, type Published } from "../src/repeats.ts";

const NODE = `0x${"08".repeat(32)}` as Hex;
const OTHER_NODE = `0x${"e4".repeat(32)}` as Hex;
const PAYEE = "0x3feeA28582C643f85Baf32D41adE6f1141A801F3" as Address;
const OTHER_PAYEE = "0x1111111111111111111111111111111111111111" as Address;

const bound = (over: Partial<Bound> = {}): Bound => ({
  node: NODE,
  counterparty: PAYEE,
  amount: 2_400_000n,
  reason: "tranche-cap",
  ...over,
});

const published: Published = { refusalId: 9n, txHash: `0x${"ab".repeat(32)}`, reason: "tranche-cap" };

/* A clock the test drives, so nothing here waits and nothing is flaky. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

test("the first refusal for a bound is not suppressed, because nothing is on chain yet", () => {
  const repeats = new RefusalRepeats();
  assert.equal(repeats.recall(bound()), undefined);
});

test("an identical refusal is answered from the one already on chain", () => {
  const repeats = new RefusalRepeats();
  repeats.remember(bound(), published, 60_000);
  assert.deepEqual(repeats.recall(bound()), published);
});

/**
 * The whole safety argument. Anything a reader of the record could learn is
 * part of the key, so a refusal that would tell them something different is
 * never suppressed.
 */
test("a different payee, amount, reason or node is a different fact and still goes to chain", () => {
  const repeats = new RefusalRepeats();
  repeats.remember(bound(), published, 60_000);
  assert.equal(repeats.recall(bound({ counterparty: OTHER_PAYEE })), undefined);
  assert.equal(repeats.recall(bound({ amount: 2_400_001n })), undefined);
  assert.equal(repeats.recall(bound({ reason: "lifetime-cap" })), undefined);
  assert.equal(repeats.recall(bound({ node: OTHER_NODE })), undefined);
});

/* Ids off the chain arrive in whatever case the caller held them in, and a
   miss here costs a transaction rather than correctness — but a tree that
   refuses in two cases would pay twice for one fact. */
test("the same bound in another case is the same bound", () => {
  const repeats = new RefusalRepeats();
  repeats.remember(bound(), published, 60_000);
  assert.deepEqual(
    repeats.recall(bound({ node: NODE.toUpperCase().replace("0X", "0x") as Hex })),
    published,
  );
  assert.deepEqual(repeats.recall(bound({ counterparty: PAYEE.toLowerCase() as Address })), published);
});

/**
 * A window that has rolled is a fresh budget, so the same bound refusing again
 * is genuinely new information and must reach the chain.
 */
test("once the window it was refused in has passed, the same refusal is new again", () => {
  const time = clock();
  const repeats = new RefusalRepeats({ now: time.now });
  repeats.remember(bound(), published, 60_000);
  time.tick(59_999);
  assert.deepEqual(repeats.recall(bound()), published);
  time.tick(2);
  assert.equal(repeats.recall(bound()), undefined);
});

/* A hold this code could not work out is a hold it does not get to invent.
   Suppressing nothing is the behaviour that existed before, which is the safe
   direction for a mechanism whose only job is to send less. */
test("a window that could not be determined suppresses nothing", () => {
  const repeats = new RefusalRepeats();
  repeats.remember(bound(), published, 0);
  assert.equal(repeats.recall(bound()), undefined);
  repeats.remember(bound(), published, -1);
  assert.equal(repeats.recall(bound()), undefined);
});

test("what is handed back is the refusal that really is on chain", () => {
  const repeats = new RefusalRepeats();
  repeats.remember(bound(), published, 60_000);
  const recalled = repeats.recall(bound())!;
  assert.equal(recalled.refusalId, 9n);
  assert.equal(recalled.txHash, published.txHash);
});

test("expired bounds are let go, so a long-running daemon does not keep every one", () => {
  const time = clock();
  const repeats = new RefusalRepeats({ now: time.now });
  repeats.remember(bound(), published, 1_000);
  repeats.remember(bound({ counterparty: OTHER_PAYEE }), published, 90_000);
  assert.equal(repeats.size, 2);
  time.tick(2_000);
  repeats.prune();
  assert.equal(repeats.size, 1);
  assert.deepEqual(repeats.recall(bound({ counterparty: OTHER_PAYEE })), published);
});

/* The loop this exists for: fifty identical refusals, one transaction. */
test("a worker in a loop writes one refusal, not fifty", () => {
  const repeats = new RefusalRepeats();
  let sent = 0;
  for (let i = 0; i < 50; i++) {
    if (repeats.recall(bound())) continue;
    sent++;
    repeats.remember(bound(), published, 60_000);
  }
  assert.equal(sent, 1);
});
