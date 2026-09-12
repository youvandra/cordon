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
const reader = () => (client ??= createPublicClient({ chain: arc, transport: http(ARC.rpc) }));

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
