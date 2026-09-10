/**
 * Bring a ledger up to the head of the chain.
 *
 * One function, used by the CLI, the read API and the tests, so there is one
 * definition of "up to date". It reads forward only, from the block after the
 * one the ledger already covers, which is what makes a snapshot resumable and
 * what keeps a second run from double-counting a draw.
 */
import type { PublicClient } from "viem";
import { emptyLedger, reduce, type Ledger } from "./ledger.ts";
import { readEvents, type Contracts } from "./read.ts";

export interface SyncOptions {
  contracts: Contracts;
  /** Where the tree begins. Deploy block, not zero, on a chain with history. */
  fromBlock: bigint;
  chunk?: bigint;
  /**
   * How many blocks behind the head to stop. Arc's finality is deterministic
   * on inclusion, so the default is 0 — but a chain that reorganises needs a
   * number here, and a meter that pretends otherwise writes a ledger it will
   * later have to retract.
   */
  confirmations?: bigint;
  /**
   * The most blocks one call will advance by.
   *
   * A backfill of a hundred thousand blocks is many requests to a public RPC,
   * and the caller only writes its snapshot when the call returns — so an
   * uncapped catch-up is a run that rate limits, throws away everything it
   * read, and starts again from the same place on the next tick. Capping it
   * makes the catch-up land in the snapshot in pieces, each one resumable.
   */
  maxBlocks?: bigint;
  /** Passed through to the reader: a pause between one chunk and the next. */
  paceMs?: number;
}

export async function sync(
  client: PublicClient,
  options: SyncOptions,
  ledger?: Ledger,
): Promise<Ledger> {
  const chainId = await client.getChainId();
  const head = await client.getBlockNumber();
  const confirmations = options.confirmations ?? 0n;
  const toBlock = head > confirmations ? head - confirmations : 0n;

  const base = ledger ?? emptyLedger(chainId, options.fromBlock);
  if (base.chainId !== chainId) {
    throw new Error(
      `this ledger was built on chain ${base.chainId} and the RPC is chain ${chainId}`,
    );
  }

  /* A ledger covers `fromBlock` through `toBlock` and the next read starts at
     the block after it — for an unread ledger that is `fromBlock` itself,
     which is what `emptyLedger` writes. Inferring "unread" from having no
     rows, as this once did, is wrong on the case that matters: a tree whose
     chain has been quiet re-read every block it had already seen, forever. */
  const start = base.toBlock + 1n;
  if (start > toBlock) return base;

  /* Never advance further than one call is allowed to. What is not read now is
     read by the next tick, from the block this one stopped at. */
  const maxBlocks = options.maxBlocks ?? 20_000n;
  const limit = start + maxBlocks - 1n;
  const end = limit < toBlock ? limit : toBlock;

  const events = await readEvents(client, options.contracts, {
    fromBlock: start,
    toBlock: end,
    chunk: options.chunk,
    paceMs: options.paceMs,
  });

  const next = reduce(base, events);
  /* The range read is what the ledger covers, whether or not anything was
     emitted in it. Leaving `toBlock` at the last event would re-read quiet
     ranges forever. */
  next.toBlock = end;
  return next;
}
