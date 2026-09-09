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
  chainWrites: number;
  msPerPurchase: number[];
}

export interface Agent {
  id: string;
  run(sellers: Sellers, buyer: Buyer): Promise<AgentResult>;
}

export const scriptedAgent: Agent = {
  id: "scripted",
  async run(sellers, buyer) {
    const citations: Citation[] = [];
    const refusals: { sourceId: string; reason: string }[] = [];
    const msPerPurchase: number[] = [];
    let spent6 = 0n;
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
      citations.push({
        sourceId: source.id,
        body: purchase.body ?? "",
        paidTo: purchase.paidTo ?? null,
        amount6: purchase.amount6,
      });
    }

    return { brief: { citations }, refusals, spent6, chainWrites, msPerPurchase };
  },
};
