/**
 * G7 — the run itself.
 *
 * Three runs of one task under each condition, scored against criteria fixed
 * in `task.ts` before any of it executed. The verdict is computed from the
 * numbers here and is allowed to come out against the product; the page that
 * prints it says so in the same type either way.
 *
 * **Latency is deliberately not one of the figures.** The first run of this
 * reported an 8,031ms median against the shared cap's 4,013ms, and both are
 * viem's transaction polling interval rather than anything either condition
 * did — anvil mines instantly, and a local chain's confirmation time is not
 * Arc's in any case. Two transactions against one is the real cost of the
 * fence per purchase, and that is counted instead.
 */
import { accept, taskCost6, SOURCES } from "./task.ts";
import { scriptedAgent, type Agent } from "./agent.ts";
import { startSellers } from "./sellers.ts";
import { cordonBuyer, sharedCapBuyer, type Buyer } from "./conditions.ts";
import { startWorld, type World } from "./world.ts";

export interface ConditionResult {
  id: Buyer["id"];
  runs: number;
  /** Briefs that met the acceptance criteria, out of `runs`. */
  completed: number;
  /** Sources cited with a body their seller never served. Must be zero. */
  unsupported: number;
  spent6: bigint;
  refusals: number;
  exposureAtStart6: bigint;
  chainWrites: number;
  /** Transactions one purchase costs under this condition. */
  writesPerPurchase: number;
}

export interface EvalRun {
  agent: string;
  runs: number;
  sources: number;
  window6: bigint;
  taskCost6: bigint;
  conditions: ConditionResult[];
  /**
   * `work-gets-through` requires every Cordon run to complete the brief with
   * no refusal. Anything else is the other verdict, including a run that was
   * refused for a good reason: a bound that binds legitimate work is still a
   * bound that blocked the job.
   */
  verdict: "work-gets-through" | "the-fence-blocks-the-work";
  recordedAt: string;
}

async function condition(
  world: World,
  make: () => Promise<Buyer>,
  runs: number,
  agent: Agent,
): Promise<ConditionResult> {
  let completed = 0;
  let unsupported = 0;
  let refusals = 0;
  let spent6 = 0n;
  let chainWrites = 0;
  let purchases = 0;
  let exposureAtStart6 = 0n;
  let id: Buyer["id"] = "cordon";

  for (let i = 0; i < runs; i++) {
    /* Fresh sellers every run, so a seller's own paid counter measures one
       run and the bodies cannot be served from a previous one. */
    const sellers = await startSellers({
      window6: world.window6, usdc: world.usdc, network: "eip155:31337",
    });
    const buyer = await make();
    id = buyer.id;
    exposureAtStart6 = buyer.exposureAtStart6;

    const result = await agent.run(sellers, buyer);
    const verdict = accept(result.brief, sellers.served());

    if (verdict.complete) completed += 1;
    unsupported += verdict.unsupported.length;
    refusals += result.refusals.length;
    spent6 += result.spent6;
    chainWrites += result.chainWrites;
    purchases += result.msPerPurchase.length;

    await buyer.stop();
    await sellers.stop();
  }

  return {
    id, runs, completed, unsupported, spent6, refusals, exposureAtStart6, chainWrites,
    writesPerPurchase: purchases === 0 ? 0 : chainWrites / purchases,
  };
}

export async function runEval(opts: { runs?: number; port?: number; agent?: Agent } = {}): Promise<EvalRun> {
  const runs = opts.runs ?? 3;
  const agent = opts.agent ?? scriptedAgent;
  const world = await startWorld(opts.port ?? 8547);

  try {
    const cordon = await condition(world, async () => cordonBuyer(world), runs, agent);
    /* The shared cap is given exactly what the task costs for all three runs.
       Giving it the whole window would make its exposure figure look worse
       than it has to; giving it less would make it run out. */
    const cap6 = taskCost6(world.window6) * BigInt(runs);
    const shared = await condition(world, () => sharedCapBuyer(world, cap6), runs, agent);

    return {
      agent: agent.id,
      runs,
      sources: SOURCES.length,
      window6: world.window6,
      taskCost6: taskCost6(world.window6),
      conditions: [cordon, shared],
      verdict:
        cordon.completed === runs && cordon.refusals === 0 && cordon.unsupported === 0
          ? "work-gets-through"
          : "the-fence-blocks-the-work",
      recordedAt: new Date().toISOString().slice(0, 10),
    };
  } finally {
    await world.stop();
  }
}
