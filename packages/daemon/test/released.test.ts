/**
 * A released refusal pays its purchase, once, and never with a draw.
 *
 * The gate, the settler and the seller are stand-ins; what is under test is
 * the order `cordonFetch` does things in and what `ChainReleases` will match.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { cordonFetch, type Transport } from "../src/fetch.ts";
import type { Gate } from "../src/gate.ts";
import type { Payment, Settler } from "../src/settle.ts";
import { ChainReleases, type RefusalRow } from "../src/released.ts";

const NODE = `0x${"08".repeat(32)}` as Hex;
const OTHER = `0x${"e4".repeat(32)}` as Hex;
const PAYTO = "0x3feeA28582C643f85Baf32D41adE6f1141A801F3" as Address;
const ASSET = "0x3600000000000000000000000000000000000000" as Address;
const NETWORK = "eip155:5042002";
const PRICE = 1_000_000n;

const challenge = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: NETWORK,
      asset: ASSET,
      payTo: PAYTO,
      amount: PRICE.toString(),
      maxTimeoutSeconds: 300,
      resource: "/arc/snapshot",
      extra: { name: "USDC", version: "2" },
    },
  ],
};

const seller: Transport = async (_url, init) =>
  "PAYMENT-SIGNATURE" in init.headers
    ? { status: 200, headers: {}, body: { blockNumber: "1" } }
    : { status: 402, headers: {}, body: challenge };

function world(rows: RefusalRow[], options: { settleFails?: () => boolean; cut?: Set<string> } = {}) {
  const cut = options.cut ?? new Set<string>();
  const draws: Hex[] = [];
  const settled: Payment[] = [];
  const gate = {
    draw: async (node: Hex) => {
      draws.push(node);
      return { released: false, reason: "tranche-cap", refusalId: 99n };
    },
  } as unknown as Gate;
  const settler: Settler = {
    settle: async (_node, payment) => {
      if (options.settleFails?.()) throw new Error("gateway refused");
      settled.push(payment);
      return { proof: "proof", txHash: `0x${"ab".repeat(32)}` as Hex };
    },
  };
  const file = join(mkdtempSync(join(tmpdir(), "released-")), "released-spent.json");
  const releases = () =>
    new ChainReleases({
      count: async () => BigInt(rows.length),
      read: async (id) => rows[Number(id) - 1]!,
      live: async (node) => !cut.has(node.toLowerCase()),
      file,
    });
  const released = releases();
  const deps = { gate, settler, acceptable: { networks: [NETWORK], assets: [ASSET] }, transport: seller, released };
  return { draws, settled, deps, releases, cut };
}

const row = (over: Partial<RefusalRow> = {}): RefusalRow => ({
  node: NODE,
  counterparty: PAYTO,
  amount6: PRICE,
  released: true,
  ...over,
});

test("a released refusal pays that purchase with no draw", async () => {
  const w = world([row({ released: false }), row()]);
  const result = await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  assert.equal(result.paid, true);
  assert.equal((result as { releasedRefusal?: bigint }).releasedRefusal, 2n);
  assert.equal(w.draws.length, 0, "the bound is not asked again");
  assert.equal(w.settled.length, 1);
});

test("a release pays one purchase, not one per ask", async () => {
  const w = world([row()]);
  await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  const again = await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  assert.equal(again.paid, false, "the second ask draws, and the bound refuses it");
  assert.equal(w.draws.length, 1);
});

test("what was spent survives a restart", async () => {
  const w = world([row()]);
  await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  const restarted = { ...w.deps, released: w.releases() };
  const again = await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, restarted);
  assert.equal(again.paid, false);
});

test("a release for another node, payee or amount is not this purchase's", async () => {
  const w = world([
    row({ node: OTHER }),
    row({ counterparty: "0x0000000000000000000000000000000000000001" }),
    row({ amount6: 10_000n }),
    row({ released: false }),
  ]);
  const result = await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  assert.equal(result.paid, false);
  assert.equal(w.draws.length, 1);
  assert.equal(w.settled.length, 0);
});

test("a release on a cut branch buys nothing, even when the cut came after the release", async () => {
  const w = world([row()]);
  w.cut.add(NODE.toLowerCase());
  const result = await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  assert.equal(w.settled.length, 0, "nothing is paid out of the release");
  assert.equal(result.paid, false);
  assert.equal(w.draws.length, 1, "it falls through to a draw, which the contract refuses as revoked");

  w.cut.delete(NODE.toLowerCase());
  const restored = await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  assert.equal(restored.paid, true, "the release was not marked spent by the refused attempt");
});

test("a settlement that fails leaves the release spendable", async () => {
  let fail = true;
  const w = world([row()], { settleFails: () => fail });
  await assert.rejects(cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps), /gateway refused/);
  fail = false;
  const retry = await cordonFetch({ node: NODE, url: "https://seller/arc/snapshot" }, w.deps);
  assert.equal(retry.paid, true);
  assert.equal(w.draws.length, 0);
});
