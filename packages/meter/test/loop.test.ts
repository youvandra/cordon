/**
 * The scheduling, which both processes now share.
 *
 * The meter and the attest endpoint run the same reducer over the same
 * snapshot. The meter scheduled its reads after the last one finished and
 * wrote down why; attest kept `setInterval`, so a tick that outlived its
 * interval started a second read of the same range — and `reduce` folds events
 * into the ledger in place, so the same draws and refusals landed twice.
 *
 * These tests are about the one property that prevents it: never two runs at
 * once, however long a run takes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { everyAfter } from "../src/loop.ts";

/** Timers under the test's control. Real ones make this a test about sleep. */
function clock() {
  const queue: { fn: () => void; at: number }[] = [];
  let now = 0;
  return {
    setTimer: (fn: () => void, ms: number) => {
      queue.push({ fn, at: now + ms });
      return { unref: () => {} };
    },
    /** Fire everything due at or before `to`, in order. */
    async advance(to: number) {
      now = to;
      for (;;) {
        const i = queue.findIndex((t) => t.at <= now);
        if (i === -1) return;
        const [due] = queue.splice(i, 1);
        due!.fn();
        /* Let the promise chain inside the tick settle before looking for the
           timer it schedules on the way out. */
        await new Promise((done) => setImmediate(done));
      }
    },
    pending: () => queue.length,
  };
}

test("a run that outlives its interval does not get a second one beside it", async () => {
  const timer = clock();
  let running = 0;
  let overlapped = false;
  let finished = 0;
  let release: (() => void) | null = null;

  const loop = everyAfter(
    async () => {
      running += 1;
      if (running > 1) overlapped = true;
      /* A read waiting out a rate limit: it does not finish on its own. */
      await new Promise<void>((done) => {
        release = done;
      });
      running -= 1;
      finished += 1;
    },
    { intervalMs: 5_000, setTimer: timer.setTimer },
  );

  await new Promise((done) => setImmediate(done));
  assert.equal(running, 1, "the first read starts at once rather than after one interval");
  assert.equal(timer.pending(), 0, "and nothing is scheduled while it is still in flight");

  /* Four intervals go by with the read still hanging. `setInterval` would have
     queued four more reads of the same range by now. */
  await timer.advance(20_000);
  assert.equal(running, 1, "no second read of a range the first one has not finished");
  assert.equal(overlapped, false);

  release!();
  await new Promise((done) => setImmediate(done));
  assert.equal(finished, 1);
  assert.equal(timer.pending(), 1, "the next one is scheduled from the end of that one");

  loop.stop();
});

test("a failed run is reported and the next one still happens", async () => {
  const timer = clock();
  const errors: string[] = [];
  let runs = 0;

  const loop = everyAfter(
    async () => {
      runs += 1;
      if (runs === 1) throw new Error("pruned history unavailable");
    },
    { intervalMs: 1_000, setTimer: timer.setTimer, onError: (error) => errors.push(error.message) },
  );

  await new Promise((done) => setImmediate(done));
  assert.deepEqual(errors, ["pruned history unavailable"]);

  await timer.advance(1_000);
  assert.equal(runs, 2, "a read that failed leaves the last good ledger and tries again");

  loop.stop();
  await timer.advance(10_000);
  assert.equal(runs, 2, "and a stopped loop schedules nothing further");
});
