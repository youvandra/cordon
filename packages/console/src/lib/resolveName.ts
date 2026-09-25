/**
 * Looking an agent up by name, the way a stranger would.
 *
 * Every other screen here belongs to an owner who already knows their tree.
 * This one belongs to whoever is about to be asked for something by an agent
 * and holds only its name, or only the address in a payment authorisation.
 *
 * Two reads, and the order matters. ENS says which contract to ask and which
 * node to ask about; the contract answers what the agent may still spend and
 * whether its branch is alive. Nothing on screen that a contract enforces is
 * read from a text record, because a record is a copy and a copy drifts — the
 * mandate can narrow a minute after the record was written.
 *
 * It reads Sepolia regardless of the chain the rest of the console is pointed
 * at, because that is the only chain ENSv2 is deployed on.
 */
import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbi, isAddress, type Address, type Hex } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import { SEPOLIA, ERC8004, DEPLOYMENTS, registrationKey } from "@cordon/fixtures";

const REGISTRY_ABI = parseAbi([
  "function isLive(bytes32) view returns (bool)",
  "function revokedAt(bytes32) view returns (bytes32)",
  "function mandate(bytes32) view returns ((bytes32 parent,bytes32 root,address owner,address operator,uint128 budget6,uint128 lifetimeCap6,uint64 windowSeconds,uint128 trancheCap6,uint16 concentrationBps,uint8 depth,uint8 maxDepth,bool revoked,bool exists,uint64 createdAt))",
]);
const VAULT_ABI = parseAbi([
  "function headroom(bytes32) view returns (uint128,bytes32)",
  "function treasury6(bytes32) view returns (uint128)",
]);
const RECORD_ABI = parseAbi(["function agentIdOf(bytes32) view returns (uint256)"]);

const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA.rpc) });

/** The Sepolia deployment, or nothing. `pending` is a value here too. */
const HERE = DEPLOYMENTS[SEPOLIA.chainId] ?? null;

export interface Rung {
  node: Hex;
  operator: Address;
  budget6: bigint;
  depth: number;
  /** True for the node the name pointed at. */
  self: boolean;
}

export interface Resolved {
  name: string;
  address: Address;
  node: Hex;
  registry: Address;
  owner: Address;
  operator: Address;
  budget6: bigint;
  live: boolean;
  /** Which node's revocation cut it, when it is cut. */
  cutAt: Hex | null;
  headroom6: bigint | null;
  /** The node whose bound is the binding one — often an ancestor. */
  boundBy: Hex | null;
  treasury6: bigint | null;
  /** Leaf first, root last. */
  chain: Rung[];
  /** Stated by the owner and enforced by nothing. */
  endpoint: string | null;
  context: string | null;
  /** The identity the chain holds, and whether the name attests to it. */
  agentId: bigint | null;
  attested: boolean;
}

export type Lookup =
  | { state: "idle" }
  | { state: "looking" }
  | { state: "unnamed"; subject: string }
  | { state: "unbound"; name: string; address: Address }
  | { state: "found"; agent: Resolved }
  | { state: "failed"; why: string };

export function useResolvedAgent(subject: string): Lookup {
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });

  useEffect(() => {
    const asked = subject.trim();
    if (!asked) {
      setLookup({ state: "idle" });
      return;
    }
    let live = true;
    setLookup({ state: "looking" });

    (async () => {
      try {
        /* A seller starts from the address, because that is what a payment
           authorisation carries. A person starts from the name. */
        let name: string;
        if (isAddress(asked)) {
          const found = await client.getEnsName({ address: asked });
          if (!found) {
            if (live) setLookup({ state: "unnamed", subject: asked });
            return;
          }
          name = found;
        } else {
          name = normalize(asked);
        }

        const address = await client.getEnsAddress({ name: normalize(name) });
        if (!address) {
          if (live) setLookup({ state: "unnamed", subject: asked });
          return;
        }
        /* The half that makes reverse resolution mean anything: without it,
           any address can be pointed at by a name its holder never owned. */
        if (isAddress(asked) && address.toLowerCase() !== asked.toLowerCase()) {
          if (live) setLookup({ state: "unnamed", subject: asked });
          return;
        }

        const [node, registryText, endpoint, context] = await Promise.all([
          client.getEnsText({ name: normalize(name), key: "cordon.node" }),
          client.getEnsText({ name: normalize(name), key: "cordon.registry" }),
          client.getEnsText({ name: normalize(name), key: "agent-endpoint[mcp]" }),
          client.getEnsText({ name: normalize(name), key: "agent-context" }),
        ]);
        if (!node || !registryText) {
          if (live) setLookup({ state: "unbound", name, address });
          return;
        }

        const registry = registryText as Address;
        const [mandate, isLive] = await Promise.all([
          client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "mandate", args: [node as Hex] }),
          client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "isLive", args: [node as Hex] }),
        ]);

        /* Up the tree, one parent at a time, because the bound that stops an
           agent is often not its own. */
        const chain: Rung[] = [];
        let cursor = node as Hex;
        for (let i = 0; i <= mandate.maxDepth + 1; i++) {
          const m = i === 0
            ? mandate
            : await client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "mandate", args: [cursor] });
          if (!m.exists) break;
          chain.push({ node: cursor, operator: m.operator, budget6: m.budget6, depth: m.depth, self: i === 0 });
          if (m.parent === "0x0000000000000000000000000000000000000000000000000000000000000000") break;
          cursor = m.parent;
        }

        const cutAt = isLive
          ? null
          : ((await client.readContract({
              address: registry, abi: REGISTRY_ABI, functionName: "revokedAt", args: [node as Hex],
            })) as Hex);

        let headroom6: bigint | null = null;
        let boundBy: Hex | null = null;
        let treasury6: bigint | null = null;
        if (HERE) {
          const [available, by] = (await client.readContract({
            address: HERE.vault as Address, abi: VAULT_ABI, functionName: "headroom", args: [node as Hex],
          })) as [bigint, Hex];
          headroom6 = available;
          boundBy = by;
          treasury6 = (await client.readContract({
            address: HERE.vault as Address, abi: VAULT_ABI, functionName: "treasury6", args: [mandate.root],
          })) as bigint;
        }

        let agentId: bigint | null = null;
        let attested = false;
        if (HERE) {
          agentId = (await client.readContract({
            address: HERE.record as Address, abi: RECORD_ABI, functionName: "agentIdOf", args: [node as Hex],
          })) as bigint;
          if (agentId > 0n) {
            const key = registrationKey(SEPOLIA.chainId, ERC8004.identity, agentId);
            attested = Boolean(await client.getEnsText({ name: normalize(name), key }));
          }
        }

        if (!live) return;
        setLookup({
          state: "found",
          agent: {
            name, address, node: node as Hex, registry,
            owner: mandate.owner, operator: mandate.operator, budget6: mandate.budget6,
            live: isLive as boolean, cutAt, headroom6, boundBy, treasury6, chain,
            endpoint: endpoint || null, context: context || null,
            agentId: agentId && agentId > 0n ? agentId : null, attested,
          },
        });
      } catch (error) {
        if (live) setLookup({ state: "failed", why: (error as Error).message });
      }
    })();

    return () => {
      live = false;
    };
  }, [subject]);

  return lookup;
}
