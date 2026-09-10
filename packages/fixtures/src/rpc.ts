/**
 * Waiting out a public RPC.
 *
 * A rate limit is a "come back later", not a fact about the chain, and every
 * process here reads Arc through the same public endpoint — so one of them
 * backfilling makes the others fail. Both failures were live: the meter exited
 * on the first limit of its first sync, and attest exited on the domain check
 * it runs before it will accept a payment.
 *
 * This lives in fixtures because it is the second copy that would have been
 * wrong. Retrying is only ever correct for this one class of error; everything
 * else still throws on the first attempt, because a process that retries a
 * decode bug or a pruned block hides it.
 */

/** `-32005` is the JSON-RPC code Arc's public endpoint answers with. */
export function isRateLimit(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  const causeCode = (error as { cause?: { code?: unknown } })?.cause?.code;
  if (code === -32005 || causeCode === -32005 || code === 429) return true;
  /* viem wraps the RPC error, and the wrapper's own code is not the RPC's, so
     the message is the only thing left that carries it. */
  return /rate limit|too many requests/i.test(String((error as Error)?.message ?? ""));
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export interface RetryOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  /** The first wait. Each one after it doubles, up to `maxMs`. */
  baseMs?: number;
  /** The longest single wait. Doubling without a ceiling overshoots the
   *  window the limit is measured over and then keeps growing past it. */
  maxMs?: number;
}

export async function retryOnRateLimit<T>(
  call: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 8;
  const baseMs = options.baseMs ?? 1_000;
  const maxMs = options.maxMs ?? 15_000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= attempts || !isRateLimit(error)) throw error;
      /* 1s, 2s, 4s, 8s, then 15s a time. A limit is measured over a window, so
         the wait has to grow past the window rather than hammer the edge of
         it — and a public endpoint under a backfill needs about a minute of
         patience in total, not a second. */
      const delay = Math.min(baseMs * 2 ** (attempt - 1), maxMs);
      await wait(delay);
    }
  }
}
