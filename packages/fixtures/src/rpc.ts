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
  /** The first wait. Each one after it doubles. */
  baseMs?: number;
}

export async function retryOnRateLimit<T>(
  call: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 6;
  const baseMs = options.baseMs ?? 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= attempts || !isRateLimit(error)) throw error;
      /* 500ms, then 1s, 2s, 4s… A limit is measured over a window, so the wait
         has to grow past the window rather than hammer the edge of it. */
      await wait(baseMs * 2 ** (attempt - 1));
    }
  }
}
