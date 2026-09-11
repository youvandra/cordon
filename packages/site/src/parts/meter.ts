/**
 * Reading the record pages off the meter instead of off fixtures.
 *
 * `ConductRecord.RECORD_BASE` is a Solidity constant, so every record in the
 * reputation registry points at `https://getcordon.xyz/refusal/<decimal id>`
 * for good. Those ids are the chain's, not the preview's, and until this
 * existed they resolved to a not-found — which would make every record Cordon
 * writes a record whose linkage goes nowhere, the exact property this project
 * says the existing data lacks.
 *
 * `VITE_METER_URL` unset means the site behaves exactly as it did: fixtures,
 * labelled preview. Set, a live row wins and a preview id still resolves, so
 * the demo tree keeps working beside real ones.
 *
 * What this deliberately does not do is compute headroom. The meter reduces
 * events; the window arithmetic that produces headroom lives in the contract,
 * and an indexer that models it is a second implementation that can disagree
 * with the thing it reports on. A live refusal shows one figure fewer.
 */
import { useEffect, useState } from "react";

export const METER_URL: string | undefined =
  (import.meta.env.VITE_METER_URL as string | undefined) || undefined;

/** The range every meter answer carries, so a reader knows how far it saw. */
export interface Range {
  chainId: number;
  fromBlock: string;
  toBlock: string;
}

export interface LiveSite {
  blockNumber: string;
  transactionHash: string;
  logIndex: number;
}

export interface LiveRefusal extends Range {
  id: string;
  node: string;
  breachedAt: string;
  counterparty: string;
  amount6: string;
  reason: string;
  site: LiveSite;
  released: boolean | null;
  attested: boolean | null;
}

/** What `/agent/:id` answers: a node's conduct, by ERC-8004 identity. */
export interface LiveConduct extends Range {
  node: string;
  agentId: string | null;
  /** The terms the record is read against. Without these a page has counts
   *  and nothing to measure them by, which is what sent this one to the
   *  preview tree for a mandate it then drew as if it were real. */
  mandate: {
    live: boolean;
    revoked: boolean;
    root: string;
    parent: string | null;
    depth: number;
    operator: string;
    budget6: string;
    lifetimeCap6: string;
  };
  lifetime: { spent6: string; cap6: string; complete: boolean };
  draws: number;
  refusals: number;
  /** Refusals where this node's own bound stopped a descendant's draw. */
  breaches: number;
  drawn6: string;
  refused6: string;
  attested: number;
  /** The share of this node's refusals that name their transaction. */
  linkage: number;
  rows: LiveRefusal[];
}

export type Loaded<T> =
  /* Four states and not three: "no meter is configured" and "the meter was
     asked and had nothing" are different facts, and the second is the one a
     record URI resolving to nothing has to be honest about. */
  | { state: "unconfigured" }
  | { state: "loading" }
  | { state: "live"; data: T }
  | { state: "missing" };

async function read<T>(path: string): Promise<Loaded<T>> {
  if (!METER_URL) return { state: "unconfigured" };
  try {
    const response = await fetch(`${METER_URL}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { state: "missing" };
    return { state: "live", data: (await response.json()) as T };
  } catch {
    /* A meter that is down is not a refusal that does not exist. Both fall
       back to the fixture, and the page says which one it is showing. */
    return { state: "missing" };
  }
}

function useMeter<T>(path: string | null): Loaded<T> {
  const [result, setResult] = useState<Loaded<T>>(
    METER_URL && path ? { state: "loading" } : { state: "unconfigured" },
  );

  useEffect(() => {
    if (!METER_URL || !path) {
      setResult({ state: "unconfigured" });
      return;
    }
    let live = true;
    setResult({ state: "loading" });
    read<T>(path).then((next) => {
      if (live) setResult(next);
    });
    return () => {
      live = false;
    };
  }, [path]);

  return result;
}

/** A refusal by the decimal id the chain writes into the record. */
export function useLiveRefusal(id: string | undefined): Loaded<LiveRefusal> {
  return useMeter<LiveRefusal>(id && /^\d+$/.test(id) ? `/refusal/${id}` : null);
}

/** A node's conduct by its ERC-8004 identity, which is how records address it. */
export function useLiveAgent(id: string | undefined): Loaded<LiveConduct> {
  return useMeter<LiveConduct>(id && /^\d+$/.test(id) ? `/agent/${id}` : null);
}
