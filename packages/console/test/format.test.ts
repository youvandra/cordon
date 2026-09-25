/**
 * The arithmetic behind what the console prints.
 *
 * These are the smallest functions in the package and the ones a wrong answer
 * is hardest to notice in: a share bar a few percent out looks plausible, a
 * budget short by a factor of ten looks like a budget, and a node shown as
 * live under a cut parent looks like a node that may still spend. None of them
 * touches the network, and until now none of them was tested.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cutLookup, isHeld, share, shortId, shortPurpose, usdc6, windowLabel } from "../src/lib/format.ts";
import type { ChainNode } from "../src/lib/tree.ts";

const id = (byte: string) => `0x${byte.repeat(32)}` as `0x${string}`;

function node(over: Partial<ChainNode> & Pick<ChainNode, "node">): ChainNode {
  return {
    parent: null, depth: 0, operator: `0x${"11".repeat(20)}`,
    budget6: 0n, lifetimeCap6: 0n, windowSeconds: 3600n, trancheCap6: 0n,
    concentrationBps: 0, maxDepth: 3, revoked: false,
    windowSpent6: 0n, lifetimeSpent6: 0n, available6: 0n,
    boundBy: over.node,
    ...over,
  } as ChainNode;
}

/* ── what a share bar is told to draw ───────────────────────────────────── */

test("a share is a percentage of the bound, to one decimal", () => {
  assert.equal(share(50n, 200n), 25);
  assert.equal(share(1n, 3n), 33.3);
});

test("nothing spent against nothing is zero, not a division by zero", () => {
  assert.equal(share(0n, 0n), 0);
  assert.equal(share(5n, 0n), 0);
});

/* A bar is a picture of a bound, and a bound is never more than full — but a
   figure over 100 would be a real disagreement with the contract, so clamping
   is a drawing decision and is asserted as one. */
test("a bar never draws past full, however much was spent", () => {
  assert.equal(share(300n, 200n), 100);
});

test("a share of very large figures does not overflow into a float", () => {
  const huge = 10n ** 30n;
  assert.equal(share(huge / 2n, huge), 50);
});

/* ── dollars typed by an owner, into the token's own units ──────────────── */

test("dollars become USDC base units at the token's six places", () => {
  assert.equal(usdc6("1"), 1_000_000n);
  assert.equal(usdc6("0.07"), 70_000n);
  assert.equal(usdc6("123456789.123456"), 123_456_789_123_456n);
});

test("an empty field is nothing, not NaN", () => {
  assert.equal(usdc6(""), 0n);
});

/**
 * A negative bound is not a smaller bound, it is a different statement, and
 * `BigInt(Math.round(-1e6))` would sign one. The field is `type="number"` with
 * `min="0"`, so this is the second line rather than the first.
 */
test("a negative amount is refused rather than signed as a bound", () => {
  assert.equal(usdc6("-1"), 0n);
});

test("something that is not a number is nothing, not a partial figure", () => {
  assert.equal(usdc6("abc"), 0n);
});

/* Below the token's own precision there is no figure to carry, and the
   millionth is where it stops. */
test("a figure finer than the token's precision rounds to the millionth", () => {
  assert.equal(usdc6("0.1234564"), 123_456n);
  assert.equal(usdc6("0.0000001"), 0n);
});

/* ── which node is actually holding a branch down ───────────────────────── */

test("a node bound by its own window is not held", () => {
  const self = id("aa");
  assert.equal(isHeld(node({ node: self, boundBy: self })), false);
});

test("a node bound by an ancestor is held, which is the case worth seeing", () => {
  assert.equal(isHeld(node({ node: id("aa"), boundBy: id("bb") })), true);
});

test("a revoked node is cut rather than held, and the two are not the same word", () => {
  assert.equal(isHeld(node({ node: id("aa"), boundBy: id("bb"), revoked: true })), false);
});

/* ── revocation running down a branch ───────────────────────────────────── */

test("a child of a cut parent is cut, though its own flag says otherwise", () => {
  const root = id("aa");
  const child = id("bb");
  const grandchild = id("cc");
  const cut = cutLookup([
    node({ node: root, revoked: true }),
    node({ node: child, parent: root }),
    node({ node: grandchild, parent: child }),
  ]);
  assert.equal(cut(root), true);
  assert.equal(cut(child), true);
  assert.equal(cut(grandchild), true);
});

test("a live branch beside a cut one is not cut with it", () => {
  const root = id("aa");
  const cutChild = id("bb");
  const liveChild = id("cc");
  const cut = cutLookup([
    node({ node: root }),
    node({ node: cutChild, parent: root, revoked: true }),
    node({ node: liveChild, parent: root }),
  ]);
  assert.equal(cut(cutChild), true);
  assert.equal(cut(liveChild), false);
});

/* The ids come off the chain in whatever case the caller held them in, and a
   lookup that misses reads as "not cut" — the answer that lets an agent
   spend. So the case must not decide it. */
test("an id asked in another case gets the same answer", () => {
  const root = "0xAABB".padEnd(66, "0") as `0x${string}`;
  const cut = cutLookup([node({ node: root, revoked: true })]);
  assert.equal(cut(root.toLowerCase()), true);
  assert.equal(cut(root.toUpperCase().replace("0X", "0x")), true);
});

test("an id nobody knows about is not reported as cut", () => {
  const cut = cutLookup([node({ node: id("aa") })]);
  assert.equal(cut(id("ff")), false);
});

/* ── the words on a window, and the text on a node ──────────────────────── */

test("the window lengths the form offers read back in the form's own words", () => {
  assert.equal(windowLabel(3600), "1 hour");
  assert.equal(windowLabel(86_400), "24 hours");
  assert.equal(windowLabel(604_800), "7 days");
});

test("a window the form does not offer is still said in whole units where it can be", () => {
  assert.equal(windowLabel(172_800), "2 days");
  assert.equal(windowLabel(7200), "2 hours");
  assert.equal(windowLabel(90), "90 seconds");
});

test("a window is read the same whether it arrives as a bigint or a number", () => {
  assert.equal(windowLabel(86_400n), windowLabel(86_400));
});

test("a purpose is cut at its first sentence, so a label is a name and not half a clause", () => {
  assert.equal(
    shortPurpose("Social sentiment lead. Splits its window between two feed readers."),
    "Social sentiment lead",
  );
});

test("a purpose that is one sentence is left whole for the ellipsis to handle", () => {
  assert.equal(shortPurpose("Buys one market data snapshot an hour"), "Buys one market data snapshot an hour");
});

test("an id short enough to sit in a row is not shortened into something longer", () => {
  assert.equal(shortId("0xabcd"), "0xabcd");
  assert.equal(shortId(id("ab")), "0xababab…abab");
});
