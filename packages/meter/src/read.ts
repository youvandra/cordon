/**
 * Reading Arc.
 *
 * Everything the meter knows comes from logs, in ranges, in order. There is no
 * second source and no side channel: if a figure is not in an event emitted by
 * one of the three contracts, the meter does not have it, and the page that
 * wanted it says so.
 *
 * Ranges are chunked because an RPC will refuse an unbounded `eth_getLogs`, and
 * chunking is also what makes the read resumable — a snapshot carries the last
 * block it covered, and the next run starts at the one after it.
 */
import { parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import {
  TreeVaultAbi,
  MandateRegistryAbi,
  ConductRecordAbi,
} from "../../daemon/src/abi.gen.ts";
import { REASONS, type Event, type Reason } from "./ledger.ts";
import { retryOnRateLimit } from "../../fixtures/src/rpc.ts";

export interface Contracts {
  registry: Address;
  vault: Address;
  /** Absent before the seat is deployed. The tree is still readable without it. */
  record?: Address;
}

export interface ReadOptions {
  fromBlock: bigint;
  toBlock: bigint;
  /** Blocks per `eth_getLogs`. Arc is fast and cheap; a public RPC is not. */
  chunk?: bigint;
  /** How many times one chunk may be retried after a rate limit. */
  attempts?: number;
  /** A pause between chunks. A backfill that asks as fast as it can is what
   *  produces the limit it then has to wait out. */
  paceMs?: number;
}

/** Decoded, in chain order: block, then log index. */
export async function readEvents(
  client: PublicClient,
  contracts: Contracts,
  options: ReadOptions,
): Promise<Event[]> {
  const chunk = options.chunk ?? 2_000n;
  const paceMs = options.paceMs ?? 150;
  const out: Event[] = [];

  let first = true;
  for (let start = options.fromBlock; start <= options.toBlock; start += chunk) {
    if (!first && paceMs > 0) await new Promise((done) => setTimeout(done, paceMs));
    first = false;
    const end = start + chunk - 1n > options.toBlock ? options.toBlock : start + chunk - 1n;

    const addresses: Address[] = [contracts.registry, contracts.vault];
    if (contracts.record) addresses.push(contracts.record);

    /* A rate limit here is Arc's public endpoint under a backfill, and it is
       the one error worth waiting out rather than ending the read on. */
    const logs = await retryOnRateLimit(
      () => client.getLogs({ address: addresses, fromBlock: start, toBlock: end }),
      { attempts: options.attempts },
    );

    /* Decode against each ABI separately. A log that belongs to another
       contract simply does not match, and `strict` keeps a partial decode from
       becoming a row with missing fields. */
    for (const abi of [MandateRegistryAbi, TreeVaultAbi, ConductRecordAbi] as const) {
      for (const parsed of parseEventLogs({ abi, logs, strict: true })) {
        const event = translate(parsed);
        if (event) out.push(event);
      }
    }
  }

  out.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );
  return out;
}

/* The decoded log shape viem hands back is loosely typed across three ABIs, so
   this is the one place a cast happens — and every field is named explicitly
   rather than spread, so a renamed event parameter is a build error here
   rather than an `undefined` in a ledger. */
type Decoded = { eventName: string; args: Record<string, unknown> } & {
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
};

function translate(log: unknown): Event | null {
  const l = log as Decoded;
  const at = {
    blockNumber: l.blockNumber,
    transactionHash: l.transactionHash,
    logIndex: l.logIndex,
  };
  const a = l.args;

  switch (l.eventName) {
    case "MandateOpened":
      return {
        kind: "MandateOpened", ...at,
        node: a.node as Hex,
        owner: a.owner as Address,
        operator: a.operator as Address,
        budget6: a.budget6 as bigint,
        lifetimeCap6: a.lifetimeCap6 as bigint,
        windowSeconds: Number(a.windowSeconds),
        maxDepth: Number(a.maxDepth),
      };

    case "MandateSpawned":
      return {
        kind: "MandateSpawned", ...at,
        node: a.node as Hex,
        parent: a.parent as Hex,
        operator: a.operator as Address,
        budget6: a.budget6 as bigint,
        lifetimeCap6: a.lifetimeCap6 as bigint,
        depth: Number(a.depth),
      };

    case "MandateRevoked":
      return { kind: "MandateRevoked", ...at, node: a.node as Hex, by: a.by as Address };

    case "Funded":
      return { kind: "Funded", ...at, root: a.root as Hex, from: a.from as Address, amount6: a.amount6 as bigint };

    case "Withdrawn":
      return { kind: "Withdrawn", ...at, root: a.root as Hex, to: a.to as Address, amount6: a.amount6 as bigint };

    case "Drawn":
      return {
        kind: "Drawn", ...at,
        node: a.node as Hex,
        counterparty: a.counterparty as Address,
        beneficiary: a.beneficiary as Address,
        amount6: a.amount6 as bigint,
        root: a.root as Hex,
      };

    case "AncestorDebited":
      return {
        kind: "AncestorDebited", ...at,
        node: a.node as Hex,
        ancestor: a.ancestor as Hex,
        amount6: a.amount6 as bigint,
        spent6: a.spent6 as bigint,
        budget6: a.budget6 as bigint,
      };

    case "Refused":
      return {
        kind: "Refused", ...at,
        refusalId: a.refusalId as bigint,
        node: a.node as Hex,
        breachedAt: a.breachedAt as Hex,
        counterparty: a.counterparty as Address,
        amount6: a.amount6 as bigint,
        reason: reasonOf(a.reason),
      };

    case "Released":
      return {
        kind: "Released", ...at,
        refusalId: a.refusalId as bigint,
        by: a.by as Address,
        counterparty: a.counterparty as Address,
        amount6: a.amount6 as bigint,
      };

    case "Bound":
      return {
        kind: "Bound", ...at,
        node: a.node as Hex,
        agentId: a.agentId as bigint,
        operator: a.operator as Address,
      };

    case "Attested":
      return {
        kind: "Attested", ...at,
        refusalId: a.refusalId as bigint,
        node: a.node as Hex,
        agentId: a.agentId as bigint,
        recordHash: a.recordHash as Hex,
      };

    /* Everything else — ReleaseAttested, Bound's siblings, anything added
       later — is skipped rather than guessed at. */
    default:
      return null;
  }
}

/** The enum arrives as a number. A reason we cannot name is not renamed to
 *  "none", because "none" means the draw was released. */
function reasonOf(value: unknown): Reason {
  const index = Number(value);
  const reason = REASONS[index];
  if (!reason) throw new Error(`unknown refusal reason ${index}: this build is older than the contract`);
  return reason;
}
