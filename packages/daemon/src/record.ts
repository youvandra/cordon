/**
 * Writing the record, without a human in the loop.
 *
 * A refusal that nobody publishes is a private fact, and a private fact is not
 * a reputation. The seat — `ConductRecord` — can only write what the vault
 * already holds, so the honest way to keep the record complete is for the
 * daemon to call it after every refusal, immediately, with no judgement
 * applied to which refusals are worth reporting.
 *
 * That last part is the discipline. There is no filter here, no "only report
 * repeated breaches", no severity. The daemon does not decide what goes on the
 * record; it decides nothing. If a draw was refused, the refusal is attested.
 *
 * Everything this file does is best-effort and none of it can affect a bound.
 * Recording happens after the draw has already been evaluated and refused, so
 * a recorder that is broken, unfunded or misconfigured costs the record its
 * completeness and costs the enforcement nothing.
 */
import { hexToString, stringToHex, type Address, type Chain, type Hex, type PublicClient, type WalletClient } from "viem";
import { ERC8004 } from "../../fixtures/src/index.ts";
import { ConductRecordAbi } from "./abi.gen.ts";

/** The ERC-8004 Identity Registry, as much of it as a daemon needs. */
const IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
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
  {
    type: "function",
    name: "setMetadata",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "metadataKey", type: "string" },
      { name: "metadataValue", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export interface RecorderDeps {
  publicClient: PublicClient;
  chain: Chain;
  /** The seat. Absent means no recording, and that is said out loud. */
  record?: Address;
  identity: Address;
  /** Where an agent's page lives, so a registered identity resolves somewhere. */
  agentUriBase?: string;
}

export class Recorder {
  private readonly deps: RecorderDeps;
  /**
   * How to sign as a node. The gate owns the keys and keeps owning them — this
   * is a function it lends, not a copy of its map, so there is still exactly
   * one place in the process where an operator key lives.
   */
  private readonly walletFor: (node: Hex) => WalletClient;

  constructor(deps: RecorderDeps, walletFor: (node: Hex) => WalletClient) {
    this.deps = deps;
    this.walletFor = walletFor;
  }

  get enabled(): boolean {
    return Boolean(this.deps.record);
  }

  /**
   * Give a node an ERC-8004 identity and bind it to the seat.
   *
   * Registration is done with the node's operator key, so the token belongs to
   * the agent. `bind` then checks — on chain, in the contract — that the
   * identity's holder really is that node's operator. Nobody has to be trusted
   * for the link to be true.
   *
   * Returns the agent id, or null when there is nothing to write into.
   */
  async enrol(node: Hex): Promise<bigint | null> {
    const record = this.deps.record;
    if (!record) return null;

    const existing = (await this.deps.publicClient.readContract({
      address: record,
      abi: ConductRecordAbi,
      functionName: "agentIdOf",
      args: [node],
    })) as bigint;
    if (existing !== 0n) return existing;

    const wallet = this.walletFor(node);
    const base = this.deps.agentUriBase ?? "https://getcordon.xyz/agent/";

    const registered = await wallet.writeContract({
      address: this.deps.identity,
      abi: IDENTITY_ABI,
      functionName: "register",
      args: [`${base}${node}`],
      chain: this.deps.chain,
      account: wallet.account!,
    });
    const receipt = await this.deps.publicClient.waitForTransactionReceipt({ hash: registered });

    /* The registry assigns the id, so it is read back rather than predicted —
       an id we guessed would bind the wrong token on a busy chain. Read from
       the block that registration landed in: the event cannot be older than
       the transaction that emitted it, and a public RPC that prunes answers
       a scan from zero with an error rather than with the log. */
    const agentId = await this.lastRegistered(wallet.account!.address, receipt.blockNumber);
    if (agentId === null) return null;

    const bound = await wallet.writeContract({
      address: record,
      abi: ConductRecordAbi,
      functionName: "bind",
      args: [node, agentId],
      chain: this.deps.chain,
      account: wallet.account!,
    });
    await this.deps.publicClient.waitForTransactionReceipt({ hash: bound });
    return agentId;
  }

  /**
   * Write what a node is for onto its own identity.
   *
   * Signed with the node's operator key, because the registry lets only an
   * identity's holder set its metadata. It is a statement by whoever spawned
   * the node and nothing reads it back as a bound: the contract has never seen
   * it, and a surface that shows it says so.
   *
   * Returns the transaction, or null when the node has no identity to write to.
   */
  async describe(node: Hex, purpose: string): Promise<Hex | null> {
    const record = this.deps.record;
    if (!record) return null;

    const agentId = (await this.deps.publicClient.readContract({
      address: record,
      abi: ConductRecordAbi,
      functionName: "agentIdOf",
      args: [node],
    })) as bigint;
    if (agentId === 0n) return null;

    const wallet = this.walletFor(node);
    const hash = await wallet.writeContract({
      address: this.deps.identity,
      abi: IDENTITY_ABI,
      functionName: "setMetadata",
      args: [agentId, ERC8004.purposeKey, stringToHex(purpose)],
      chain: this.deps.chain,
      account: wallet.account!,
    });
    await this.deps.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * What this node's identity already says it is for, if anything.
   *
   * Read before writing, so a daemon that republishes on every start sends a
   * transaction only for the nodes that are actually missing one. `null` means
   * the node has no identity at all, which is a different thing from an
   * identity that says nothing.
   */
  async statedPurpose(node: Hex): Promise<string | null> {
    const record = this.deps.record;
    if (!record) return null;

    const agentId = (await this.deps.publicClient.readContract({
      address: record,
      abi: ConductRecordAbi,
      functionName: "agentIdOf",
      args: [node],
    })) as bigint;
    if (agentId === 0n) return null;

    const raw = (await this.deps.publicClient.readContract({
      address: this.deps.identity,
      abi: IDENTITY_ABI,
      functionName: "getMetadata",
      args: [agentId, ERC8004.purposeKey],
    })) as Hex;
    return raw === "0x" ? "" : hexToString(raw).trim();
  }

  /**
   * Publish one refusal.
   *
   * `attest` takes an id and nothing else: the amount, the node, the reason and
   * the bound that stopped it are all read out of the vault inside the call, so
   * this cannot report something that did not happen even if it wanted to.
   *
   * Anyone may call it, so the daemon uses whichever key it has for the node —
   * the record does not depend on who paid the gas.
   */
  async attest(node: Hex, refusalId: bigint): Promise<Hex | null> {
    const record = this.deps.record;
    if (!record || refusalId === 0n) return null;

    const wallet = this.walletFor(node);
    const hash = await wallet.writeContract({
      address: record,
      abi: ConductRecordAbi,
      functionName: "attest",
      args: [refusalId],
      chain: this.deps.chain,
      account: wallet.account!,
    });
    await this.deps.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /** The most recent identity this address registered, from the registry's own
   *  event. Reading it back is the only way to learn an id the registry chose.
   *  `fromBlock` is the block the registration landed in, not a guess. */
  private async lastRegistered(owner: Address, fromBlock: bigint): Promise<bigint | null> {
    const logs = await this.deps.publicClient.getLogs({
      address: this.deps.identity,
      event: {
        type: "event",
        name: "Registered",
        inputs: [
          { name: "agentId", type: "uint256", indexed: true },
          { name: "agentURI", type: "string", indexed: false },
          { name: "owner", type: "address", indexed: true },
        ],
      },
      args: { owner },
      fromBlock,
      toBlock: "latest",
    });
    const last = logs[logs.length - 1];
    return last ? ((last.args as { agentId?: bigint }).agentId ?? null) : null;
  }
}

/**
 * A recorder that does nothing, for a daemon deployed without a seat.
 *
 * Named rather than a silent `undefined`, so a reader of the startup banner
 * can tell the difference between "recording is off" and "recording is broken".
 */
export const NO_RECORDER = {
  enabled: false as const,
  async enrol(): Promise<null> {
    return null;
  },
  async attest(): Promise<null> {
    return null;
  },
  async describe(): Promise<null> {
    return null;
  },
};

export type AnyRecorder = Pick<Recorder, "enabled" | "enrol" | "attest" | "describe"> | typeof NO_RECORDER;
