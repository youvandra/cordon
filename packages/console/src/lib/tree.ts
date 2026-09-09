/**
 * The whole tree, read from the chain, with no indexer in the path.
 *
 * `MandateRegistry` derives ids rather than storing a list of them:
 *
 *     root  = keccak256(chainid, registry, owner, rootNonce)
 *     child = keccak256(parent, childNonce)
 *
 * and both nonces are sequential. So every mandate an address has ever opened,
 * and every child under it, is a pure function of that address — the console
 * asks nobody how many agents there are, and nobody has to type it in. The
 * first id that reverts is the end of a sequence, and `maxDepth` ends the
 * descent.
 *
 * The structure comes from the registry; what each node has actually spent
 * comes from the vault's own views. Neither is a reduction of events, so
 * neither can disagree with the contract that produced it.
 */
import { useEffect, useState } from "react";
import { createPublicClient, http, type Hex } from "viem";
import { ARC } from "@cordon/fixtures";
import { MandateRegistryAbi, TreeVaultAbi } from "../../../daemon/src/abi.gen.ts";
import { DEPLOYED, arc, rootNodeId, childNodeId } from "./mandate";

export interface ChainNode {
  node: Hex;
  parent: Hex | null;
  depth: number;
  operator: `0x${string}`;
  budget6: bigint;
  lifetimeCap6: bigint;
  /** A child's must equal this exactly, so it has to come from the chain. */
  windowSeconds: bigint;
  trancheCap6: bigint;
  concentrationBps: number;
  maxDepth: number;
  revoked: boolean;
  /** From the vault, not from a count of events. */
  windowSpent6: bigint;
  lifetimeSpent6: bigint;
  /** What it may draw right now, and which node is the reason. */
  available6: bigint;
  boundBy: Hex;
}

export type ChainTree =
  | { state: "unconfigured" }
  | { state: "looking" }
  | { state: "none" }
  | { state: "read"; nodes: ChainNode[] };

/** Sequential nonces, so a gap is the end. Generous enough for any real tree. */
const FAN = 16;

export function useChainTree(owner: string | null): ChainTree {
  const [tree, setTree] = useState<ChainTree>({ state: "unconfigured" });

  useEffect(() => {
    if (!owner || !DEPLOYED) {
      setTree({ state: "unconfigured" });
      return;
    }
    let live = true;
    setTree({ state: "looking" });

    const client = createPublicClient({ chain: arc, transport: http(ARC.rpc) });
    const { registry, vault } = DEPLOYED;

    const readNode = async (node: Hex, parent: Hex | null, depth: number): Promise<ChainNode | null> => {
      try {
        const [m, spentWindow, spentLifetime, room] = await Promise.all([
          client.readContract({ address: registry, abi: MandateRegistryAbi, functionName: "mandate", args: [node] }) as Promise<{
            operator: `0x${string}`;
            budget6: bigint;
            lifetimeCap6: bigint;
            windowSeconds: bigint;
            trancheCap6: bigint;
            concentrationBps: number;
            maxDepth: number;
            revoked: boolean;
          }>,
          client.readContract({ address: vault, abi: TreeVaultAbi, functionName: "windowSpent", args: [node] }) as Promise<bigint>,
          client.readContract({ address: vault, abi: TreeVaultAbi, functionName: "lifetimeSpent", args: [node] }) as Promise<bigint>,
          client.readContract({ address: vault, abi: TreeVaultAbi, functionName: "headroom", args: [node] }) as Promise<[bigint, Hex]>,
        ]);
        return {
          node,
          parent,
          depth,
          operator: m.operator,
          budget6: m.budget6,
          lifetimeCap6: m.lifetimeCap6,
          windowSeconds: m.windowSeconds,
          trancheCap6: m.trancheCap6,
          concentrationBps: m.concentrationBps,
          maxDepth: m.maxDepth,
          revoked: m.revoked,
          windowSpent6: spentWindow,
          lifetimeSpent6: spentLifetime,
          available6: room[0],
          boundBy: room[1],
        };
      } catch {
        /* `mandate` reverts on an id nobody opened. That is the answer, not an
           error: it is how a sequence of nonces ends. */
        return null;
      }
    };

    (async () => {
      const found: ChainNode[] = [];

      const descend = async (parent: ChainNode) => {
        if (parent.depth >= parent.maxDepth) return;
        for (let nonce = 0; nonce < FAN; nonce++) {
          const child = await readNode(childNodeId(parent.node, nonce), parent.node, parent.depth + 1);
          if (!child) break;
          found.push(child);
          await descend(child);
        }
      };

      for (let nonce = 0; nonce < FAN; nonce++) {
        const root = await readNode(rootNodeId(owner as `0x${string}`, nonce, registry), null, 0);
        if (!root) break;
        found.push(root);
        await descend(root);
      }

      if (!live) return;
      setTree(found.length === 0 ? { state: "none" } : { state: "read", nodes: found });
    })();

    return () => {
      live = false;
    };
  }, [owner]);

  return tree;
}
