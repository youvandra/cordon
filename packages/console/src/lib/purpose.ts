import { useEffect, useState } from "react";
import { createPublicClient, hexToString, http, type Hex } from "viem";
import { ARC, DEPLOYMENT, ERC8004 } from "@cordon/fixtures";
import { ConductRecordAbi } from "../../../daemon/src/abi.gen.ts";
import { arc } from "./mandate";

const IDENTITY_METADATA_ABI = [
  {
    type: "function",
    name: "getMetadata",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "metadataKey", type: "string" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/**
 * What a node was spawned for, as its spawner stated it on the node's identity.
 *
 * Nothing enforces this. It is shown because an owner looking at a tree of
 * hexadecimal ids needs to know which one is which, and it is shown as a
 * statement: the registry holds whatever the operator wrote, and the contract
 * that bounds the node has never read it.
 */
export type Purpose =
  | { state: "looking" }
  | { state: "none" }
  | { state: "read"; text: string; agentId: bigint }
  | { state: "failed" };

let client: ReturnType<typeof createPublicClient> | null = null;
/* `batch` for the same reason the tree read uses it: a list of a dozen agents
   asks for two reads each, and a public endpoint that rate limits answers one
   Multicall3 request far more happily than twenty-four. */
const reader = () =>
  (client ??= createPublicClient({
    chain: arc,
    transport: http(ARC.rpc, { batch: true }),
    batch: { multicall: true },
  }));

export function usePurpose(node: Hex): Purpose {
  const [purpose, setPurpose] = useState<Purpose>({ state: "looking" });

  useEffect(() => {
    const record = DEPLOYMENT?.record as `0x${string}` | undefined;
    if (!record) {
      setPurpose({ state: "none" });
      return;
    }
    let live = true;
    setPurpose({ state: "looking" });

    (async () => {
      try {
        const agentId = (await reader().readContract({
          address: record,
          abi: ConductRecordAbi,
          functionName: "agentIdOf",
          args: [node],
        })) as bigint;
        if (agentId === 0n) {
          if (live) setPurpose({ state: "none" });
          return;
        }
        const raw = await reader().readContract({
          address: ERC8004.identity,
          abi: IDENTITY_METADATA_ABI,
          functionName: "getMetadata",
          args: [agentId, ERC8004.purposeKey],
        });
        const text = raw === "0x" ? "" : hexToString(raw).trim();
        if (live) setPurpose(text ? { state: "read", text, agentId } : { state: "none" });
      } catch {
        if (live) setPurpose({ state: "failed" });
      }
    })();

    return () => {
      live = false;
    };
  }, [node]);

  return purpose;
}

/**
 * What a list of nodes was spawned for, read in one pass.
 *
 * A table cannot call `usePurpose` per row — the row count is data — and a
 * hook per row would also read the registry a row at a time. This gathers both
 * levels with `Promise.all` so the batching client packs each level into one
 * request.
 *
 * It reports whether the read failed rather than only what it found. A caller
 * that shows the id when `of` answers nothing is right either way, but a
 * caller that *searches* what this returns is not: a search over a map that
 * silently stayed empty answers "no agents match", which says the tree has no
 * sentiment reader when what happened is that the registry could not be read.
 */
export interface Purposes {
  /** What this node says it is for, or nothing. Case-insensitive. */
  of(node: Hex | string): string | undefined;
  /** True until the first answer, so "not yet" is not read as "none". */
  reading: boolean;
  /** True when the registry could not be read at all. */
  failed: boolean;
}

type Read =
  | { state: "idle" }
  | { state: "reading" }
  | { state: "read"; found: Map<string, string> }
  | { state: "failed" };

export function usePurposes(nodes: Hex[]): Purposes {
  const [read, setRead] = useState<Read>({ state: "idle" });
  /* The identity of the list, not the array, so a re-render with an equal list
     does not re-read the chain. */
  const key = nodes.join(",");

  useEffect(() => {
    const record = DEPLOYMENT?.record as `0x${string}` | undefined;
    if (!record || nodes.length === 0) {
      /* Not a failure and not an answer: there is nothing to describe. Left
         `idle` so a list that briefly empties does not flash "could not be
         read". */
      setRead({ state: "idle" });
      return;
    }
    let live = true;
    setRead({ state: "reading" });

    (async () => {
      try {
        const ids = (await Promise.all(
          nodes.map((node) =>
            reader().readContract({
              address: record,
              abi: ConductRecordAbi,
              functionName: "agentIdOf",
              args: [node],
            }),
          ),
        )) as bigint[];

        const enrolled = nodes.filter((_, i) => ids[i] !== 0n);
        const enrolledIds = ids.filter((id) => id !== 0n);
        const raws = (await Promise.all(
          enrolledIds.map((agentId) =>
            reader().readContract({
              address: ERC8004.identity,
              abi: IDENTITY_METADATA_ABI,
              functionName: "getMetadata",
              args: [agentId, ERC8004.purposeKey],
            }),
          ),
        )) as `0x${string}`[];

        const found = new Map<string, string>();
        enrolled.forEach((node, i) => {
          const raw = raws[i]!;
          const text = raw === "0x" ? "" : hexToString(raw).trim();
          if (text) found.set(node.toLowerCase(), text);
        });
        if (live) setRead({ state: "read", found });
      } catch {
        /* A list that cannot be described still lists — the ids are already on
           screen and every figure beside them came from a different read. What
           changes is that the caller can now say so. */
        if (live) setRead({ state: "failed" });
      }
    })();

    return () => {
      live = false;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [key]);

  const found = read.state === "read" ? read.found : null;
  return {
    of: (node) => found?.get(String(node).toLowerCase()),
    reading: read.state === "reading",
    failed: read.state === "failed",
  };
}
