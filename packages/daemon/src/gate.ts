/**
 * The gate. Every purchase passes through here, and nothing else can pay.
 *
 * The daemon holds the keys and the agent holds none, so this is the only
 * place a tranche can come from. It simulates the draw before sending it, so a
 * refusal costs no gas and is known before the money is asked for; then it
 * sends, and reads the outcome back out of the events rather than trusting the
 * simulation, because the two can differ if the tree moved in between.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  decodeEventLog,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TreeVaultAbi, MandateRegistryAbi } from "./abi.gen.ts";
import type { Config } from "./config.ts";

/** Mirrors TreeVault.Reason. The order is part of the ABI. */
export const REASONS = [
  "none",
  "revoked",
  "tranche-cap",
  "window-budget",
  "concentration",
  "vault-balance",
] as const;
export type Reason = (typeof REASONS)[number];

export interface DrawOutcome {
  released: boolean;
  reason: Reason;
  /** Which node's bound stopped it. Often an ancestor, which is the point. */
  breachedAt?: Hex;
  refusalId?: bigint;
  txHash?: Hex;
  /** Whose Gateway balance was topped up. */
  beneficiary?: Address;
}

/**
 * Written for node's strip-only TypeScript: no parameter properties, no enums,
 * no namespaces. The daemon runs under plain `node src/main.ts` with no build
 * step, and a syntax that needs a compiler would quietly reintroduce one.
 */
export class Gate {
  private readonly publicClient: PublicClient;
  private readonly wallets = new Map<Hex, WalletClient>();
  private readonly pending = new Map<string, Hex>();
  private readonly config: Config;
  private readonly chain: ReturnType<typeof defineChain>;

  constructor(config: Config) {
    this.config = config;
    const chain = defineChain({
      id: config.chainId,
      name: `chain-${config.chainId}`,
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });

    this.chain = chain;
    this.publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

    for (const { node, keyEnv } of config.keys) {
      const secret = process.env[keyEnv];
      if (!secret) throw new Error(`${keyEnv} is not set`);
      this.wallets.set(
        node.toLowerCase() as Hex,
        createWalletClient({
          account: privateKeyToAccount(secret as Hex),
          chain,
          transport: http(config.rpcUrl),
        }),
      );
    }
  }

  /** The nodes this daemon can act for. It holds no other key. */
  nodes(): Hex[] {
    return [...this.wallets.keys()];
  }

  /**
   * Take custody of a key for a node spawned at run time.
   *
   * A sub-agent created mid-run needs an operator, and the claim is that the
   * daemon holds it and the agent holds none. The key stays in this process's
   * memory: it is never returned to a caller, never logged, and never written
   * to disk. A key an agent could read is a key it holds.
   *
   * The node is bound after the fact, once the registry has assigned it, which
   * is why this takes the key and `bindOperator` takes the node.
   */
  addOperator(secret: Hex): Address {
    const account = privateKeyToAccount(secret);
    this.pending.set(account.address.toLowerCase(), secret);
    return account.address;
  }

  /** Attach a previously added key to the node the registry gave it. */
  bindOperator(node: Hex, operator: Address): void {
    const secret = this.pending.get(operator.toLowerCase());
    if (!secret) throw new Error(`no key held for operator ${operator}`);
    this.wallets.set(
      node.toLowerCase() as Hex,
      createWalletClient({
        account: privateKeyToAccount(secret),
        chain: this.chain,
        transport: http(this.config.rpcUrl),
      }),
    );
    this.pending.delete(operator.toLowerCase());
  }

  private walletFor(node: Hex): WalletClient {
    const wallet = this.wallets.get(node.toLowerCase() as Hex);
    if (!wallet) throw new Error(`this daemon holds no key for ${node}`);
    return wallet;
  }

  /**
   * What a draw would do, without doing it. Free, and the honest thing to show
   * an operator before they ask for money.
   */
  async evaluate(node: Hex, counterparty: Address, amount: bigint): Promise<DrawOutcome> {
    const [reason, breachedAt] = (await this.publicClient.readContract({
      address: this.config.vault,
      abi: TreeVaultAbi,
      functionName: "evaluate",
      args: [node, counterparty, amount],
    })) as [number, Hex];

    return {
      released: reason === 0,
      reason: REASONS[reason] ?? "none",
      breachedAt: reason === 0 ? undefined : breachedAt,
    };
  }

  /** What this node may still draw in total, and which node is the reason. */
  async headroom(node: Hex): Promise<{ available: bigint; boundBy: Hex }> {
    const [available, boundBy] = (await this.publicClient.readContract({
      address: this.config.vault,
      abi: TreeVaultAbi,
      functionName: "headroom",
      args: [node],
    })) as [bigint, Hex];
    return { available, boundBy };
  }

  async mandate(node: Hex) {
    return this.publicClient.readContract({
      address: this.config.registry,
      abi: MandateRegistryAbi,
      functionName: "mandate",
      args: [node],
    });
  }

  /**
   * Register a child mandate under a node this daemon holds the key for.
   *
   * No owner signature: spawns happen in seconds while the owner sleeps. The
   * contract refuses a child wider than its parent no matter who asks, so the
   * safety is structural rather than procedural. The narrowing is not checked
   * here on purpose — a second copy of that rule is a second place for it to
   * be wrong.
   */
  async spawn(
    parent: Hex,
    params: { operator: Address; budget6: bigint; trancheCap6: bigint; concentrationBps: number },
  ): Promise<{ node: Hex; txHash: Hex }> {
    const wallet = this.walletFor(parent);
    const inherited = (await this.mandate(parent)) as {
      windowSeconds: bigint;
      maxDepth: number;
    };

    const { request } = await this.publicClient.simulateContract({
      address: this.config.registry,
      abi: MandateRegistryAbi,
      functionName: "spawn",
      args: [
        parent,
        {
          operator: params.operator,
          budget6: params.budget6,
          windowSeconds: inherited.windowSeconds,
          trancheCap6: params.trancheCap6,
          concentrationBps: params.concentrationBps,
          maxDepth: inherited.maxDepth,
        },
      ],
      account: wallet.account!,
    });

    const txHash = await wallet.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({ abi: MandateRegistryAbi, data: log.data, topics: log.topics });
        if (event.eventName === "MandateSpawned") {
          const node = (event.args as { node: Hex }).node;
          /* If this daemon is holding the child's key, attach it now — the
             node id did not exist until the registry assigned it. */
          if (this.pending.has(params.operator.toLowerCase())) {
            this.bindOperator(node, params.operator);
          }
          return { node, txHash };
        }
      } catch {
        continue;
      }
    }
    throw new Error(`spawn ${txHash} emitted no MandateSpawned`);
  }

  /**
   * Ask for a tranche, sized to the purchase, declaring who it is for.
   *
   * A refusal is a returned value rather than a revert, so this resolves in
   * both cases and the caller reads `released`. It never throws to mean "no".
   */
  async draw(node: Hex, counterparty: Address, amount: bigint): Promise<DrawOutcome> {
    const wallet = this.walletFor(node);

    /* Simulate first: a refusal that has not been sent costs nothing, and the
       simulation is also what tells us the tranche was in bounds before we ask
       an operator key to sign anything. */
    const { request, result } = await this.publicClient.simulateContract({
      address: this.config.vault,
      abi: TreeVaultAbi,
      functionName: "draw",
      args: [node, counterparty, amount],
      account: wallet.account!,
    });

    const [wouldRelease, , simulatedReason] = result as [boolean, bigint, number];
    if (!wouldRelease) {
      /* Send it anyway. The refusal is the product: a draw that is never
         recorded is a draw nobody can hold the tree to afterwards. */
      const txHash = await wallet.writeContract(request);
      return { ...(await this.outcomeFrom(txHash)), reason: REASONS[simulatedReason] ?? "none", txHash };
    }

    const txHash = await wallet.writeContract(request);
    return { ...(await this.outcomeFrom(txHash)), txHash };
  }

  /** Read what actually happened out of the log, not out of the simulation. */
  private async outcomeFrom(txHash: Hex): Promise<DrawOutcome> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    for (const log of receipt.logs) {
      let event;
      try {
        event = decodeEventLog({ abi: TreeVaultAbi, data: log.data, topics: log.topics });
      } catch {
        continue; // a log from another contract in the same transaction
      }

      if (event.eventName === "Drawn") {
        const args = event.args as { beneficiary: Address };
        return { released: true, reason: "none", beneficiary: args.beneficiary, txHash };
      }

      if (event.eventName === "Refused") {
        const args = event.args as { refusalId: bigint; breachedAt: Hex; reason: number };
        return {
          released: false,
          reason: REASONS[args.reason] ?? "none",
          breachedAt: args.breachedAt,
          refusalId: args.refusalId,
          txHash,
        };
      }
    }

    throw new Error(`draw ${txHash} emitted neither Drawn nor Refused`);
  }
}
