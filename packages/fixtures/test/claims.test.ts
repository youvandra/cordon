/**
 * Prose that contradicts a recorded gate.
 *
 * Every defect this repository keeps paying for is one fact written down
 * twice, and the slowest copy to notice is a sentence: `gates.gen.ts` is
 * written by the run, so a gate turns green without anyone touching the
 * paragraph that says it has not been run yet. That paragraph was public on
 * the README, the docs and the console for a day after G2 and G3 both went
 * green.
 *
 * This reads every prose surface and fails on a sentence naming a gate that
 * the recorded run disagrees with. It is deliberately literal — it knows
 * nothing about English — so it catches the one shape that has actually
 * happened rather than pretending to review the writing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GATES } from "../src/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Prose a reader outside this repository can reach, or is asked to trust. */
const SURFACES = [
  "README.md",
  "packages/console/README.md",
  "packages/site/src/docs/pages/reference.tsx",
  "packages/site/src/pages/Drill.tsx",
];

/** The ways this project has actually written "no run has produced this". */
const UNRUN = [
  "has not been run",
  "have not been run",
  "is still pending",
  "stays empty",
  "reads nothing",
];

test("no surface says a gate is unrun that the recorded run says is green", () => {
  const green = GATES.filter((gate) => gate.status === "green").map((gate) => gate.id);

  for (const surface of SURFACES) {
    const text = readFileSync(resolve(root, surface), "utf8");
    for (const line of text.split("\n")) {
      const claim = UNRUN.find((phrase) => line.includes(phrase));
      if (!claim) continue;
      for (const id of green) {
        /* `G2` and not `G20`: the ids are short enough to appear inside other
           words, and a guard with a false positive gets deleted. */
        if (!new RegExp(`\\b${id}\\b`).test(line)) continue;
        assert.fail(
          `${surface} says "${claim}" on a line naming ${id}, which is green in ` +
            `gates.gen.ts. The run moved and the sentence did not:\n  ${line.trim()}`,
        );
      }
    }
  }
});

/**
 * The drill's number is the one figure a reader is most likely to take for
 * money that was paid, and no payment has settled. Wherever the page prints
 * it, the sentence that says so has to be on the same page.
 */
test("every page printing the drill's figure also says no payment settled", () => {
  for (const surface of ["packages/site/src/pages/Drill.tsx", "packages/site/src/docs/pages/reference.tsx"]) {
    const text = readFileSync(resolve(root, surface), "utf8");
    if (!text.includes("DRILL.reached6")) continue;
    assert.match(
      text,
      /authority reached, not money that left/,
      `${surface} prints what the drill reached without saying it is authority, not settlement`,
    );
  }
});
