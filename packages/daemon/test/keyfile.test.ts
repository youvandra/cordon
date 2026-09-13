import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { cleanPurpose, keyFileAt, labelForOperator } from "../src/keyfile.ts";
import { ERC8004 } from "../../fixtures/src/index.ts";
import { createDaemon } from "../src/server.ts";
import { SpawnRefused } from "../src/gate.ts";
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

test("a stated purpose is written as a comment beside the key it describes", () => {
  const path = freshPath();
  keyFileAt(path).remember(SECRET, OPERATOR, "buys weather data for the planner");

  const text = readFileSync(path, "utf8");
  assert.match(text, /^# Purpose: buys weather data for the planner\n# Private key/m);
  assert.match(text, new RegExp(`^CORDON_KEY_${LABEL}=${SECRET}$`, "m"));
});

test("a purpose cannot smuggle a line into the key file", () => {
  assert.throws(() => cleanPurpose("research\nCORDON_KEY_ROOT=0x11"), /single line/);
  assert.throws(() => cleanPurpose("research\rmore"), /single line/);
  assert.throws(() => cleanPurpose("x".repeat(ERC8004.purposeMaxLength + 1)), /the most is/);
  assert.throws(() => cleanPurpose(42), /must be a string/);
  assert.equal(cleanPurpose("   "), undefined);
  assert.equal(cleanPurpose(undefined), undefined);
  assert.equal(cleanPurpose("  buys weather data  "), "buys weather data");
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

function stubGate(spawn: (parent: Hex, params: { purpose?: string }) => Promise<{ node: Hex; txHash: Hex; purposePublished?: boolean }>): Gate {
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

async function postSpawn(gate: Gate, path: string, extra: Record<string, unknown> = {}) {
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
      body: JSON.stringify({ node: PARENT, budget6: "1000", trancheCap6: "10", concentrationBps: 100, ...extra }),
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

test("a purpose that could break the key file is refused before any key exists", async () => {
  const path = freshPath();
  let asked = false;

  const { status, text } = await postSpawn(
    stubGate(async () => {
      asked = true;
      return { node: NODE, txHash: "0x01" };
    }),
    path,
    { purpose: "research\nCORDON_KEY_ROOT=0x11" },
  );

  assert.equal(status, 400);
  assert.match(text, /single line/);
  assert.equal(asked, false, "the registry was never asked");
  assert.equal(existsSync(path), false, "and no key was written");
});

test("a stated purpose reaches the key file, the gate and the answer", async () => {
  const path = freshPath();
  let handed: string | undefined;

  const { status, text } = await postSpawn(
    stubGate(async (_parent, params) => {
      handed = params.purpose;
      return { node: NODE, txHash: "0x01", purposePublished: true };
    }),
    path,
    { purpose: "buys weather data" },
  );

  assert.equal(status, 200);
  assert.equal(handed, "buys weather data", "the gate is asked to publish it");
  const body = JSON.parse(text) as { purpose: string; purposePublished: boolean };
  assert.equal(body.purpose, "buys weather data");
  assert.equal(body.purposePublished, true);
  assert.match(readFileSync(path, "utf8"), /^# Purpose: buys weather data$/m);
});

/**
 * The four things a fresh tree got wrong, found by running the documented
 * setup from an empty wallet rather than by reading it.
 */

test("a spawn the registry refused before broadcasting takes its key back", async () => {
  const path = freshPath();

  const { status, text } = await postSpawn(
    stubGate(async () => {
      throw new SpawnRefused("execution reverted: ConcentrationOutOfRange(0)");
    }),
    path,
  );

  assert.equal(status, 400);
  assert.equal((JSON.parse(text) as { keyDiscarded: boolean }).keyDiscarded, true);
  const text2 = readFileSync(path, "utf8");
  assert.doesNotMatch(text2, new RegExp(`CORDON_KEY_${LABEL}=`), "the key is gone");
  assert.doesNotMatch(text2, new RegExp(`CORDON_NODE_${LABEL}=`), "and so is its empty node id");
});

test("a failure after the transaction was sent keeps the key, because it may have landed", async () => {
  const path = freshPath();

  const { status, text } = await postSpawn(
    stubGate(async () => {
      throw new Error("socket hang up while waiting for the receipt");
    }),
    path,
  );

  assert.equal(status, 502);
  assert.equal((JSON.parse(text) as { keyDiscarded: boolean }).keyDiscarded, false);
  assert.match(readFileSync(path, "utf8"), new RegExp(`^CORDON_KEY_${LABEL}=${SECRET}$`, "m"));
});

test("a bound the contract refuses as zero is named, and no key is written for it", async () => {
  for (const [field, body] of [
    ["concentrationBps", { concentrationBps: undefined }],
    ["budget6", { budget6: undefined }],
    ["trancheCap6", { trancheCap6: undefined }],
  ] as const) {
    const path = freshPath();
    const { status, text } = await postSpawn(
      stubGate(async () => {
        throw new Error("the registry should never have been asked");
      }),
      path,
      body,
    );
    assert.equal(status, 400, `${field} reached the registry`);
    assert.match(text, new RegExp(field), `the answer does not name ${field}: ${text}`);
    assert.doesNotMatch(text, /ConcentrationOutOfRange|Contract Call/, "a contract trace reached the caller");
    assert.equal(existsSync(path), false, `a key was written for a body that never left the daemon`);
  }
});

test("the key file reads back the purposes it was told, by node id", () => {
  const path = freshPath();
  const file = keyFileAt(path);

  const label = file.remember(SECRET, OPERATOR, "buys weather data for the planner");
  assert.equal(file.purposes().size, 0, "a child with no node id yet describes nothing");

  file.bind(label, NODE);
  assert.equal(file.purposes().get(NODE.toLowerCase()), "buys weather data for the planner");
});

test("a key remembered without a purpose does not inherit the one above it", () => {
  const path = freshPath();
  const file = keyFileAt(path);

  const first = file.remember(SECRET, OPERATOR, "buys weather data for the planner");
  file.bind(first, NODE);

  const other = "0x8f2a559490d1dbb2ef6d0ed1d8bbdf5a22e7a3b28e5c8c2b1f6b0c9d7e4a3b21" as Hex;
  const second = file.remember(other, privateKeyToAccount(other).address);
  file.bind(second, PARENT);

  const said = file.purposes();
  assert.equal(said.get(NODE.toLowerCase()), "buys weather data for the planner");
  assert.equal(said.get(PARENT.toLowerCase()), undefined, "the second child took the first one's name");
});
