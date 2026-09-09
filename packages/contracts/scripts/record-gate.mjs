/**
 * Runs a gate's tests and writes what actually happened into
 * packages/fixtures/src/gates.gen.ts.
 *
 * The number of tests behind a gate is a figure like any other, so it may not
 * be typed by a human into a file the console reads. It is recorded from the
 * run, and a gate that has not been run stays `pending`.
 *
 * Usage: node scripts/record-gate.mjs G1 'test/G1_*'
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGate } from "./gates.mjs";

const [, , gateId, matchPath] = process.argv;
if (!gateId || !matchPath) {
  console.error("usage: node scripts/record-gate.mjs <gateId> <match-path-glob>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));

let raw;
let failed = false;
try {
  raw = execFileSync("forge", ["test", "--match-path", matchPath, "--json"], {
    cwd: resolve(here, ".."),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  raw = e.stdout ?? "";
  failed = true;
}

const report = JSON.parse(raw.slice(raw.indexOf("{")));
let passed = 0;
let total = 0;
for (const suite of Object.values(report)) {
  for (const result of Object.values(suite.test_results ?? {})) {
    total += 1;
    if (result.status === "Success") passed += 1;
  }
}
if (total === 0) failed = true;

const record = {
  id: gateId,
  status: failed || passed !== total ? "red" : "green",
  tests: total,
  passed,
  recordedAt: new Date().toISOString().slice(0, 10),
};

writeGate(record);

console.log(`${gateId}: ${record.status} — ${passed}/${total} tests`);
process.exit(failed ? 1 : 0);
