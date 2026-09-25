/**
 * Whether a name's roles grant an authority its mandate refuses.
 *
 * This has been got wrong once, and it failed in the direction that is hardest
 * to notice: the check reported the claim backwards. It could not have been
 * caught by a test, because the comparison could not be called without an RPC.
 * It can now.
 *
 * The ENSIP-25 key that the same scripts build is tested in `fixtures`, where
 * it lives.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mirror, verdict, type Grant } from "../src/namespace.ts";

const grant = (granted: boolean, allowed: boolean): Grant => ({ what: "may unregister", granted, allowed });

test("a name granting what the mandate refuses is the defect, and fails the run", () => {
  const m = mirror([grant(true, false)]);
  assert.equal(m.rows[0].verdict, "invented");
  assert.equal(m.invented, 1);
  assert.equal(m.exitCode, 1);
});

test("a name granting less than the mandate allows publishes nothing false, and passes", () => {
  const m = mirror([grant(false, true)]);
  assert.equal(m.rows[0].verdict, "narrower");
  assert.equal(m.narrower, 1);
  assert.equal(m.invented, 0);
  assert.equal(m.exitCode, 0);
});

/**
 * The regression. A check that called both disagreements "mismatch" reported
 * a name that grants *less* authority as though it had invented one — the
 * claim reversed, and in the direction that cries wolf about a name that is
 * safe. The two directions must never collapse into each other.
 */
test("the two disagreements are not the same failure, and do not collapse", () => {
  assert.equal(verdict(grant(true, false)), "invented");
  assert.equal(verdict(grant(false, true)), "narrower");
  assert.notEqual(verdict(grant(true, false)), verdict(grant(false, true)));
});

test("agreement in either direction is ok, including agreeing that nothing is granted", () => {
  assert.equal(verdict(grant(true, true)), "ok");
  assert.equal(verdict(grant(false, false)), "ok");
  const m = mirror([grant(true, true), grant(false, false)]);
  assert.equal(m.invented, 0);
  assert.equal(m.narrower, 0);
  assert.equal(m.exitCode, 0);
});

test("one invented authority fails a run however many rows agree around it", () => {
  const m = mirror([grant(true, true), grant(false, false), grant(true, false), grant(false, true)]);
  assert.equal(m.invented, 1);
  assert.equal(m.narrower, 1);
  assert.equal(m.exitCode, 1);
});

test("a name with nothing to mirror is not a name that failed", () => {
  const m = mirror([]);
  assert.deepEqual(m.rows, []);
  assert.equal(m.exitCode, 0);
});

test("the rows come back in the order they were asked, carrying their wording", () => {
  const m = mirror([
    { what: "operator may register beneath itself", granted: true, allowed: true },
    { what: "operator may unregister", granted: false, allowed: false },
  ]);
  assert.deepEqual(
    m.rows.map((row) => row.what),
    ["operator may register beneath itself", "operator may unregister"],
  );
});
