/**
 * Two ways a purchase could spend more than the owner signed for.
 *
 * Both are about time rather than about amounts — the amount was bounded in
 * each case, and that was never the hole.
 *
 * The first is the gap between the contract releasing money and the money
 * moving. An x402 `PAYMENT-SIGNATURE` is an EIP-3009 authorisation, a bearer
 * instrument, and its lifetime came straight out of the seller's 402 with no
 * ceiling. A seller could ask for years, hold a stack of signed authorisations
 * unsubmitted, and cash them together later.
 *
 * The second is the gap between finding a released refusal and marking it
 * spent. Two awaits sat in it, and an await is where the other request runs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { MAX_AUTH_SECONDS, selectOffer, type Acceptable } from "../src/challenge.ts";
import { ChainReleases, type RefusalRow } from "../src/released.ts";

/* ── how long a signed authorisation stays good ─────────────────────────── */

const NETWORK = "eip155:5042002";
const ASSET = "0x3600000000000000000000000000000000000000";
const PAYTO = "0x3feeA28582C643f85Baf32D41adE6f1141A801F3";

const ok: Acceptable = { networks: [NETWORK], assets: [ASSET] };

const offering = (maxTimeoutSeconds?: number) => ({
  offers: [
    { scheme: "exact", network: NETWORK, asset: ASSET, payTo: PAYTO, amount: 1_000_000n, maxTimeoutSeconds },
  ],
}) as unknown as Parameters<typeof selectOffer>[0];

test("a seller asking for a year of validity is refused before anything is signed", () => {
  assert.throws(() => selectOffer(offering(31_536_000), ok), /signs none longer than 600s/);
});

test("the ceiling itself is accepted, and a second past it is not", () => {
  assert.equal(selectOffer(offering(MAX_AUTH_SECONDS), ok).maxTimeoutSeconds, MAX_AUTH_SECONDS);
  assert.throws(() => selectOffer(offering(MAX_AUTH_SECONDS + 1), ok), /signs none longer than/);
});

test("a seller that names no timeout is still served", () => {
  assert.equal(selectOffer(offering(undefined), ok).maxTimeoutSeconds, undefined);
});

/* ── one release, one purchase ──────────────────────────────────────────── */

const NODE = `0x${"08".repeat(32)}` as Hex;
const AMOUNT = 2_400_000n;

function releases(options: { onRead?: () => Promise<void> } = {}) {
  const row: RefusalRow = { node: NODE, counterparty: PAYTO as Address, amount6: AMOUNT, released: true };
  const file = join(mkdtempSync(join(tmpdir(), "cordon-released-")), "released-spent.json");
  return new ChainReleases({
    count: async () => 1n,
    read: async () => {
      /* The yield that made the race reachable. A real read is an RPC call,
         so this is what actually happens, not a contrivance. */
      await options.onRead?.();
      return row;
    },
    live: async () => true,
    file,
  });
}

/**
 * The regression. Before `claim` was serialised, both callers passed the
 * `spent` check before either reached the `spent.add`, and both were handed
 * the same refusal id — one owner signature, two purchases.
 */
test("two concurrent purchases cannot spend one release twice", async () => {
  const chain = releases({ onRead: () => new Promise((r) => setTimeout(r, 5)) });
  const [first, second] = await Promise.all([
    chain.claim(NODE, PAYTO as Address, AMOUNT),
    chain.claim(NODE, PAYTO as Address, AMOUNT),
  ]);
  assert.notDeepEqual([first, second], [1n, 1n]);
  assert.deepEqual([first, second].filter((id) => id !== null), [1n]);
});

test("the one that got it got a real id, and the other was told to draw instead", async () => {
  const chain = releases({ onRead: () => new Promise((r) => setTimeout(r, 5)) });
  const results = await Promise.all([
    chain.claim(NODE, PAYTO as Address, AMOUNT),
    chain.claim(NODE, PAYTO as Address, AMOUNT),
    chain.claim(NODE, PAYTO as Address, AMOUNT),
  ]);
  assert.equal(results.filter((id) => id === 1n).length, 1);
  assert.equal(results.filter((id) => id === null).length, 2);
});

test("a release given back can be claimed again, because nothing was paid with it", async () => {
  const chain = releases();
  const first = await chain.claim(NODE, PAYTO as Address, AMOUNT);
  assert.equal(first, 1n);
  assert.equal(await chain.claim(NODE, PAYTO as Address, AMOUNT), null);
  chain.unclaim(1n);
  assert.equal(await chain.claim(NODE, PAYTO as Address, AMOUNT), 1n);
});

test("what one claim spent is still spent after the ledger is read back", async () => {
  const chain = releases();
  assert.equal(await chain.claim(NODE, PAYTO as Address, AMOUNT), 1n);
  assert.equal(await chain.claim(NODE, PAYTO as Address, AMOUNT), null);
});
