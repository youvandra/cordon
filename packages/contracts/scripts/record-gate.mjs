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
import { globSync } from "node:fs";
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
  raw = execFileSync("forge", ["test", "--match-path", matchPath, "--json", "--offline"], {
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

/**
 * Every file the glob names has to appear in the report.
 *
 * This is the check whose absence produced the drift this script exists to
 * prevent. A forge run that ends early — a compile that fell over, a solc it
 * could not fetch, a suite skipped — still emits valid JSON for the suites it
 * did reach, and every number in it is `Success`. So the recorder wrote a green
 * gate with a quarter of its tests in it, and the site printed that figure as
 * the gate's size. A count that is silently low is worse than a missing one:
 * `pending` is visible, and "66 tests" is not.
 *
 * So the report is measured against the files on disk, not trusted to be
 * complete. A gate that cannot account for one of its own files is red.
 */
const cwd = resolve(here, "..");
const expected = globSync(matchPath, { cwd }).sort();
const covered = new Set(Object.keys(report).map((key) => key.split(":")[0]));
const missing = expected.filter((file) => !covered.has(file));
if (expected.length === 0) {
  console.error(`${gateId}: '${matchPath}' matches no test file`);
  failed = true;
}
if (missing.length > 0) {
  console.error(
    `${gateId}: the run reported ${covered.size} of ${expected.length} test files.\n` +
      `missing: ${missing.join(", ")}\n` +
      `a partial run is not a green gate — the count would read low and look deliberate.`,
  );
  failed = true;
}

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
