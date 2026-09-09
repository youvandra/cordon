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
import { ARC, DEPLOYMENT } from "@cordon/fixtures";
import { REASONS, UNRECOGNISED } from "../../../daemon/src/gate.ts";
import { arc } from "./mandate";

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
  | { state: "read"; refusals: ChainRefusal[] };

export function useChainRefusals(nodes: Hex[]): ChainRefusals {
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
        if (live) setFound({ state: "read", refusals: rows });
      } catch {
        /* A read that fails is not an absence of refusals, and rendering it as
           one would be the console inventing a clean record. */
        if (live) setFound({ state: "unconfigured" });
      }
    })();

    return () => {
      live = false;
    };
  }, [key]);

  return found;
}
