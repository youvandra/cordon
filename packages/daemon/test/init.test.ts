/**
 * The one thing this command must never do is print a private key, and the one
 * thing it must never do twice is overwrite the key an open mandate names.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { initOperators, labelFor } from "../src/init.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../src/init-cli.ts");
const out = () => join(mkdtempSync(join(tmpdir(), "cordon-init-")), "cordon.env");

/* Anvil's tenth account. Public, funded, worthless — and a known value, so the
   assertion is that the file holds the key it was handed rather than that two
   random strings happen to match. */
const KNOWN = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as Hex;

test("no private key reaches the terminal", () => {
  const path = out();
  const shown = execFileSync("node", [cli, "--nodes", "2", "--out", path], { encoding: "utf8" });

  const written = readFileSync(path, "utf8");
  const keys = [...written.matchAll(/^CORDON_KEY_[A-Z0-9]+=(0x[0-9a-f]{64})$/gm)].map((m) => m[1]!);
  assert.equal(keys.length, 2, "two nodes, two keys");

  for (const key of keys) {
    assert.ok(!shown.includes(key), "a private key was printed");
    /* And its address was, because that is what the user has to copy. */
    assert.ok(shown.includes(privateKeyToAccount(key).address), "an address was not printed");
  }
});

test("the file is readable only by its owner", () => {
  const path = out();
  initOperators({ path, nodes: 1 });
  /* Not 0644 with a friendly comment: the comment does not stop `cat`. */
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("the addresses shown are the addresses of the keys written", () => {
  const path = out();
  const { operators } = initOperators({ path, nodes: 1, generate: () => KNOWN });
  assert.equal(operators[0]!.address, privateKeyToAccount(KNOWN).address);
  assert.match(readFileSync(path, "utf8"), new RegExp(`CORDON_KEY_ROOT=${KNOWN}`));
});

test("a second run refuses, because a key may be a live mandate's operator", () => {
  const path = out();
  initOperators({ path, nodes: 1 });
  assert.throws(() => initOperators({ path, nodes: 1 }), /already exists/);
  /* `--force` is available and says what it costs; a mandate's operator is set
     at `open` and cannot be repointed afterwards. */
  assert.doesNotThrow(() => initOperators({ path, nodes: 1, force: true }));
});

test("every node gets its own label, and the first is the root", () => {
  const path = out();
  const { operators } = initOperators({ path, nodes: 4 });
  assert.deepEqual(operators.map((o) => o.label), ["ROOT", "WORKER1", "WORKER2", "WORKER3"]);
  assert.equal(new Set(operators.map((o) => o.address)).size, 4, "two nodes shared a key");
  assert.equal(labelFor(0, 4), "ROOT");
});

test("a node count nobody meant is refused rather than obeyed", () => {
  assert.throws(() => initOperators({ path: out(), nodes: 0 }), /between 1 and 16/);
  assert.throws(() => initOperators({ path: out(), nodes: 99 }), /between 1 and 16/);
});
