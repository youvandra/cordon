/**
 * `/attest/<8004-id>` — the record, priced.
 *
 * The public page at `/agent/<id>` is free and always will be; this is the
 * same facts for a machine that wants them in a call, and it is the first
 * thing Cordon sells. A seller asks it before serving an agent, an
 * underwriter before pricing one.
 *
 * Two orderings in here are the whole design of an honest paid endpoint:
 *
 * 1. **Whether the answer exists is free.** An identity this range does not
 *    contain gets a 404 and no challenge. Charging for an empty answer is how
 *    a paid endpoint becomes a tollbooth.
 * 2. **Payment is collected before the answer is written, and the answer is
 *    written only if collection succeeded.** A failed settlement leaves the
 *    payer's authorisation unspent and returns a 402 that says why.
 *
 * The process holds one key and it belongs to the collector. Nothing here can
 * open a mandate, release a refusal or write a record.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ATTEST } from "../../fixtures/src/index.ts";
import type { Ledger } from "../../meter/src/index.ts";
import { attestation, nodeForAgent, type Sources } from "./answer.ts";
import { challengeBody } from "./challenge.ts";
import type { Collector } from "./collect.ts";
import { Nonces, parsePayment, PaymentError, verifyPayment, type Terms } from "./payment.ts";

export interface AttestOptions {
  current: () => Ledger;
  terms: Terms;
  collector: Collector;
  sources: Sources;
  /** Seconds. Injected so a test is not at the mercy of a clock. */
  now?: () => bigint;
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    /* The record is meant to be read by people who are not the owner. */
    "access-control-allow-origin": "*",
    ...headers,
  });
  res.end(text);
};

/* A buyer may send either header. `X-PAYMENT` is the x402 name; the daemon on
   the other side of this project sends `PAYMENT-SIGNATURE`, the name Circle's
   live catalogue used when it was read. Taking both costs one line and means
   Cordon can pay Cordon. */
const paymentHeader = (req: IncomingMessage): string | undefined => {
  const value = req.headers["x-payment"] ?? req.headers["payment-signature"];
  return Array.isArray(value) ? value[0] : value;
};

export function createAttestApi(options: AttestOptions) {
  const { current, terms, collector, sources } = options;
  const now = options.now ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const nonces = new Nonces();

  return createServer(async (req, res) => {
    const ledger = current();
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    const range = { chainId: ledger.chainId, fromBlock: ledger.fromBlock, toBlock: ledger.toBlock };

    if (req.method !== "GET") {
      return json(res, 405, { error: "this endpoint sells a reading, not a writing" });
    }

    if (parts.length === 0 || parts[0] === "health") {
      return json(res, 200, {
        ...range,
        price6: terms.price6,
        asset: terms.asset,
        payTo: terms.payTo,
        network: terms.network,
        scheme: terms.scheme,
        x402Version: ATTEST.x402Version,
        nodes: Object.keys(ledger.nodes).length,
        refusals: ledger.refusals.length,
        resource: ATTEST.resourcePath,
      });
    }

    if (parts[0] !== "attest" || !parts[1]) {
      return json(res, 404, {
        error: "no such endpoint",
        endpoints: ["GET /health", `GET ${ATTEST.resourcePath}/:agentId`],
      });
    }

    if (!/^\d+$/.test(parts[1])) {
      return json(res, 400, { error: "an ERC-8004 identity is a number" });
    }

    /* Free, and deliberately before the price is mentioned. */
    const row = nodeForAgent(ledger, BigInt(parts[1]));
    if (!row) {
      return json(res, 404, {
        error: "no node in this range is bound to that identity",
        ...range,
      });
    }

    const resource = `${ATTEST.resourcePath}/${parts[1]}`;
    const offer = (error?: string) => json(res, 402, challengeBody({ terms, resource, error }));

    const header = paymentHeader(req);
    if (!header) return offer();

    let payment;
    try {
      payment = parsePayment(header);
    } catch (error) {
      if (error instanceof PaymentError) return offer(error.message);
      throw error;
    }

    const verdict = await verifyPayment(payment, terms, now());
    if (!verdict.ok) return offer(verdict.reason);

    if (nonces.has(payment.authorization)) {
      return offer("that authorisation has already been used here");
    }
    nonces.add(payment.authorization);

    let collected;
    try {
      collected = await collector.collect(payment);
    } catch (error) {
      nonces.drop(payment.authorization);
      return offer(`settlement failed: ${(error as Error).message}`);
    }

    /* The ledger is read again after settlement. The answer a payer gets is
       the record as of the moment they paid for it, not as of the moment they
       asked, and the two differ by however long the settlement took. */
    const after = current();
    const settled = nodeForAgent(after, BigInt(parts[1])) ?? row;

    return json(res, 200, attestation(after, settled, sources), {
      "x-payment-response": Buffer.from(
        JSON.stringify({
          success: true,
          transaction: collected.txHash,
          network: terms.network,
          payer: collected.payer,
          amount: collected.amount6.toString(),
        }),
      ).toString("base64"),
    });
  });
}
