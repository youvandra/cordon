/**
 * The two answers about a name that are decided without reading a chain.
 *
 * Both have been got wrong once in this project's history, and both failed
 * quietly: a check that reported the claim backwards, and a record key one
 * byte out that made a published registration look like one that was never
 * made. Neither defect could have been caught by a test, because neither
 * piece of arithmetic could be called without an RPC. It can now.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { erc7930, mirror, registrationKey, verdict, type Grant } from "../src/namespace.ts";

const grant = (granted: boolean, allowed: boolean): Grant => ({ what: "may unregister", granted, allowed });

/* ── the mirror ─────────────────────────────────────────────────────────── */

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

/* ── the ENSIP-25 key ───────────────────────────────────────────────────── */

/**
 * Pinned by hand rather than by re-running the builder, which would assert
 * only that the function agrees with itself. Sepolia is 11155111 — `0xaa36a7`,
 * three bytes, so the length prefix is `03` and the address prefix is `14`.
 */
test("the registration key is the ERC-7930 bytes ENSIP-25 asks for, to the byte", () => {
  assert.equal(
    erc7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e"),
    "0x000100000" + "3aa36a7" + "14" + "8004a818bfb912233c491871b3d84c89a494bd9e",
  );
});

test("a chain reference of an odd number of hex digits is padded, not truncated", () => {
  /* 1 → 0x01, one byte. An unpadded "1" would shift every byte after it. */
  const key = erc7930(1, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
  assert.equal(key.slice(0, 12), "0x0001000001");
  assert.equal(key.length, 2 + 4 + 4 + 2 + 2 + 2 + 40);
});

test("the address is lowercased, so a checksummed one and a flat one key the same record", () => {
  assert.equal(
    erc7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e"),
    erc7930(11155111, "0x8004a818bfb912233c491871b3d84c89a494bd9e"),
  );
});

/**
 * The failure mode these guard. A malformed key is not rejected by a resolver
 * — it simply resolves to nothing, and nothing is exactly what an agent that
 * never registered looks like. So the builder refuses what it cannot encode
 * rather than encoding it wrongly.
 */
test("something that is not a 20-byte address is refused rather than encoded short", () => {
  assert.throws(() => erc7930(11155111, "0x8004"), /not a 20-byte address/);
  assert.throws(() => erc7930(11155111, "8004a818bfb912233c491871b3d84c89a494bd9e"), /not a 20-byte address/);
});

test("a chain id that is not a positive integer is refused", () => {
  assert.throws(() => erc7930(0, "0x8004A818BFB912233c491871b3d84c89A494BD9e"), /positive integer/);
  assert.throws(() => erc7930(-1, "0x8004A818BFB912233c491871b3d84c89A494BD9e"), /positive integer/);
  assert.throws(() => erc7930(1.5, "0x8004A818BFB912233c491871b3d84c89A494BD9e"), /positive integer/);
});

test("the key names the agent id beside the registry it is registered in", () => {
  assert.equal(
    registrationKey(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e", 894130n),
    "agent-registration[0x000100000" + "3aa36a7" + "14" + "8004a818bfb912233c491871b3d84c89a494bd9e" + "][894130]",
  );
});
