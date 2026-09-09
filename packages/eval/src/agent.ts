/**
 * The thing doing the work.
 *
 * One implementation, and it is deterministic: each worker buys the sources
 * its section needs, in order, and cites what came back. A model would be more
 * lifelike and would put its own variance between the fence and the result —
 * with three runs a condition, that variance would be the finding.
 *
 * So the run states which agent produced it (`EvalRun.agent`) rather than
 * implying one. An LLM-driven agent is the obvious second implementation of
 * this interface, and is not stubbed here: a half-built one that sometimes
 * calls a model would make every number in the table unreadable.
 */
import { SOURCES } from "./task.ts";
import type { Brief, Citation } from "./task.ts";
import type { Sellers } from "./sellers.ts";
import type { Buyer } from "./conditions.ts";
import type { WorkerId } from "./world.ts";

export interface AgentResult {
  brief: Brief;
  refusals: { sourceId: string; reason: string }[];
  spent6: bigint;
  /** Of `spent6`, what the faulty worker's loop took. Zero when none went wrong. */
  runaway6: bigint;
  /** Purchases that actually happened. Refused attempts are not purchases. */
  paid: number;
  chainWrites: number;
  msPerPurchase: number[];
}

export interface Agent {
  id: string;
  run(sellers: Sellers, buyer: Buyer): Promise<AgentResult>;
}

/** The most expensive source, which is what a runaway loop lands on. */
const DEAREST = [...SOURCES].sort((a, b) => b.priceBps - a.priceBps)[0]!;

/**
 * A worker that will not stop.
 *
 * Not an attacker — a loop that does not terminate, which is the failure agents
 * actually have. The left worker buys its own section and then keeps buying the
 * dearest source it knows about until something stops it. The right worker is
 * unchanged and still needs its two sources, so the question the run answers is
 * whether *its* section survives a sibling that went wrong.
 *
 * The stop is a count, not a bound: if 200 purchases go through, nothing
 * stopped it and the run should say so rather than looping forever.
 */
const RUNAWAY_STOP = 200;

export const faultyAgent: Agent = {
  id: "scripted, one worker in a loop",
  async run(sellers, buyer) {
    const citations: Citation[] = [];
    const refusals: { sourceId: string; reason: string }[] = [];
    const msPerPurchase: number[] = [];
    let spent6 = 0n;
    let runaway6 = 0n;
    let paid = 0;
    let chainWrites = 0;

    const buy = async (section: WorkerId, sourceId: string) => {
      const seller = sellers.byId(sourceId);
      const purchase = await buyer.buy(section, seller.url);
      msPerPurchase.push(purchase.ms);
      chainWrites += purchase.chainWrites;
      if (purchase.ok) {
        spent6 += purchase.amount6;
        paid += 1;
      }
      return purchase;
    };

    const section = async (which: WorkerId) => {
      for (const source of SOURCES.filter((s) => s.section === which)) {
        const purchase = await buy(which, source.id);
        if (!purchase.ok) {
          refusals.push({ sourceId: source.id, reason: purchase.refusedBy ?? "unknown" });
          continue;
        }
        citations.push({
          sourceId: source.id,
          body: purchase.body ?? "",
          paidTo: purchase.paidTo ?? null,
          amount6: purchase.amount6,
        });
      }
    };

    /* Order is the whole experiment: the left worker does its job, then goes
       wrong, and only then does the right worker try to do its own. A loop
       that ran last would take money nobody else was going to ask for. */
    await section("left");

    for (let i = 0; i < RUNAWAY_STOP; i++) {
      const purchase = await buy("left", DEAREST.id);
      if (!purchase.ok) {
        refusals.push({ sourceId: DEAREST.id, reason: purchase.refusedBy ?? "unknown" });
        break;
      }
      runaway6 += purchase.amount6;
    }

    await section("right");

    return { brief: { citations }, refusals, spent6, runaway6, paid, chainWrites, msPerPurchase };
  },
};

export const scriptedAgent: Agent = {
  id: "scripted",
  async run(sellers, buyer) {
    const citations: Citation[] = [];
    const refusals: { sourceId: string; reason: string }[] = [];
    const msPerPurchase: number[] = [];
    let spent6 = 0n;
    let paid = 0;
    let chainWrites = 0;

    for (const source of SOURCES) {
      const seller = sellers.byId(source.id);
      const purchase = await buyer.buy(source.section as WorkerId, seller.url);
      msPerPurchase.push(purchase.ms);
      chainWrites += purchase.chainWrites;

      if (!purchase.ok) {
        /* A worker that is refused does not retry and does not go around.
           Retrying would measure the retry loop; going around is the thing
           the design makes impossible. It leaves the section short, which is
           exactly what should show up in the acceptance check. */
        refusals.push({ sourceId: source.id, reason: purchase.refusedBy ?? "unknown" });
        continue;
      }

      spent6 += purchase.amount6;
      paid += 1;
      citations.push({
        sourceId: source.id,
        body: purchase.body ?? "",
        paidTo: purchase.paidTo ?? null,
        amount6: purchase.amount6,
      });
    }

    return { brief: { citations }, refusals, spent6, runaway6: 0n, paid, chainWrites, msPerPurchase };
  },
};
