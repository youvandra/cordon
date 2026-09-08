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

  /* An empty ledger has never read anything, so it starts at `fromBlock`; one
     that has starts at the block after its last. `toBlock` on an empty ledger
     is `fromBlock`, which is a block that has not been read yet. */
  const isEmpty = base.refusals.length === 0 && Object.keys(base.nodes).length === 0;
  const start = isEmpty ? options.fromBlock : base.toBlock + 1n;
  if (start > toBlock) return base;

  const events = await readEvents(client, options.contracts, {
    fromBlock: start,
    toBlock,
    chunk: options.chunk,
  });

  const next = reduce(base, events);
  /* The range read is what the ledger covers, whether or not anything was
     emitted in it. Leaving `toBlock` at the last event would re-read quiet
     ranges forever. */
  next.toBlock = toBlock;
  return next;
}
