/**
 * The pure parts, tested without a chain.
 *
 * `verify` itself needs ENS and two contracts, so it is exercised against a
 * local node in the repository's own gates. What is tested here is everything
 * that decides whether a seller SERVES or REFUSES, because those are the
 * functions where being wrong costs someone money in a direction they did not
 * choose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBase6, formatBase6, canAfford, type Verified } from "../src/index.ts";

const agent = (over: Partial<Verified> = {}): Verified => ({
  name: "worker1.probe.acme.eth",
  address: "0x00000000000000000000000000000000000000a1",
  node: "0x11",
  registry: "0x00000000000000000000000000000000000000b2",
  root: "0x22",
  owner: "0x00000000000000000000000000000000000000c3",
  live: true,
  revokedAt: null,
  headroom6: 4_230_000n,
  boundBy: "0x33",
  depth: 2,
  chain: [],
  endpoint: null,
  context: null,
  sources: { live: "contract", headroom: "contract" },
  nameAgrees: true,
  ...over,
});

test("a base-6 record round-trips exactly", () => {
  for (const v of [0n, 1n, 8_000n, 4_230_000n, 20_000_000n, 2n ** 60n]) {
    assert.equal(parseBase6(formatBase6(v)), v, `${v}`);
  }
});

test("six decimals exactly, because that is what the token has", () => {
  assert.equal(formatBase6(8_000n), "0.008000");
  assert.equal(formatBase6(1n), "0.000001");
  assert.equal(formatBase6(20_000_000n), "20.000000");
});

test("anything not that shape reads as absent, never as a number", () => {
  /* A record written by hand, or by a resolver that formats differently, must
     not become a figure a seller acts on. */
  for (const bad of ["4.23", "4", "4.2300000", "", "4.23000a", "-1.000000", "0x04", "1e6"]) {
    assert.equal(parseBase6(bad), null, JSON.stringify(bad));
  }
});

test("a revoked agent can afford nothing, whatever its headroom says", () => {
  assert.equal(canAfford(agent({ live: false }), 1n), false);
  assert.equal(canAfford(agent({ live: false, headroom6: 999_000_000n }), 1n), false);
});

test("an unknown headroom refuses rather than assuming room", () => {
  /* The direction that flatters is the one to refuse: a seller that served on
     `null` would be extending credit against a figure it never read. */
  assert.equal(canAfford(agent({ headroom6: null }), 1n), false);
});

test("the boundary is inclusive, because the vault's is", () => {
  assert.equal(canAfford(agent({ headroom6: 8_000n }), 8_000n), true);
  assert.equal(canAfford(agent({ headroom6: 7_999n }), 8_000n), false);
});

test("zero headroom affords nothing but is not an error", () => {
  assert.equal(canAfford(agent({ headroom6: 0n }), 1n), false);
  assert.equal(canAfford(agent({ headroom6: 0n }), 0n), true);
});
