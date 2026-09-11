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
import { Recorder } from "./record.ts";

/* The words live in `packages/fixtures` with every other figure a surface
   shows, because the console decodes the same enum from the same events and a
   second copy of this list is a second thing that can fall behind the
   contract. Re-exported so nothing that already imports them has to move. */
import { REASONS, UNRECOGNISED, type Reason } from "../../fixtures/src/index.ts";

export { REASONS, UNRECOGNISED };
export type { Reason };

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
  /**
   * The record. It borrows this gate's signer rather than holding a copy of a
   * key, so there is still exactly one place in the process where an operator
   * key lives.
   */
  readonly recorder: Recorder;

  constructor(config: Config) {
    this.config = config;
    const chain = defineChain({
      id: config.chainId,
      name: `chain-${config.chainId}`,
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });

    this.chain = chain;
    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
      pollingInterval: config.pollMs,
    });

    this.recorder = new Recorder(
      { publicClient: this.publicClient, chain, record: config.record, identity: config.identity },
      (node) => this.walletFor(node),
    );

    for (const { node, keyEnv } of config.keys) {
      const secret = process.env[keyEnv];
      if (!secret) throw new Error(`${keyEnv} is not set`);
      this.wallets.set(
        node.toLowerCase() as Hex,
        createWalletClient({
          account: privateKeyToAccount(secret as Hex),
          chain,
          transport: http(config.rpcUrl),
          pollingInterval: config.pollMs,
        }),
      );
    }
  }

  /** The reader the settler shares, so one process holds one connection to
   *  the chain rather than two that can disagree about its head. */
  get publicClientForSettlement(): PublicClient {
    return this.publicClient;
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

  /**
   * Lend this node's signer.
   *
   * The settler needs to sign a burn intent and an EIP-3009 authorisation as
   * the operator, and borrowing the signer keeps the key in one place rather
   * than handing a copy of it out — the same arrangement the recorder has.
   */
  signerFor(node: Hex): WalletClient {
    return this.walletFor(node);
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
      reason: REASONS[reason] ?? UNRECOGNISED,
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
    params: {
      operator: Address;
      budget6: bigint;
      /** Absent means the parent's own total, which is the widest the contract
       *  will allow a child. Zero is not unlimited and is refused. */
      lifetimeCap6?: bigint;
      trancheCap6: bigint;
      concentrationBps: number;
    },
  ): Promise<{ node: Hex; txHash: Hex }> {
    const wallet = this.walletFor(parent);
    const inherited = (await this.mandate(parent)) as {
      lifetimeCap6: bigint;
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
          lifetimeCap6: params.lifetimeCap6 ?? inherited.lifetimeCap6,
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
            /* A child born mid-run needs an identity before its first refusal
               can be published — `attest` will not file conduct against a node
               with no ERC-8004 identity, and it should not. */
            await this.enrol(node);
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
      const outcome = {
        ...(await this.outcomeFrom(txHash)),
        reason: REASONS[simulatedReason] ?? UNRECOGNISED,
        txHash,
      };
      await this.publish(node, outcome);
      return outcome;
    }

    const txHash = await wallet.writeContract(request);
    return { ...(await this.outcomeFrom(txHash)), txHash };
  }

  /**
   * Give a node an ERC-8004 identity, if there is a seat to bind it to.
   *
   * Idempotent and best-effort. A node that fails to enrol still draws and is
   * still refused; what it loses is the ability to have those refusals
   * published, which is a loss of publicity and never a loss of control.
   */
  async enrol(node: Hex): Promise<bigint | null> {
    if (!this.recorder.enabled) return null;
    try {
      return await this.recorder.enrol(node);
    } catch (error) {
      console.error(`${node} has no identity, so its refusals stay unpublished: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Put the refusal on the public record.
   *
   * Deliberately after the fact and deliberately unable to fail loudly: the
   * bound has already been enforced and the refusal is already on chain by the
   * time this runs, so a seat that is unreachable, unfunded or absent costs the
   * record its completeness and costs the enforcement nothing. There is no
   * filter — every refusal is published, because a daemon that chose which
   * ones to report would be writing an opinion.
   */
  private async publish(node: Hex, outcome: DrawOutcome): Promise<void> {
    if (outcome.released || !outcome.refusalId || !this.recorder.enabled) return;
    try {
      await this.recorder.attest(node, outcome.refusalId);
    } catch (error) {
      console.error(
        `refusal ${outcome.refusalId} is on chain but was not published: ${(error as Error).message}`,
      );
    }
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
          reason: REASONS[args.reason] ?? UNRECOGNISED,
          breachedAt: args.breachedAt,
          refusalId: args.refusalId,
          txHash,
        };
      }
    }

    throw new Error(`draw ${txHash} emitted neither Drawn nor Refused`);
  }
}
