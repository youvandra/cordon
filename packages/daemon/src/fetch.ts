/**
 * `cordon_fetch` — the only thing an agent can ask for.
 *
 * The agent hands over a URL. Everything that follows is the daemon's: read
 * the seller's 402, take the counterparty from it, ask the contract for a
 * tranche of exactly that size, and only pay if the contract released it.
 *
 * The order matters and is the whole design. The bound is checked BEFORE the
 * money exists, so a refusal is a refusal rather than a regret.
 */
import type { Address, Hex } from "viem";
import { parseChallenge, selectOffer, type Acceptable, type Offer } from "./challenge.ts";
import type { Gate, DrawOutcome } from "./gate.ts";
import type { Settler } from "./settle.ts";

export interface FetchRequest {
  node: Hex;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/* `headers` is the seller's own response headers, carried through untouched.
   The MCP surface has no use for them, but the proxy does: it is standing in
   for the network in front of an unmodified program, and a program that asked
   for a URL is entitled to the content type it came back with. Dropping them
   would make the proxy quietly lossy in a way only binary responses reveal. */
export type FetchResult =
  | { paid: false; free: true; status: number; headers: Record<string, string>; body: unknown }
  | { paid: false; free: false; refusal: DrawOutcome; offer: Offer }
  | {
      paid: true;
      status: number;
      headers: Record<string, string>;
      body: unknown;
      draw: DrawOutcome;
      offer: Offer;
    };

export interface Transport {
  (url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: unknown;
  }>;
}

export async function cordonFetch(
  request: FetchRequest,
  deps: { gate: Gate; settler: Settler; acceptable: Acceptable; transport: Transport },
): Promise<FetchResult> {
  const { gate, settler, acceptable, transport } = deps;
  const method = request.method ?? "GET";
  const headers = { ...request.headers };

  const first = await transport(request.url, { method, headers, body: request.body });

  const challenge = parseChallenge(first.status, first.body);
  if (!challenge) {
    // Not every URL costs money, and a free one must not touch the tree.
    return { paid: false, free: true, status: first.status, headers: first.headers, body: first.body };
  }

  const offer = selectOffer(challenge, acceptable);

  /* The counterparty on chain is the seller's own payTo, and the amount is the
     seller's own price. Neither is chosen by the agent, and neither is chosen
     by us — which is exactly why the tranche cap exists: a seller asking for
     $200 gets refused by the contract, not argued with here. */
  const draw = await gate.draw(request.node, offer.payTo as Address, offer.amount);

  if (!draw.released) {
    return { paid: false, free: false, refusal: draw, offer };
  }

  const settlement = await settler.settle(request.node, {
    to: offer.payTo as Address,
    value: offer.amount,
    asset: offer.asset as Address,
    network: offer.network,
    /* The seller's own terms for the signature it will submit: the token's
       EIP-712 name and version, and how long the authorisation must stay
       valid. Both come from the challenge, neither from us. */
    extra: offer.extra,
    maxTimeoutSeconds: offer.maxTimeoutSeconds,
  });

  const second = await transport(request.url, {
    method,
    headers: { ...headers, "PAYMENT-SIGNATURE": settlement.proof },
    body: request.body,
  });

  return {
    paid: true,
    status: second.status,
    headers: second.headers,
    body: second.body,
    draw,
    offer,
  };
}

/** The default transport. Separated so tests drive a seller, not the network. */
export const httpTransport: Transport = async (url, init) => {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON, and that is fine — only a 402 challenge has to be */
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
};
