/**
 * One transaction at a time, per key.
 *
 * Every process here signs with an EOA, and an EOA's transactions are ordered
 * by a nonce the node hands out. viem asks for it with
 * `eth_getTransactionCount` at `pending` and sends immediately, so two sends
 * that overlap in that gap ask for the same nonce and both get it. What comes
 * back is one accepted transaction and one `nonce too low` — or, on a node that
 * takes replacements, one transaction quietly replacing the other.
 *
 * Both places this matters have money on the other side of them. The daemon
 * draws for however many agents are buying at once; the attest endpoint
 * submits a settlement per paying request from a single submitter key, and
 * nginx will hand it several at a time. Neither had anything between the
 * request and the signer.
 *
 * The queue is per key, because two keys have two nonce sequences and
 * serialising them together would make a concurrent daemon sequential for no
 * reason. It is not a lock across processes: two processes holding one key
 * still collide, and the answer to that is the arrangement used everywhere
 * else here — a key is held by one process.
 */
export interface Queue {
  /** Run `work` once everything already queued for `key` has finished. */
  <T>(key: string, work: () => Promise<T>): Promise<T>;
}

export function serialiseByKey(): Queue {
  /* The tail of each key's chain, and it never rejects — a failed send must
     not cancel the work queued behind it. The caller still sees its own
     rejection, because that is the promise it is handed. Kept rather than
     evicted: a settled promise per key is a few bytes, and the keys are node
     ids and addresses, which a tree has a bounded number of. */
  const tails = new Map<string, Promise<unknown>>();

  return <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const id = key.toLowerCase();
    const previous = tails.get(id) ?? Promise.resolve();
    const next = previous.then(work, work);
    tails.set(
      id,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  };
}
