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

console.log(`agent: ${result.agent}, ${result.runs} runs, ${result.sources} paid sources`);
console.log(`task costs ${usd(result.taskCost6)} against a ${usd(result.window6)} window\n`);

for (const c of result.conditions) {
  console.log(
    [
      c.id.padEnd(11),
      `${c.completed}/${c.runs} complete`,
      `${c.refusals} refused`,
      `spent ${usd(c.spent6)}`,
      `exposed at start ${usd(c.exposureAtStart6)}`,
      `${c.chainWrites} writes, ${c.writesPerPurchase} per purchase`,
    ].join(" · "),
  );
}

console.log(`\nverdict: ${result.verdict}`);
process.exit(result.verdict === "work-gets-through" ? 0 : 1);
