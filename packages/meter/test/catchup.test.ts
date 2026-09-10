/**
 * Catching up to a chain that does not want to be read all at once.
 *
 * These are the failures a public RPC produces and a private one hides: a
 * limit that says come back later, and a backfill long enough that reading it
 * in one call means never finishing it. Both were live defects — the meter
 * exited on the first rate limit of its first sync, and every restart began
 * again from the deploy block.
 *
 * No anvil here on purpose: the client is a stub, because what is under test
 * is which ranges get asked for and what happens when an answer is a refusal
 * to answer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, PublicClient } from "viem";
import { sync } from "../src/sync.ts";
import { readEvents } from "../src/read.ts";

const CONTRACTS = {
  registry: "0x00000000000000000000000000000000000000a1" as Address,
  vault: "0x00000000000000000000000000000000000000a2" as Address,
};

interface Asked {
  fromBlock: bigint;
  toBlock: bigint;
}

/** A chain with a head and no logs, which records every range asked of it. */
function quietChain(head: bigint): { client: PublicClient; asked: Asked[] } {
  const asked: Asked[] = [];
  const client = {
    getChainId: async () => 5042002,
    getBlockNumber: async () => head,
    getLogs: async (range: Asked) => {
      asked.push({ fromBlock: range.fromBlock, toBlock: range.toBlock });
      return [];
    },
  } as unknown as PublicClient;
  return { client, asked };
}

test("a range already read is not read again when nothing happened in it", async () => {
  const { client, asked } = quietChain(1_500n);

  const first = await sync(client, { contracts: CONTRACTS, fromBlock: 1_000n });
  assert.equal(first.toBlock, 1_500n, "the ledger covers what it read, events or not");
  assert.equal(asked[0]!.fromBlock, 1_000n, "the first read starts at the deploy block");

  const before = asked.length;
  const second = await sync(client, { contracts: CONTRACTS, fromBlock: 1_000n }, first);
  assert.equal(
    asked.length,
    before,
    "a ledger with no rows had read those blocks, and re-reading them is the bug",
  );
  assert.equal(second.toBlock, 1_500n);
});

test("a catch-up advances by no more than one call may, and the next resumes where it stopped", async () => {
  const { client, asked } = quietChain(100_000n);

  const first = await sync(client, {
    contracts: CONTRACTS,
    fromBlock: 1n,
    maxBlocks: 20_000n,
    chunk: 20_000n,
  });
  assert.equal(first.toBlock, 20_000n, "one call covers the cap, not the whole chain");
  assert.equal(asked.at(-1)!.toBlock, 20_000n, "and asks for nothing past it");

  const second = await sync(
    client,
    { contracts: CONTRACTS, fromBlock: 1n, maxBlocks: 20_000n, chunk: 20_000n },
    first,
  );
  assert.equal(second.toBlock, 40_000n);
  assert.equal(asked.at(-1)!.fromBlock, 20_001n, "the second call starts at the block after");
});

test("a rate limit is waited out, because it is not a fact about the chain", async () => {
  let calls = 0;
  const client = {
    getLogs: async () => {
      calls++;
      if (calls === 1) {
        const error = new Error("RPC Request failed.") as Error & { code: number };
        error.code = -32005;
        throw error;
      }
      return [];
    },
  } as unknown as PublicClient;

  const events = await readEvents(client, CONTRACTS, {
    fromBlock: 1n,
    toBlock: 100n,
    chunk: 100n,
    attempts: 3,
  });
  assert.deepEqual(events, []);
  assert.equal(calls, 2, "the second attempt is the one that answers");
});

test("a span the endpoint will not answer is narrowed, not waited out", async () => {
  /* Arc refuses a wide `eth_getLogs` with the code it uses for a rate limit,
     so a reader that waits on it waits forever for an answer the endpoint has
     already decided. The span it accepts is discovered, never assumed. */
  const WIDEST = 250n;
  const spans: bigint[] = [];
  const client = {
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      const span = toBlock - fromBlock + 1n;
      spans.push(span);
      if (span > WIDEST) {
        const error = new Error("Request exceeds defined limit.") as Error & { code: number };
        error.code = -32005;
        throw error;
      }
      return [];
    },
  } as unknown as PublicClient;

  const started = Date.now();
  const events = await readEvents(client, CONTRACTS, {
    fromBlock: 1n,
    toBlock: 1_000n,
    chunk: 1_000n,
    paceMs: 0,
  });

  assert.deepEqual(events, []);
  assert.ok(
    spans.every((span) => span <= 1_000n),
    "no attempt asks for more than it was told to",
  );
  assert.ok(
    spans.at(-1)! <= WIDEST,
    `the read settled on a span the endpoint answers, not ${spans.at(-1)}`,
  );
  assert.ok(Date.now() - started < 2_000, "narrowing is immediate; only a real limit waits");
});

test("an error that is not a rate limit is not retried", async () => {
  let calls = 0;
  const client = {
    getLogs: async () => {
      calls++;
      throw new Error("pruned history unavailable");
    },
  } as unknown as PublicClient;

  await assert.rejects(
    readEvents(client, CONTRACTS, { fromBlock: 1n, toBlock: 100n, chunk: 100n, attempts: 3 }),
    /pruned history/,
  );
  assert.equal(calls, 1, "waiting does not make a pruned block come back");
});
