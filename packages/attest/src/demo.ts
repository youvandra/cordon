/**
 * `demo-seller.getcordon.xyz` — a paid API that is not the record.
 *
 * Every example in this project used to buy from `attest`, which is Cordon
 * selling Cordon's own conduct record. That proves the payment path and reads
 * as a closed loop. Circle's marketplace, where an outside seller would come
 * from, has nothing on a testnet, so this is the outside seller: one endpoint,
 * a live reading of Arc, one dollar.
 *
 * It takes money exactly the way `attest` does — the same parser, the same
 * verification, the same collector and key — so nothing about payment is
 * written twice. What differs is what is sold, and one ordering:
 *
 * **The reading is taken before the price is mentioned.** If the chain cannot
 * be read there is nothing to sell, and a 503 with no challenge says so. A
 * payer is never asked to sign for an answer this process already knows it
 * cannot give.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DEMO_SELLER } from "../../fixtures/src/index.ts";
import type { Collector } from "./collect.ts";
import { Nonces, parsePayment, PaymentError, verifyPayment, type Terms } from "./payment.ts";

/** What is sold. Every field is read from the chain at the moment of sale. */
export interface Snapshot {
  chainId: number;
  blockNumber: bigint;
  /** Seconds. The block's own timestamp, not this process's clock. */
  timestamp: bigint;
  gasPrice: bigint;
}

export interface DemoSellerOptions {
  terms: Terms;
  collector: Collector;
  read: () => Promise<Snapshot>;
  now?: () => bigint;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "x-payment, payment-signature, content-type, accept",
  "access-control-expose-headers": "x-payment-response",
  "access-control-max-age": "86400",
} as const;

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    ...CORS,
    ...headers,
  });
  res.end(text);
};

const paymentHeader = (req: IncomingMessage): string | undefined => {
  const value = req.headers["x-payment"] ?? req.headers["payment-signature"];
  return Array.isArray(value) ? value[0] : value;
};

export function demoChallenge(terms: Terms, error?: string): Record<string, unknown> {
  return {
    x402Version: terms.x402Version,
    ...(error ? { error } : {}),
    accepts: [
      {
        scheme: terms.scheme,
        network: terms.network,
        asset: terms.asset,
        payTo: terms.payTo,
        amount: terms.price6.toString(),
        maxTimeoutSeconds: DEMO_SELLER.maxTimeoutSeconds,
        resource: DEMO_SELLER.resourcePath,
        description: "A live reading of Arc testnet: latest block, its timestamp, and the gas price",
        mimeType: "application/json",
        extra: { name: terms.domain.name, version: terms.domain.version },
      },
    ],
  };
}

export function createDemoSeller(options: DemoSellerOptions) {
  const { terms, collector, read } = options;
  const now = options.now ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const nonces = new Nonces();

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...CORS, "content-length": "0" });
      return res.end();
    }
    if (req.method !== "GET") {
      return json(res, 405, { error: "this endpoint sells a reading, not a writing" });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json(res, 200, {
        seller: "Cordon demo seller",
        resource: DEMO_SELLER.resourcePath,
        price6: terms.price6,
        asset: terms.asset,
        payTo: terms.payTo,
        network: terms.network,
        scheme: terms.scheme,
        x402Version: terms.x402Version,
      });
    }

    if (url.pathname !== DEMO_SELLER.resourcePath) {
      return json(res, 404, {
        error: "no such endpoint",
        endpoints: ["GET /health", `GET ${DEMO_SELLER.resourcePath}`],
      });
    }

    let before: Snapshot;
    try {
      before = await read();
    } catch (error) {
      return json(res, 503, { error: `the chain could not be read, so there is nothing to sell: ${(error as Error).message}` });
    }

    const offer = (error?: string) => json(res, 402, demoChallenge(terms, error));

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
    nonces.forgetExpired(now());

    let collected;
    try {
      collected = await collector.collect(payment);
    } catch (error) {
      nonces.drop(payment.authorization);
      return offer(`settlement failed: ${(error as Error).message}`);
    }

    /* Read again after settlement, so the answer is the chain as of payment.
       A read that fails now still owes the payer what they paid for, and the
       reading taken a moment before is that answer rather than no answer. */
    const sold = await read().catch(() => before);

    return json(res, 200, sold, {
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
