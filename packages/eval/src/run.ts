/**
 * G7 — the run itself.
 *
 * Two scenarios, three runs of each under each condition, scored against
 * criteria fixed in `task.ts` before any of it executed. The verdict is
 * computed from the numbers and is allowed to come out against the product;
 * the page that prints it says so in the same type either way.
 *
 * 1. **The work.** Nothing goes wrong. The question is whether the fence lets
 *    a legitimate job finish, because a cap that blocks everything satisfies
 *    every safety test while failing to be a product.
 * 2. **A worker in a loop.** One worker does its job and then keeps buying,
 *    which is the failure agents actually have. The question is whether the
 *    *other* worker's section still gets done.
 *
 * Both conditions are given the same authority — the window the owner signed —
 * so the comparison is like for like. What differs is where that authority
 * lives: under a bound the contract checks, or in a counter inside the process
 * doing the spending.
 *
 * **Latency is deliberately not one of the figures.** The first run of this
 * reported an 8,031ms median against the shared cap's 4,013ms, and both are
 * viem's transaction polling interval rather than anything either condition
 * did — anvil mines instantly, and a local chain's confirmation time is not
 * Arc's in any case. Two transactions against one is the real cost of the
 * fence per purchase, and that is counted instead.
 */
import { accept, taskCost6, SOURCES } from "./task.ts";
import { scriptedAgent, faultyAgent, type Agent } from "./agent.ts";
import { startSellers } from "./sellers.ts";
import { cordonBuyer, sharedCapBuyer, type Buyer } from "./conditions.ts";
import { startWorld, WINDOW6, type World } from "./world.ts";

export interface ConditionResult {
  id: Buyer["id"];
  runs: number;
  /** Briefs that met the acceptance criteria, out of `runs`. */
  completed: number;
  /** Sources cited with a body their seller never served. Must be zero. */
  unsupported: number;
  spent6: bigint;
  /** Of `spent6`, what a worker's runaway loop took. */
  runaway6: bigint;
  refusals: number;
  /** Which bounds did the refusing, named by the contract. */
  reasons: string[];
  exposureAtStart6: bigint;
  chainWrites: number;
  /**
   * Transactions one purchase costs, per purchase that happened rather than
   * per attempt: a refusal costs no gas and no transaction, so counting
   * attempts would report the fence as cheaper the more it refused.
   */
  writesPerPurchase: number;
}

export interface Scenario {
  id: "the-work" | "a-worker-in-a-loop";
  /** What the workers did. Never implied. */
  agent: string;
  /** How much of the root window each worker was given, in basis points. */
  workerShareBps: number;
  conditions: ConditionResult[];
}

export interface EvalRun {
  runs: number;
  sources: number;
  window6: bigint;
  taskCost6: bigint;
  scenarios: Scenario[];
  /**
   * `work-gets-through` requires Cordon to deliver the brief in every run of
   * both scenarios, with nothing legitimate refused in the first. Anything
   * else is the other verdict, including a refusal for a good reason: a bound
   * that binds legitimate work is still a bound that blocked the job.
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
  let runaway6 = 0n;
  let chainWrites = 0;
  let purchases = 0;
  const reasons = new Set<string>();
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
    for (const refusal of result.refusals) reasons.add(refusal.reason);
    spent6 += result.spent6;
    runaway6 += result.runaway6;
    chainWrites += result.chainWrites;
    purchases += result.paid;

    await buyer.stop();
    await sellers.stop();
    /* Runs have to be independent, and a window that never rolls would have
       run 2 inherit run 1's spending. */
    await world.warpWindow();
  }

  return {
    id, runs, completed, unsupported, spent6, runaway6, refusals,
    reasons: [...reasons].sort(),
    exposureAtStart6, chainWrites,
    writesPerPurchase: purchases === 0 ? 0 : Number((chainWrites / purchases).toFixed(2)),
  };
}

async function scenario(
  id: Scenario["id"],
  agent: Agent,
  workerShareBps: number,
  runs: number,
  port: number,
): Promise<Scenario> {
  const world = await startWorld(port, workerShareBps);
  try {
    const cordon = await condition(world, async () => cordonBuyer(world), runs, agent);
    /* The same authority the owner signed, held somewhere else. Anything
       smaller would be a shared cap chosen to lose. */
    const shared = await condition(world, () => sharedCapBuyer(world, world.window6), runs, agent);
    return { id, agent: agent.id, workerShareBps, conditions: [cordon, shared] };
  } finally {
    await world.stop();
  }
}

export async function runEval(opts: { runs?: number; port?: number } = {}): Promise<EvalRun> {
  const runs = opts.runs ?? 3;
  /* Above every other suite's anvil: the daemon's is 8546, the meter's 8548,
     and this file's own tests take 8549 and 8551. Two suites on one port do
     not fail to bind, they quietly talk to each other's chain. */
  const port = opts.port ?? 8560;

  /* The whole window each, in the first scenario: either worker may spend
     everything and between them they still may not, which is the delegation a
     shared cap cannot express. Half each in the second, because when one
     worker goes wrong the bound that saves the other is its sibling's. */
  const work = await scenario("the-work", scriptedAgent, 10_000, runs, port);
  const loop = await scenario("a-worker-in-a-loop", faultyAgent, 5_000, runs, port + 1);

  const cordonOf = (s: Scenario) => s.conditions.find((c) => c.id === "cordon")!;
  const delivered =
    cordonOf(work).completed === runs &&
    cordonOf(loop).completed === runs &&
    cordonOf(work).refusals === 0 &&
    cordonOf(work).unsupported === 0 &&
    cordonOf(loop).unsupported === 0;

  return {
    runs,
    sources: SOURCES.length,
    window6: WINDOW6,
    taskCost6: taskCost6(WINDOW6),
    scenarios: [work, loop],
    verdict: delivered ? "work-gets-through" : "the-fence-blocks-the-work",
    recordedAt: new Date().toISOString().slice(0, 10),
  };
}
