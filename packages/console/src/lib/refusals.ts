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
import { arc } from "./mandate";

/** What one screen asks for. The meter's own cap is the authority above it. */
const PAGE = 200;

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
  | { state: "read"; refusals: ChainRefusal[]; total: number }
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
 * chain is one `getLogs` — over the whole deployment range, which Arc's public
 * RPC refuses outright and then rate-limits the address for asking. The meter
 * has already read every block once; this is the same data, and the chain is
 * still there behind it for anyone who wants to check a transaction.
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
        const [refused, released] = await Promise.all([
          client.getLogs({ address: vault, event: REFUSED, args: { node: nodes }, fromBlock }),
          client.getLogs({ address: vault, event: RELEASED, fromBlock }),
        ]);

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
        if (live) setFound({ state: "read", refusals: rows, total: rows.length });
      } catch (error) {
        /* A read that fails is not an absence of refusals, and rendering it as
           one would be the console inventing a clean record. Arc's public RPC
           refuses a range this wide, which is how this failure reached a user
           as a screen full of samples. */
        if (live) setFound({ state: "failed", why: (error as Error).message });
      }
    })();

    return () => {
      live = false;
    };
  }, [key]);

  return found;
}
