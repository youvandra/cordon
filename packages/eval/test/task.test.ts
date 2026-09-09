import { test } from "node:test";
import assert from "node:assert/strict";
import { accept, priceOf, taskCost6, SOURCES, type Brief } from "../src/task.ts";

const WINDOW = 20_000_000n;

const served = new Map(SOURCES.map((s) => [s.id, `body:${s.id}`]));
const cite = (ids: string[], bodies?: Record<string, string>): Brief => ({
  citations: ids.map((id) => ({
    sourceId: id,
    body: bodies?.[id] ?? `body:${id}`,
    paidTo: "0x1111111111111111111111111111111111111111",
    amount6: 1n,
  })),
});

test("the task is a proportion of the window, not an amount", () => {
  const source = SOURCES[0]!;
  assert.equal(priceOf(source, WINDOW), (WINDOW * BigInt(source.priceBps)) / 10_000n);
  /* Halve the window and every price halves with it. An absolute price under
     a resizable root is the defect this repository keeps paying for. */
  assert.equal(priceOf(source, WINDOW / 2n) * 2n, priceOf(source, WINDOW));
});

test("the whole task fits well inside the window it runs under", () => {
  /* If the task cost approached the budget, a refusal would be the mandate
     being small rather than the fence being wrong, and the run would prove
     nothing about either. */
  assert.ok(taskCost6(WINDOW) * 10n < WINDOW);
});

test("a brief is complete only when every source is cited", () => {
  const all = accept(cite(SOURCES.map((s) => s.id)), served);
  assert.equal(all.complete, true);
  assert.deepEqual(all.missing, []);

  const short = accept(cite(SOURCES.slice(0, 3).map((s) => s.id)), served);
  assert.equal(short.complete, false);
  assert.deepEqual(short.missing, [SOURCES[3]!.id]);
});

test("a citation nobody paid for is worse than a missing one", () => {
  /* The failure to catch is a brief that says the right things without having
     bought them: complete on its face, unsupported underneath. */
  const invented = accept(
    cite(SOURCES.map((s) => s.id), { [SOURCES[1]!.id]: "a fact from nowhere" }),
    served,
  );
  assert.equal(invented.complete, false);
  assert.deepEqual(invented.unsupported, [SOURCES[1]!.id]);
  assert.deepEqual(invented.missing, []);
});

test("the sections split the sources, because the tree is the subject", () => {
  const left = SOURCES.filter((s) => s.section === "left");
  const right = SOURCES.filter((s) => s.section === "right");
  assert.ok(left.length > 0 && right.length > 0);
  assert.equal(left.length + right.length, SOURCES.length);
});
