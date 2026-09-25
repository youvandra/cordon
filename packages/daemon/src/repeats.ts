/**
 * The fiftieth identical refusal is not a record, it is a bill.
 *
 * A refusal is the product here: a draw nobody can hold the tree to afterwards
 * is not a control, so the transaction is sent and published even though the
 * simulation already knows it will be refused. That is right for the first
 * one.
 *
 * It is not right for the next forty-nine. An agent stuck in a loop — the
 * exact scenario this project's own G7 eval is built around — produces one
 * on-chain transaction per refusal, plus one more to attest it. Cordon's
 * bounds are denominated in USDC; gas is outside the mandate entirely and
 * nothing bounded it. `TreeVault._refusals` grows without limit, and the
 * conduct record, which is the thing a stranger is supposed to read, fills
 * with the same sentence repeated.
 *
 * So: a refusal that says something new is sent. A refusal identical to one
 * already on chain and still standing is answered from the one already on
 * chain. "Identical" is the whole of what a reader could learn — the node, the
 * payee, the amount and the reason. Any of them different is a different fact
 * and goes to the chain.
 *
 * What makes this safe to do is that it can only ever suppress a *duplicate*.
 * It never turns a refusal into a release, never lets a purchase through, and
 * the caller still gets a refusal carrying the real id and the real
 * transaction — the one that is genuinely on chain.
 */
import type { Address, Hex } from "viem";

/**
 * What was published for a bound, and can be handed back instead of resent.
 *
 * The whole refusal, not a summary of it: a caller handed this back must not
 * be able to tell it apart from one that went to the chain just now, except
 * by the transaction being older. `breachedAt` in particular is the part a
 * reader cares about — which ancestor actually stopped it.
 */
export interface Published {
  refusalId: bigint;
  txHash: Hex;
  reason: string;
  breachedAt?: Hex;
}

/** Everything about a refusal a reader of the record could learn from it. */
export interface Bound {
  node: Hex;
  counterparty: Address;
  amount: bigint;
  reason: string;
}

const keyOf = (b: Bound) =>
  `${b.node.toLowerCase()}|${b.counterparty.toLowerCase()}|${b.amount}|${b.reason}`;

export class RefusalRepeats {
  private readonly seen = new Map<string, { published: Published; until: number }>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  /**
   * The refusal already on chain for exactly this bound, while it still
   * stands. A window that has rolled is a different window, and a refusal in
   * it is a new fact about a fresh budget — so the memory expires with it.
   */
  recall(bound: Bound): Published | undefined {
    const hit = this.seen.get(keyOf(bound));
    if (!hit) return undefined;
    if (hit.until <= this.now()) {
      this.seen.delete(keyOf(bound));
      return undefined;
    }
    return hit.published;
  }

  /** Remember what was published, for as long as it stays the current answer. */
  remember(bound: Bound, published: Published, holdsForMs: number): void {
    /* A non-positive hold means "do not suppress anything" — the honest
       reading of a window this code could not determine. */
    if (holdsForMs <= 0) return;
    this.seen.set(keyOf(bound), { published, until: this.now() + holdsForMs });
  }

  /**
   * Drop what has expired. Nothing depends on this being called — `recall`
   * checks expiry itself — but a daemon runs for weeks and a tree that has
   * refused many distinct bounds should not keep all of them.
   */
  prune(): void {
    const now = this.now();
    for (const [key, hit] of this.seen) if (hit.until <= now) this.seen.delete(key);
  }

  /** How many bounds are being remembered. For tests and for `/status`. */
  get size(): number {
    return this.seen.size;
  }
}
