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
 * asks nobody how many agents there are, and nobody has to type it in. A gap
 * in a sequence is its end, and `maxDepth` ends the descent.
 *
 * The structure comes from the registry; what each node has actually spent
 * comes from the vault's own views. Neither is a reduction of events, so
 * neither can disagree with the contract that produced it.
 *
 * Two things here are load bearing, and both were learned the hard way.
 *
 * **A read that fails is not an answer.** This asked `mandate(node)` and
 * treated any thrown error as "nobody opened this id", because that is what
 * the registry does on an unknown one — so a 429 from Arc's public RPC read as
 * the end of a sequence, and the descent stopped there. A rate limit could
 * therefore draw a tree with branches missing, under a heading saying every
 * figure came from the contract, and say nothing at all. Existence is asked
 * with `exists(node)`, which answers a boolean and never reverts, so a thrown
 * error is now only ever a read that failed and is reported as one.
 *
 * **One level at a time, in one request.** The descent was recursive and
 * serial: one round trip per node, four calls each, one after another. A
 * thirteen-node tree was a hundred and twenty requests to a public endpoint,
 * a third of which came back 429. Each level is now gathered in parallel and
 * packed into Multicall3, so the whole tree is a handful of calls.
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
  /** The chain was asked and did not answer. Never a smaller tree. */
  | { state: "failed"; why: string }
  | { state: "read"; nodes: ChainNode[] };

/** Sequential nonces, so a gap is the end. Generous enough for any real tree. */
const FAN = 16;

/**
 * What went wrong, in a line.
 *
 * A viem error carries the whole call it failed on — the encoded request body,
 * the ABI, a docs link — which is four hundred characters of machinery in
 * front of the one fact an owner needs. Its `shortMessage` is that fact, and
 * the status is what distinguishes "the endpoint asked for less of this" from
 * "the endpoint is gone".
 */
function why(error: unknown): string {
  const viem = error as { shortMessage?: string; status?: number; details?: string; message?: string };
  const head = viem.shortMessage ?? viem.message ?? String(error);
  const detail = viem.details && viem.details !== head ? ` — ${viem.details}` : "";
  return `${head}${detail}`.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** A descent that cannot end is a browser tab that never stops asking. */
const MAX_LEVELS = 16;

interface Candidate {
  node: Hex;
  parent: Hex | null;
  /** Which nonce under that parent, so a gap can be found per parent. */
  nonce: number;
}

export function useChainTree(owner: string | null): ChainTree {
  const [tree, setTree] = useState<ChainTree>({ state: "unconfigured" });

  useEffect(() => {
    if (!owner || !DEPLOYED) {
      setTree({ state: "unconfigured" });
      return;
    }
    let live = true;
    setTree({ state: "looking" });

    /* `batch` packs every `eth_call` issued in the same tick into one
       Multicall3 `aggregate3`. It is what turns a level of this descent into a
       single request, and it is why the reads below are gathered with
       `Promise.all` rather than awaited one at a time. */
    const client = createPublicClient({
      chain: arc,
      transport: http(ARC.rpc, { batch: true }),
      batch: { multicall: true },
    });
    const { registry, vault } = DEPLOYED;

    /** Never caught. A read that fails has to reach the screen. */
    const existing = (nodes: Hex[]): Promise<boolean[]> =>
      Promise.all(
        nodes.map(
          (node) =>
            client.readContract({
              address: registry,
              abi: MandateRegistryAbi,
              functionName: "exists",
              args: [node],
            }) as Promise<boolean>,
        ),
      );

    const readNode = async (candidate: Candidate, depth: number): Promise<ChainNode> => {
      const { node, parent } = candidate;
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
    };

    (async () => {
      const found: ChainNode[] = [];

      let level: Candidate[] = Array.from({ length: FAN }, (_, nonce) => ({
        node: rootNodeId(owner as `0x${string}`, nonce, registry),
        parent: null,
        nonce,
      }));

      for (let depth = 0; depth < MAX_LEVELS && level.length > 0; depth++) {
        const answers = await existing(level.map((candidate) => candidate.node));

        /* Sequential nonces, so what exists under one parent is a prefix and
           the first gap ends it. Grouped by parent, because a level holds the
           candidates of every parent above it at once. */
        const open: Candidate[] = [];
        const ended = new Set<string>();
        for (let i = 0; i < level.length; i++) {
          const candidate = level[i]!;
          const key = candidate.parent ?? "root";
          if (ended.has(key)) continue;
          if (!answers[i]) {
            ended.add(key);
            continue;
          }
          open.push(candidate);
        }
        if (open.length === 0) break;

        const nodes = await Promise.all(open.map((candidate) => readNode(candidate, depth)));
        if (!live) return;
        found.push(...nodes);

        level = nodes
          .filter((node) => node.depth < node.maxDepth)
          .flatMap((node) =>
            Array.from({ length: FAN }, (_, nonce) => ({
              node: childNodeId(node.node, nonce),
              parent: node.node,
              nonce,
            })),
          );
      }

      if (!live) return;
      setTree(found.length === 0 ? { state: "none" } : { state: "read", nodes: found });
    })().catch((error: unknown) => {
      /* The chain was asked and did not answer. This used to be swallowed one
         node at a time, which drew a smaller tree rather than an error — and
         a tree missing a branch is the one thing this screen must never show,
         because every figure on it is captioned as read from the contract. */
      if (!live) return;
      setTree({ state: "failed", why: why(error) });
    });

    return () => {
      live = false;
    };
  }, [owner]);

  return tree;
}
