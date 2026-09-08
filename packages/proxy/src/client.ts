/**
 * The proxy's only way to spend: ask the daemon.
 *
 * The surfaces forward to the daemon and hold no logic, and this file is where
 * that is true or not. The proxy holds no key, reads no chain and knows no
 * bound — it turns an intercepted request into `POST /fetch` and renders
 * whatever comes back. Every decision about money is made a process away, by
 * the thing that holds the key, using the contract.
 */
import type { FetchResult } from "../../daemon/src/fetch.ts";

export type { FetchResult };

export interface DaemonClient {
  fetch(request: {
    node: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<FetchResult>;
}

export class DaemonUnreachable extends Error {}

export function httpDaemon(daemonUrl: string): DaemonClient {
  const base = daemonUrl.replace(/\/+$/, "");
  return {
    async fetch(request) {
      let response: Response;
      try {
        response = await globalThis.fetch(`${base}/fetch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          /* Longer than the daemon's own transport timeout, so a slow seller
             surfaces as the seller's timeout rather than as ours. */
          signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        throw new DaemonUnreachable(
          `no cordon daemon at ${base}: ${(error as Error).message}`,
        );
      }

      const text = await response.text();
      if (!response.ok) {
        throw new DaemonUnreachable(`daemon answered ${response.status}: ${text.slice(0, 400)}`);
      }
      return JSON.parse(text) as FetchResult;
    },
  };
}
