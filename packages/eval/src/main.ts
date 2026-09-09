/**
 * `npm --prefix packages/eval start` — run G7 and print what it found.
 *
 * Printing is all it does. The figures reach the console and the site through
 * `scripts/record-eval.mjs`, which writes them into a generated fixture, so no
 * number here is ever typed by hand into a file a surface reads.
 */
import { runEval } from "./run.ts";

const usd = (v: bigint) => `$${(Number(v) / 1e6).toFixed(2)}`;

const result = await runEval({ runs: Number(process.env.CORDON_EVAL_RUNS ?? 3) });

console.log(`${result.runs} runs each, ${result.sources} paid sources`);
console.log(`the task costs ${usd(result.taskCost6)} against a ${usd(result.window6)} window\n`);

for (const scenario of result.scenarios) {
  console.log(`${scenario.id} — ${scenario.agent}, ${scenario.workerShareBps / 100}% of the window each`);
  for (const c of scenario.conditions) {
    console.log(
      "  " +
        [
          c.id.padEnd(11),
          `${c.completed}/${c.runs} complete`,
          `${c.refusals} refused${c.reasons.length ? ` (${c.reasons.join(", ")})` : ""}`,
          `spent ${usd(c.spent6)}`,
          c.runaway6 > 0n ? `runaway ${usd(c.runaway6)}` : "runaway $0.00",
          `exposed at start ${usd(c.exposureAtStart6)}`,
          `${c.writesPerPurchase} writes per purchase`,
        ].join(" · "),
    );
  }
  console.log("");
}

console.log(`verdict: ${result.verdict}`);
process.exit(result.verdict === "work-gets-through" ? 0 : 1);
