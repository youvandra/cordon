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
import { assertPublicUrl, EgressError } from "./egress.ts";

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
      /** The transaction that brought the tranche out of the Gateway balance
       *  so it could be paid. A purchase has two transactions of ours — the
       *  draw and this — and a third that is the seller's own collection. */
      settlementTx?: string;
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
    settlementTx: settlement.txHash,
  };
}

/** How many hops a seller may send this daemon on before it stops. */
const MAX_REDIRECTS = 3;

/**
 * The default transport. Separated so tests drive a seller, not the network.
 *
 * Redirects are followed here rather than by `fetch`, for two reasons and both
 * of them are about what a seller can do with a 302.
 *
 * The first is the fence: `fetch` follows a redirect to wherever it points,
 * including back into this machine, so a URL an agent was refused for is a URL
 * a seller can hand it. Every hop goes through `assertPublicUrl`.
 *
 * The second is the signature. The paid retry carries `PAYMENT-SIGNATURE`, an
 * EIP-3009 authorisation the seller submits itself — a bearer instrument.
 * `fetch` strips `Authorization` across an origin and leaves custom headers
 * alone, so a seller answering 302 could have had that forwarded to a host the
 * daemon never priced against. The authorisation names its payee, so the money
 * still cannot go anywhere else; what a third party gets is the chance to
 * submit it first, which is not a thing to hand out by accident.
 */
export function createHttpTransport(options: { assert?: typeof assertPublicUrl } = {}): Transport {
  const guard = options.assert ?? assertPublicUrl;
  return httpTransportWith(guard);
}

/** The one the daemon and the MCP server use. */
export const httpTransport: Transport = (url, init) => httpTransportWith(assertPublicUrl)(url, init);

const httpTransportWith = (assert: typeof assertPublicUrl): Transport => async (url, init) => {
  let target = await assert(url);
  const origin = target.origin;
  const carriesPayment = Object.keys(init.headers).some(
    (name) => name.toLowerCase() === "payment-signature" || name.toLowerCase() === "x-payment",
  );

  for (let hop = 0; ; hop++) {
    const response = await fetch(target, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      /* Followed below instead, so each hop is checked. */
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
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
    }

    if (hop >= MAX_REDIRECTS) {
      throw new EgressError(`${url} redirected more than ${MAX_REDIRECTS} times`);
    }

    const next = await assert(new URL(location, target).toString());
    if (carriesPayment && next.origin !== origin) {
      throw new EgressError(
        `${target.origin} redirected a paid request to ${next.origin}. The authorisation in it is ` +
          `signed and bearer, and it was priced against the first of those two.`,
      );
    }
    target = next;
  }
};
