import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { keyFileAt, labelForOperator } from "../src/keyfile.ts";
import { createDaemon } from "../src/server.ts";
import type { Gate } from "../src/gate.ts";
import type { Settler } from "../src/settle.ts";

/**
 * A child spawned at run time used to have its key in memory only, so a daemon
 * restart left a live mandate on chain that nobody could ever sign for again —
 * its operator is fixed at spawn. These are the guards on the fix, and the one
 * that matters most is the order: the key is on disk before the registry is
 * asked, so a spawn that lands and a write that fails cannot both happen.
 */

const SECRET = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const OPERATOR = privateKeyToAccount(SECRET).address;
const LABEL = labelForOperator(OPERATOR);
const NODE = `0x${"ab".repeat(32)}` as Hex;
const PARENT = `0x${"cd".repeat(32)}` as Hex;

const freshPath = () => join(mkdtempSync(join(tmpdir(), "cordon-keyfile-")), "cordon.env");
const modeOf = (path: string) => statSync(path).mode & 0o777;

test("a spawned key is written at 0600, with its node id left empty", () => {
  const path = freshPath();
  const label = keyFileAt(path).remember(SECRET, OPERATOR);

  const text = readFileSync(path, "utf8");
  assert.equal(label, LABEL);
  assert.match(text, new RegExp(`^CORDON_KEY_${LABEL}=${SECRET}$`, "m"));
  assert.match(text, new RegExp(`^CORDON_NODE_${LABEL}=$`, "m"));
  assert.equal(modeOf(path), 0o600);
});

test("binding fills that label's node id and leaves every other line alone", () => {
  const path = freshPath();
  const before = "# written by init\nCORDON_KEY_ROOT=0x11\nCORDON_NODE_ROOT=0x22";
  writeFileSync(path, before, { mode: 0o644 });

  const file = keyFileAt(path);
  file.bind(file.remember(SECRET, OPERATOR), NODE);

  const text = readFileSync(path, "utf8");
  assert.ok(text.startsWith(`${before}\n`), "what init wrote is untouched");
  assert.match(text, new RegExp(`^CORDON_NODE_${LABEL}=${NODE}$`, "m"));
  assert.match(text, new RegExp(`^CORDON_KEY_${LABEL}=${SECRET}$`, "m"));
  assert.equal(modeOf(path), 0o600, "an existing looser mode is tightened");
});

test("binding a label that was never remembered is refused, not skipped", () => {
  const path = freshPath();
  writeFileSync(path, "CORDON_NODE_ROOT=\n");
  assert.throws(() => keyFileAt(path).bind("CHILD_DEADBEEF", NODE), /no empty CORDON_NODE_CHILD_DEADBEEF/);
});

test("a key already in the file is never overwritten", () => {
  const path = freshPath();
  const file = keyFileAt(path);
  file.remember(SECRET, OPERATOR);
  assert.throws(() => file.remember(SECRET, OPERATOR), /already holds a key/);
});

function stubGate(spawn: () => Promise<{ node: Hex; txHash: Hex }>): Gate {
  return {
    addOperator: (secret: Hex) => privateKeyToAccount(secret).address,
    spawn,
  } as unknown as Gate;
}

const unusedSettler: Settler = {
  async settle() {
    throw new Error("not called");
  },
};

async function postSpawn(gate: Gate, path: string) {
  const daemon = createDaemon({
    gate,
    settler: unusedSettler,
    acceptable: { networks: [], assets: [] },
    newOperatorKey: () => SECRET,
    keyFile: keyFileAt(path),
  });
  await new Promise<void>((resolve) => daemon.listen(0, "127.0.0.1", resolve));
  const { port } = daemon.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/spawn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ node: PARENT, budget6: "1000", trancheCap6: "10", concentrationBps: 100 }),
    });
    return { status: res.status, text: await res.text() };
  } finally {
    await new Promise<void>((resolve) => daemon.close(() => resolve()));
  }
}

test("the daemon writes the child's key before it asks the registry, so a failed spawn loses nothing", async () => {
  const path = freshPath();
  let keyOnDiskWhenAsked = false;

  const { status, text } = await postSpawn(
    stubGate(async () => {
      keyOnDiskWhenAsked = readFileSync(path, "utf8").includes(SECRET);
      throw new Error("execution reverted");
    }),
    path,
  );

  assert.equal(keyOnDiskWhenAsked, true, "the key was on disk before spawn was called");
  assert.ok(status >= 400, `a reverted spawn is not reported as a success (got ${status})`);
  assert.ok(!text.includes(SECRET.slice(2)), "the key is not in the response");
  assert.match(readFileSync(path, "utf8"), new RegExp(`^CORDON_NODE_${LABEL}=$`, "m"));
});

test("a spawn that lands leaves the node id beside its key, and never returns the key", async () => {
  const path = freshPath();

  const { status, text } = await postSpawn(stubGate(async () => ({ node: NODE, txHash: "0x01" })), path);

  assert.equal(status, 200);
  const body = JSON.parse(text) as { node: string; operator: string; label: string; nodeIdSaved: boolean };
  assert.equal(body.label, LABEL);
  assert.equal(body.nodeIdSaved, true);
  assert.equal(body.operator, OPERATOR);
  assert.ok(!text.includes(SECRET.slice(2)), "the key is not in the response");
  assert.match(readFileSync(path, "utf8"), new RegExp(`^CORDON_NODE_${LABEL}=${NODE}$`, "m"));
});
