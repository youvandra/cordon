/**
 * The ledger reducer, against the ways an indexer quietly lies.
 *
 * An indexer's failures are not crashes. They are a count that drifts, a
 * refusal filed against the wrong node, an override counted as a purchase, a
 * cache that cannot be rebuilt. Each test here is named after one of those.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import {
  conductOf,
  emptyLedger,
  reduce,
  lifetimeOf,
  refusalsOf,
  subtree,
  topCounterparty,
  type Event,
} from "../src/ledger.ts";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deserialize, serialize, writeSnapshot } from "../src/snapshot.ts";

const ROOT = `0x${"a1".repeat(32)}` as Hex;
const CHILD = `0x${"b2".repeat(32)}` as Hex;
const GRAND = `0x${"c3".repeat(32)}` as Hex;

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const OP_ROOT = "0x2222222222222222222222222222222222222222" as Address;
const OP_CHILD = "0x3333333333333333333333333333333333333333" as Address;
const OP_GRAND = "0x4444444444444444444444444444444444444444" as Address;

/** $0.0024 and $0.0200 — the AIsa and Allium endpoints from Circle's live
 *  catalogue. Prices are fixtures elsewhere; here they are only shapes. */
const AISA = "0x5555555555555555555555555555555555555555" as Address;
const ALLIUM = "0x6666666666666666666666666666666666666666" as Address;

let block = 1n;
let index = 0;

/** Every event carries where it happened, because "here are the transactions"
 *  is the claim. The helper makes that automatic rather than optional. */
function at<T extends object>(fields: T): T & { blockNumber: bigint; transactionHash: Hex; logIndex: number } {
  const site = {
    blockNumber: block,
    transactionHash: `0x${block.toString(16).padStart(64, "0")}` as Hex,
    logIndex: index++,
  };
  return { ...fields, ...site };
}

function nextBlock() {
  block += 1n;
  index = 0;
}

/** The four-node tree from the plan, as the events that would build it. */
function tree(): Event[] {
  block = 1n;
  index = 0;
  const events: Event[] = [
    at({ kind: "MandateOpened", node: ROOT, owner: OWNER, operator: OP_ROOT, budget6: 100_000_000n, lifetimeCap6: 250_000_000n, windowSeconds: 86_400, maxDepth: 3 } as const),
    at({ kind: "Funded", root: ROOT, from: OWNER, amount6: 100_000_000n } as const),
  ];
  nextBlock();
  events.push(
    at({ kind: "MandateSpawned", node: CHILD, parent: ROOT, operator: OP_CHILD, budget6: 60_000_000n, lifetimeCap6: 150_000_000n, depth: 1 } as const),
    at({ kind: "MandateSpawned", node: GRAND, parent: CHILD, operator: OP_GRAND, budget6: 30_000_000n, lifetimeCap6: 150_000_000n, depth: 2 } as const),
  );
  nextBlock();
  return events;
}

/** One released draw by `node`, with the ancestor debits it emits. */
function draw(node: Hex, ancestors: Hex[], payee: Address, amount6: bigint): Event[] {
  const events: Event[] = [
    at({ kind: "Drawn", node, counterparty: payee, beneficiary: OP_GRAND, amount6, root: ROOT } as const),
  ];
  for (const ancestor of ancestors) {
    events.push(
      at({ kind: "AncestorDebited", node, ancestor, amount6, spent6: amount6, budget6: 100_000_000n } as const),
    );
  }
  nextBlock();
  return events;
}

test("a draw debits every ancestor's ledger, not just the node that made it", () => {
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    ...draw(GRAND, [GRAND, CHILD, ROOT], AISA, 2_400n),
  ]);

  assert.equal(ledger.nodes[GRAND.toLowerCase() as Hex]!.debited6, 2_400n);
  assert.equal(ledger.nodes[CHILD.toLowerCase() as Hex]!.debited6, 2_400n, "the parent paid for it too");
  assert.equal(ledger.nodes[ROOT.toLowerCase() as Hex]!.debited6, 2_400n, "and so did the root");
  assert.equal(
    ledger.nodes[ROOT.toLowerCase() as Hex]!.draws,
    0,
    "but the root did not make a draw, and a ledger that says it did invents conduct",
  );
});

test("a refusal is filed against the node that drew and the bound that stopped it, separately", () => {
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    at({ kind: "Refused", refusalId: 1n, node: GRAND, breachedAt: ROOT, counterparty: AISA, amount6: 5_000_000n, reason: "window-budget" } as const),
  ]);

  const grand = ledger.nodes[GRAND.toLowerCase() as Hex]!;
  const root = ledger.nodes[ROOT.toLowerCase() as Hex]!;

  assert.equal(grand.refusals, 1, "the conduct is the grandchild's");
  assert.equal(grand.breaches, 0);
  assert.equal(root.refusals, 0, "the root was not refused");
  assert.equal(root.breaches, 1, "its bound is what refused, which is what it exists for");
});

test("every refusal carries the transaction it happened in", () => {
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    at({ kind: "Refused", refusalId: 1n, node: CHILD, breachedAt: CHILD, counterparty: ALLIUM, amount6: 20_000n, reason: "tranche-cap" } as const),
  ]);

  const conduct = conductOf(ledger, CHILD)!;
  assert.equal(conduct.linkage, 1, "the registry baseline is 98.7–100% of records with none");
  assert.match(conduct.rows[0]!.site.transactionHash, /^0x[0-9a-f]{64}$/);
});

test("an override is recorded against the refusal it belongs to and is not counted as a purchase", () => {
  const events = [
    ...tree(),
    at({ kind: "Refused", refusalId: 1n, node: CHILD, breachedAt: ROOT, counterparty: AISA, amount6: 5_000_000n, reason: "window-budget" } as const),
  ];
  nextBlock();
  events.push(at({ kind: "Released", refusalId: 1n, by: OWNER, counterparty: AISA, amount6: 5_000_000n } as const));

  const ledger = reduce(emptyLedger(5042002), events);
  const child = ledger.nodes[CHILD.toLowerCase() as Hex]!;

  assert.equal(child.draws, 0, "a release is a human signing an exception, not a draw inside the bound");
  assert.equal(child.refusals, 1, "and the refusal it overrides stays on the record");
  assert.equal(ledger.released6, 5_000_000n, "counted, and counted apart");
  assert.equal(refusalsOf(ledger, CHILD)[0]!.released!.by, OWNER, "with the name of whoever signed it");
});

test("a record written into ERC-8004 is attached to the refusal it was made from", () => {
  const events = [
    ...tree(),
    at({ kind: "Bound", node: CHILD, agentId: 41_823n, operator: OP_CHILD } as const),
    at({ kind: "Refused", refusalId: 1n, node: CHILD, breachedAt: ROOT, counterparty: AISA, amount6: 5_000_000n, reason: "window-budget" } as const),
  ];
  nextBlock();
  const recordHash = `0x${"ee".repeat(32)}` as Hex;
  events.push(at({ kind: "Attested", refusalId: 1n, node: CHILD, agentId: 41_823n, recordHash } as const));

  const ledger = reduce(emptyLedger(5042002), events);
  const conduct = conductOf(ledger, CHILD)!;

  assert.equal(conduct.agentId, 41_823n);
  assert.equal(conduct.attested, 1);
  assert.equal(conduct.rows[0]!.attested!.recordHash, recordHash);
});

test("a revoked branch stays in the ledger, because conduct under a cut mandate is the point", () => {
  const events = [...tree()];
  events.push(at({ kind: "MandateRevoked", node: CHILD, by: OWNER } as const));
  nextBlock();
  events.push(
    at({ kind: "Refused", refusalId: 1n, node: GRAND, breachedAt: CHILD, counterparty: AISA, amount6: 2_400n, reason: "revoked" } as const),
  );

  const ledger = reduce(emptyLedger(5042002), events);
  assert.equal(ledger.nodes[CHILD.toLowerCase() as Hex]!.revoked, true);
  assert.equal(conductOf(ledger, GRAND)!.rows[0]!.reason, "revoked", "it kept trying, and that is on the record");
});

test("the largest counterparty is the declared one, summed from draws and nothing else", () => {
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    ...draw(CHILD, [CHILD, ROOT], AISA, 2_400n),
    ...draw(CHILD, [CHILD, ROOT], AISA, 2_400n),
    ...draw(CHILD, [CHILD, ROOT], ALLIUM, 20_000n),
  ]);

  const top = topCounterparty(ledger.nodes[CHILD.toLowerCase() as Hex]!)!;
  assert.equal(top.payee, ALLIUM, "by amount, not by count");
  assert.equal(top.amount6, 20_000n);
});

test("replaying the same events twice does not double a single draw", () => {
  const events = [...tree(), ...draw(CHILD, [CHILD, ROOT], AISA, 2_400n)];

  const once = reduce(emptyLedger(5042002), events);
  const twice = reduce(emptyLedger(5042002), events);
  reduce(twice, []);

  assert.equal(once.nodes[CHILD.toLowerCase() as Hex]!.draws, 1);
  assert.equal(twice.nodes[CHILD.toLowerCase() as Hex]!.draws, 1);
});

test("a snapshot round-trips, so the cache can be thrown away and rebuilt", () => {
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    ...draw(GRAND, [GRAND, CHILD, ROOT], AISA, 2_400n),
    at({ kind: "Refused", refusalId: 1n, node: GRAND, breachedAt: ROOT, counterparty: AISA, amount6: 5_000_000n, reason: "window-budget" } as const),
  ]);

  const restored = deserialize(serialize(ledger));

  assert.deepEqual(restored, ledger, "a snapshot that differs from its ledger is a second source of truth");
  assert.equal(typeof restored.refusals[0]!.amount6, "bigint", "money survives the trip as money, not as a float");
  assert.equal(restored.nodes[ROOT.toLowerCase() as Hex]!.debited6, 2_400n);
});

test("a subtree is every node under one root, in depth order", () => {
  const ledger = reduce(emptyLedger(5042002), tree());
  const nodes = subtree(ledger, ROOT);

  assert.deepEqual(nodes.map((n) => n.depth), [0, 1, 2]);
  assert.equal(nodes[2]!.node, GRAND);
});

test("an event about a node this range never saw opened is not invented into existence", () => {
  /* An indexer started at the wrong block is the ordinary case, and the wrong
     answer is a node row with a zero budget and no parent — which renders as a
     real agent with no limits. */
  const ledger = reduce(emptyLedger(5042002), [
    at({ kind: "Drawn", node: CHILD, counterparty: AISA, beneficiary: OP_CHILD, amount6: 2_400n, root: ROOT } as const),
  ]);

  assert.deepEqual(ledger.nodes, {});
  assert.equal(conductOf(ledger, CHILD), null);
});

test("a lifetime total counts every window, so a window that resets does not hide it", () => {
  /* The defect this guards is the one the contract's own lifetime gate was
     written for, arriving on the read side: an indexer that reports the
     window figure as the total says a mandate is fresh at the start of every
     window, when what the owner signed for is being spent down. */
  const ledger = reduce(emptyLedger(5042002), [
    ...tree(),
    ...draw(GRAND, [GRAND, CHILD, ROOT], AISA, 40_000_000n),
    ...draw(GRAND, [GRAND, CHILD, ROOT], ALLIUM, 40_000_000n),
  ]);

  const root = lifetimeOf(ledger, ledger.nodes[ROOT.toLowerCase() as Hex]!);
  assert.equal(root.cap6, 250_000_000n);
  assert.equal(root.spent6, 80_000_000n, "both windows count, and neither rolls off");
  assert.equal(root.left6, 170_000_000n);

  /* A child may be given a narrower total than its parent, and its own
     spending is its own — the parent carries the subtree, the child does not
     carry its parent. */
  const child = lifetimeOf(ledger, ledger.nodes[CHILD.toLowerCase() as Hex]!);
  assert.equal(child.cap6, 150_000_000n);
  assert.equal(child.spent6, 80_000_000n);
});

test("a lifetime read over a range that starts after the node was opened says so", () => {
  /* A total summed from a partial range is smaller than the truth, which is
     the direction that flatters. A surface may show it; it may not show it as
     the total. */
  const events = tree();
  const ledger = reduce(emptyLedger(5042002, 2n), events.filter((e) => e.blockNumber >= 2n));

  const child = ledger.nodes[CHILD.toLowerCase() as Hex]!;
  assert.equal(lifetimeOf(ledger, child).complete, true, "this node was opened inside the range");

  const whole = reduce(emptyLedger(5042002, 2n), events);
  assert.equal(
    lifetimeOf(whole, whole.nodes[ROOT.toLowerCase() as Hex]!).complete,
    false,
    "the root was opened in block 1 and the range starts at 2",
  );
});

/**
 * A snapshot is written beside itself and renamed.
 *
 * `writeFileSync` truncates before it fills, so a process killed mid-write
 * leaves valid JSON up to the cut and nothing after it — and the next start
 * hands that to `deserialize`, which throws. A cache that cannot be read then
 * takes down the service it exists to speed up, which is how this box has gone
 * down before.
 */
test("a snapshot is never half written where a reader can find it", () => {
  const ledger = reduce(emptyLedger(5042002), tree());
  const dir = mkdtempSync(join(tmpdir(), "cordon-snapshot-"));
  const path = join(dir, "ledger.json");

  writeSnapshot(path, ledger);
  assert.deepEqual(readdirSync(dir), ["ledger.json"], "and nothing beside it is left behind");

  /* The file that a kill would have truncated is the temporary one, and the
     name a reader opens still holds the last whole snapshot. */
  const whole = readFileSync(path, "utf8");
  writeFileSync(`${path}.tmp`, whole.slice(0, 40));
  assert.equal(readFileSync(path, "utf8"), whole);
  assert.equal(deserialize(readFileSync(path, "utf8")).chainId, 5042002);

  rmSync(dir, { recursive: true, force: true });
});

/**
 * A running box carries its snapshot across a deploy, so every field added to
 * the ledger is absent from the file already on disk. Absent has to mean zero
 * and not `undefined`, which is a `TypeError` inside the loop that must keep
 * running.
 */
test("a snapshot from an older build is read rather than crashed on", () => {
  const ledger = reduce(emptyLedger(5042002), tree());
  const older = JSON.parse(serialize(ledger)) as Record<string, unknown>;
  delete older.releasedUnattributed6;
  for (const row of Object.values(older.nodes as Record<string, Record<string, unknown>>)) {
    delete row.releasedTo6;
  }

  const read = deserialize(JSON.stringify(older));
  assert.equal(read.releasedUnattributed6, 0n);
  for (const row of Object.values(read.nodes)) assert.equal(row.releasedTo6, 0n);
});
