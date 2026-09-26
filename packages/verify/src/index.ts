/**
 * @cordon/verify — what a seller needs to know about the agent paying it.
 *
 * This logic already existed, inside a React hook in the Cordon console, which
 * meant the one party it was written for could not use it. A seller integrating
 * an x402 endpoint has a Node process and an address, not a browser and a tree
 * they already own.
 *
 * The whole surface is one function. It answers the four questions a seller
 * actually has, and each answer says where it came from:
 *
 *   is this agent still permitted to spend?   the contract, or the name
 *   how much is left, and who is the limit?   the contract, or the name
 *   who stands behind it, and who can cut it? the contract
 *   where do I send a refund?                 the root, which is fundable
 *
 * What it will not do is guess. Every field that could be absent is `null`
 * rather than a zero or an empty string, because a seller writing
 * `if (result.headroom6 > 0n)` against a fabricated zero would refuse a
 * perfectly good agent, and one reading `0` as `unlimited` would serve a dead
 * one.
 */
import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { normalize } from "viem/ens";

/* Only what this package calls. An interface is a claim about another
   contract's shape, and a claim never exercised is one nothing would catch. */
const REGISTRY_ABI = parseAbi([
  "function isLive(bytes32) view returns (bool)",
  "function revokedAt(bytes32) view returns (bytes32)",
  "function mandate(bytes32) view returns ((bytes32 parent,bytes32 root,address owner,address operator,uint128 budget6,uint128 lifetimeCap6,uint64 windowSeconds,uint128 trancheCap6,uint16 concentrationBps,uint8 depth,uint8 maxDepth,bool revoked,bool exists,uint64 createdAt))",
]);
const VAULT_ABI = parseAbi([
  "function headroom(bytes32) view returns (uint128,bytes32)",
  "function concentrationBound(bytes32,address) view returns (uint128,uint128)",
]);

/** Where each answer came from, because it changes how much it is worth. */
export type Source =
  /** Read from the registry or the vault. Enforced. */
  | "contract"
  /** An ENS text record computed by CordonResolver from those same contracts. */
  | "name-computed"
  /** An ENS text record someone stored. The owner's words, enforced by nothing. */
  | "name-stated";

export interface Verified {
  /** The name that resolved, forward and back. */
  name: string;
  /** The operator key that signs for this agent. */
  address: Address;
  /** The mandate this agent draws against. */
  node: Hex;
  registry: Address;
  /** The root of its tree. Refunds belong here — `fund(root)` is permissionless. */
  root: Hex;
  /** The human who funded the tree and is the only one who can withdraw or cut. */
  owner: Address;

  /** False when this node or any ancestor has been revoked. */
  live: boolean;
  /** Which node's revocation cut it. Null while live. */
  revokedAt: Hex | null;

  /**
   * The most this agent could still draw, all sellers, in USDC base units.
   * Null when no vault address was supplied — absent, not zero.
   */
  headroom6: bigint | null;
  /** The node whose limit produces that figure. Often an ancestor. */
  boundBy: Hex | null;

  /** How far from the root it sits, and how deep its tree may go. */
  depth: number;
  /** Every ancestor, leaf first, root last. Each operator above it can cut it. */
  chain: { node: Hex; operator: Address; depth: number }[];

  /** Stated by the owner, enforced by nothing. */
  endpoint: string | null;
  context: string | null;

  /** Where each of the enforced answers actually came from. */
  sources: { live: Source; headroom: Source | null };

  /**
   * Whether the NAME's own computed liveness matched the contract's.
   *
   * Null when the name carries no computed record — it is on a resolver that
   * only stores things, which is not a fault. `false` is worth acting on: the
   * name is answering from somewhere that disagrees with the chain, so treat
   * the name as untrustworthy and the contract as the truth. Every field above
   * already comes from the contract, so a false here costs a seller nothing
   * except a reason to stop believing the record.
   */
  nameAgrees: boolean | null;
}

export type Result =
  | { ok: true; agent: Verified }
  /** The address has no name, or the name does not resolve back to it. */
  | { ok: false; reason: "unnamed"; subject: string }
  /** A name that resolves but carries no Cordon pointer. Not a Cordon agent. */
  | { ok: false; reason: "unbound"; name: string; address: Address }
  | { ok: false; reason: "failed"; why: string };

export interface VerifyOptions {
  /** The chain ENS and the mandates are on. */
  chain: Chain;
  rpcUrl?: string;
  /** Supply to bring your own transport, caching or rate limiting. */
  client?: PublicClient;
  /**
   * The vault, so headroom can be answered from the contract.
   *
   * Optional: without it `headroom6` falls back to the name's computed record
   * and is null if the name does not carry one. It is never fabricated.
   */
  vault?: Address;
  /** Override the ENS universal resolver — needed on ENSv2 previews. */
  universalResolver?: Address;
}

/**
 * Verify an agent by ENS name, or by the address that paid you.
 *
 * A seller starts from an address, because that is what a payment authorisation
 * carries. Given one, this reverse-resolves it and then checks the name resolves
 * FORWARD to the same address — without that second half, anyone can point a
 * name at somebody else's address and borrow their bound.
 */
export async function verify(subject: string, options: VerifyOptions): Promise<Result> {
  const client =
    options.client ??
    (createPublicClient({
      chain: options.chain,
      transport: http(options.rpcUrl),
      ...(options.universalResolver
        ? { contracts: { ensUniversalResolver: { address: options.universalResolver } } }
        : {}),
    }) as PublicClient);

  const asked = subject.trim();
  if (!asked) return { ok: false, reason: "failed", why: "nothing to look up" };

  try {
    let name: string;
    if (isAddress(asked)) {
      const found = await client.getEnsName({ address: asked });
      if (!found) return { ok: false, reason: "unnamed", subject: asked };
      name = found;
    } else {
      name = normalize(asked);
    }

    const address = await client.getEnsAddress({ name: normalize(name) });
    if (!address) return { ok: false, reason: "unnamed", subject: asked };
    if (isAddress(asked) && address.toLowerCase() !== asked.toLowerCase()) {
      return { ok: false, reason: "unnamed", subject: asked };
    }

    const text = (key: string) =>
      client.getEnsText({ name: normalize(name), key }).catch(() => null);

    const [nodeText, registryText, endpoint, context, liveText, headroomText, boundByText] =
      await Promise.all([
        text("cordon.node"),
        text("cordon.registry"),
        text("agent-endpoint[mcp]"),
        text("agent-context"),
        text("cordon.live"),
        text("cordon.headroom"),
        text("cordon.boundBy"),
      ]);

    if (!nodeText || !registryText) {
      return { ok: false, reason: "unbound", name, address };
    }

    const node = nodeText as Hex;
    const registry = registryText as Address;

    const [mandate, isLive, revoked] = await Promise.all([
      client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "mandate", args: [node] }),
      client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "isLive", args: [node] }),
      client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "revokedAt", args: [node] }),
    ]);

    /* Up the tree one parent at a time: the bound that stops an agent is often
       not its own, and every operator above it can cut it off. */
    const chain: Verified["chain"] = [];
    let cursor = node;
    for (let i = 0; i <= mandate.maxDepth + 1; i++) {
      const m =
        i === 0
          ? mandate
          : await client.readContract({
              address: registry, abi: REGISTRY_ABI, functionName: "mandate", args: [cursor],
            });
      if (!m.exists) break;
      chain.push({ node: cursor, operator: m.operator, depth: m.depth });
      if (m.parent === ZERO32) break;
      cursor = m.parent;
    }

    let headroom6: bigint | null = null;
    let boundBy: Hex | null = null;
    let headroomSource: Source | null = null;

    if (options.vault) {
      const [available, by] = (await client.readContract({
        address: options.vault, abi: VAULT_ABI, functionName: "headroom", args: [node],
      })) as [bigint, Hex];
      headroom6 = available;
      boundBy = by === ZERO32 ? null : by;
      headroomSource = "contract";
    } else if (headroomText) {
      /* The name's own computed record. Same contracts, one hop further away. */
      headroom6 = parseBase6(headroomText);
      boundBy = (boundByText as Hex) || null;
      headroomSource = headroom6 === null ? null : "name-computed";
    }

    return {
      ok: true,
      agent: {
        name,
        address,
        node,
        registry,
        root: mandate.root,
        owner: mandate.owner,
        live: isLive as boolean,
        revokedAt: (revoked as Hex) === ZERO32 ? null : (revoked as Hex),
        headroom6,
        boundBy,
        depth: mandate.depth,
        chain,
        endpoint: endpoint || null,
        context: context || null,
        sources: {
          /* The contract, always: liveness is the one answer never worth taking
             at one remove, and it is a single cheap call. */
          live: "contract",
          headroom: headroomSource,
        },
        /* Compared, not assumed. A computing resolver answers "true" or
           "revoked"; anything else, including a stored record somebody wrote by
           hand, is a disagreement worth surfacing. */
        nameAgrees: liveText === null ? null : liveText === (isLive ? "true" : "revoked"),
      },
    };
  } catch (error) {
    return { ok: false, reason: "failed", why: (error as Error).message };
  }
}

const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * "4.230000" -> 4_230_000n. Null on anything that is not that shape.
 *
 * Strict on purpose. A record that has been tampered with, or written by a
 * resolver that formats differently, must read as absent rather than as a
 * number a seller would act on.
 */
export function parseBase6(value: string): bigint | null {
  const match = /^(\d+)\.(\d{6})$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]!) * 1_000_000n + BigInt(match[2]!);
}

/** USDC base units as a human amount, for logs and error messages. */
export function formatBase6(base6: bigint): string {
  const whole = base6 / 1_000_000n;
  return `${whole}.${(base6 % 1_000_000n).toString().padStart(6, "0")}`;
}

/**
 * Does this agent have room for a purchase of `price6`?
 *
 * The check a seller makes before extending anything — a rate-limit tier, a
 * metered plan, work delivered before payment. It refuses on an unknown
 * headroom rather than assuming room, because the direction that flatters is
 * the one to refuse.
 */
export function canAfford(agent: Verified, price6: bigint): boolean {
  if (!agent.live) return false;
  if (agent.headroom6 === null) return false;
  return agent.headroom6 >= price6;
}
