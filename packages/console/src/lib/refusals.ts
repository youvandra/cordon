/**
 * This wallet's refusals, read from the chain.
 *
 * `Refused` carries the node as an indexed topic, so the log query can name
 * exactly the nodes this owner opened and get back their refusals and nothing
 * else — one call, no indexer, no server, and no reading of anybody else's
 * tree. The node ids come from the same derivation the rest of the console
 * uses, so the filter cannot include a node the owner does not own.
 *
 * From `fromBlock`, never zero: Arc's RPC answers `pruned history unavailable`
 * for a range that starts before the contracts existed, and it errors rather
 * than returning less.
 */
import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbiItem, type Address, type Hex } from "viem";
import { ARC, DEPLOYMENT, REASONS, UNRECOGNISED } from "@cordon/fixtures";
import { arc, why } from "./mandate";

/** What one screen asks for. The meter's own cap is the authority above it. */
const PAGE = 200;

/**
 * What Arc's public RPC will answer in one `eth_getLogs`.
 *
 * Measured, not read off a document: one node behind that name refuses 50,000
 * blocks as "requested range too large" and answers 20,000, while another
 * names 100,000 in its own error. So this is the smaller of what was seen to
 * work, because the fallback has to survive whichever node answers.
 */
const WINDOW = 20_000n;

/** How many windows one screen will walk before it stops asking.
 *
 *  A bound, not a preference: the same RPC rate-limits an address that asks
 *  too often, and a fallback that walks a chain of any length is one that gets
 *  the reader's own address blocked. Six covers the whole deployment today and
 *  stops well short of that. Newest first, so the cap costs the oldest
 *  refusals rather than the ones somebody opened this screen to see. */
const MAX_WINDOWS = 8;

/** Between windows. Two chains of these fired at once is what a rate limiter
 *  is for, and it answered every one of them with a 429. */
const BETWEEN_MS = 180;

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Every log in a range, asked for in windows the RPC will actually answer, one
 * at a time.
 *
 * Backwards from the head: this screen is a list of the most recent decisions,
 * and the first window read is the one holding them.
 */
async function logsInWindows<T>(
  read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  fromBlock: bigint,
  head: bigint,
): Promise<{ logs: T[]; reached: bigint }> {
  const out: T[] = [];
  let reached = head;
  let to = head;
  for (let asked = 0; asked < MAX_WINDOWS && to >= fromBlock; asked += 1) {
    /* `- 1n` because both ends are inclusive: a window of exactly WINDOW
       blocks spans `to - WINDOW + 1` to `to`, and one block more is the range
       the RPC refuses. */
    const from = to - WINDOW + 1n > fromBlock ? to - WINDOW + 1n : fromBlock;
    if (asked > 0) await pause(BETWEEN_MS);
    out.push(...(await read(from, to)));
    reached = from;
    if (from === fromBlock) break;
    to = from - 1n;
  }
  return { logs: out, reached };
}

const REFUSED = parseAbiItem(
  "event Refused(uint256 indexed refusalId, bytes32 indexed node, bytes32 indexed breachedAt, address counterparty, uint128 amount6, uint8 reason)",
);
const RELEASED = parseAbiItem(
  "event Released(uint256 indexed refusalId, address indexed by, address indexed counterparty, uint128 amount6)",
);

export interface ChainRefusal {
  id: bigint;
  node: Hex;
  breachedAt: Hex;
  counterparty: Address;
  amount6: bigint;
  /** The contract's own word for the bound that stopped it. */
  reason: string;
  blockNumber: bigint;
  transactionHash: Hex;
  released: boolean;
}

export type ChainRefusals =
  | { state: "unconfigured" }
  | { state: "looking" }
  /** `total` is how many exist; `refusals` is how many this page holds. They
   *  differ when the meter capped the answer, and the screen has to say so. */
  | {
      state: "read";
      refusals: ChainRefusal[];
      total: number;
      /** Set when this came from the chain and stopped short of the whole
       *  deployment: the earliest block the walk actually reached. A screen
       *  holding part of a record has to say which part. */
      from?: bigint;
    }
  /* A read that failed is not an absence of refusals, and the screen must not
     draw one as the other. It used to: the error was swallowed, the state went
     back to `unconfigured`, and the sample refusals appeared in its place. */
  | { state: "failed"; why: string };

/** The meter, when the console is served beside one. Same origin in
 *  production, so `/api` reaches it without a second host or CORS. */
const METER: string | undefined =
  (import.meta.env.VITE_METER_URL as string | undefined) || undefined;

interface MeterRefusal {
  id: string;
  node: Hex;
  breachedAt: Hex;
  counterparty: Address;
  amount6: string;
  reason: string;
  site: { blockNumber: string; transactionHash: Hex };
  released: boolean | null;
}

/**
 * Ask the meter first.
 *
 * `Refused` carries the node as an indexed topic, so reading these from the
 * chain needs no indexer — but it needs one request per 100,000 blocks, and
 * the RPC rate-limits an address that asks too many. The meter has read every
 * block once already; this is the same data, and the chain is still there
 * behind it, in windows, for anyone reading with the meter down.
 */
async function fromMeter(root: Hex | null): Promise<{ rows: ChainRefusal[]; total: number } | null> {
  if (!METER) return null;
  try {
    /* Asked for explicitly. The meter caps what it returns either way, and a
       caller that does not name a limit is a caller that will not notice the
       day the cap starts biting. */
    const query = new URLSearchParams({ limit: String(PAGE) });
    if (root) query.set("root", root);
    const response = await fetch(`${METER}/refusals?${query}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { refusals?: MeterRefusal[]; total?: number };
    if (!body.refusals) return null;
    const rows = body.refusals.map((row) => ({
      id: BigInt(row.id),
      node: row.node,
      breachedAt: row.breachedAt,
      counterparty: row.counterparty,
      amount6: BigInt(row.amount6),
      reason: row.reason,
      blockNumber: BigInt(row.site.blockNumber),
      transactionHash: row.site.transactionHash,
      released: row.released === true,
    }));
    return { rows, total: body.total ?? rows.length };
  } catch {
    return null;
  }
}

export function useChainRefusals(nodes: Hex[], root?: Hex | null): ChainRefusals {
  const [found, setFound] = useState<ChainRefusals>({ state: "unconfigured" });
  const key = nodes.join(",");

  useEffect(() => {
    if (!DEPLOYMENT || nodes.length === 0) {
      setFound({ state: "unconfigured" });
      return;
    }
    let live = true;
    setFound({ state: "looking" });

    const client = createPublicClient({ chain: arc, transport: http(ARC.rpc) });
    const vault = DEPLOYMENT.vault as `0x${string}`;
    const fromBlock = BigInt(DEPLOYMENT.fromBlock);

    (async () => {
      const indexed = await fromMeter(root ?? null);
      if (indexed) {
        /* The meter answers for a whole root; a caller holding a subset of
           nodes still only shows its own. */
        const wanted = new Set(nodes.map((node) => node.toLowerCase()));
        const mine = indexed.rows.filter((row) => wanted.has(row.node.toLowerCase()));
        /* `total` counts the whole root. Once the meter has capped its answer
           this screen is holding part of a record, and the count it prints has
           to be the count it drew. */
        if (live) setFound({ state: "read", refusals: mine, total: Math.max(indexed.total, mine.length) });
        return;
      }

      try {
        const head = await client.getBlockNumber();
        /* One after the other. In parallel these are twelve requests leaving
           at once, and the public RPC answers a burst that size with 429s. */
        const refusedRead = await logsInWindows(
          (from, to) =>
            client.getLogs({ address: vault, event: REFUSED, args: { node: nodes }, fromBlock: from, toBlock: to }),
          fromBlock,
          head,
        );
        await pause(BETWEEN_MS);
        const releasedRead = await logsInWindows(
          (from, to) => client.getLogs({ address: vault, event: RELEASED, fromBlock: from, toBlock: to }),
          fromBlock,
          head,
        );
        const refused = refusedRead.logs;
        const released = releasedRead.logs;

        /* A release is a separate transaction against a refusal id, so the two
           are joined here rather than read off the refusal — which is also why
           a released refusal still shows: it happened, and the record keeps
           both side by side. */
        const releasedIds = new Set(released.map((log) => String(log.args.refusalId)));

        const rows: ChainRefusal[] = refused.map((log) => {
          const index = Number(log.args.reason ?? 0);
          return {
            id: log.args.refusalId!,
            node: log.args.node!,
            breachedAt: log.args.breachedAt!,
            counterparty: log.args.counterparty!,
            amount6: log.args.amount6!,
            reason: REASONS[index] ?? UNRECOGNISED,
            blockNumber: log.blockNumber!,
            transactionHash: log.transactionHash!,
            released: releasedIds.has(String(log.args.refusalId)),
          };
        });

        rows.sort((a, b) => Number(b.id - a.id));
        /* How far back this actually got. Eight windows is a bound on how hard
           one screen may lean on a public RPC, so a long-lived tree is read in
           part — and a screen that drew part of a record and printed it as the
           whole one is the defect this project keeps finding in other
           people's dashboards. */
        const whole = refusedRead.reached <= fromBlock;
        if (live) {
          setFound({
            state: "read",
            refusals: rows,
            total: rows.length,
            from: whole ? undefined : refusedRead.reached,
          });
        }
      } catch (error) {
        /* The whole thing, where somebody debugging can read it — the screen
           gets one line. */
        console.error("cordon: reading refusals from the chain failed", error);
        /* A read that fails is not an absence of refusals, and rendering it as
           one would be the console inventing a clean record. Arc's public RPC
           refuses a range this wide, which is how this failure reached a user
           as a screen full of samples. */
        if (live) setFound({ state: "failed", why: why(error) });
      }
    })();

    return () => {
      live = false;
    };
  }, [key]);

  return found;
}
