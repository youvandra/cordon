/**
 * `getcordon.xyz/market` — five paid endpoints, on whichever chain it is started against.
 *
 * Cordon's other two sellers take money on Arc while the agent names live on
 * Sepolia, so a demo of the whole loop on one chain had nothing to buy. This
 * sells a catalogue instead of a single resource, and it is an outside seller
 * in the only sense that matters here: it knows nothing about mandates, reads
 * no registry, and answers a 402 the way any x402 seller would.
 *
 * It takes money exactly the way `attest` and the demo seller do — same
 * parser, same verification, same collector — so nothing about payment is
 * written twice. What is new is that the price comes from the item rather
 * than from the process, which is what makes a catalogue a catalogue.
 *
 * **The prices are the demonstration.** Four items sit under a typical
 * per-draw cap and one sits above it, so a refusal happens because an agent
 * asked for the expensive thing rather than because anyone staged one. See
 * `MARKET` in packages/fixtures.
 *
 * What each endpoint returns is a fixed sample, and says so in its own body.
 * The seller is the thing being demonstrated; a live upstream would add a
 * second thing that can be down on the day.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { MARKET } from "../../fixtures/src/index.ts";
import type { Collector } from "./collect.ts";
import { Nonces, parsePayment, PaymentError, verifyPayment, type Terms } from "./payment.ts";

export interface MarketOptions {
  /** Everything but the price, which each item carries. */
  terms: Omit<Terms, "price6">;
  collector: Collector;
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

type Item = (typeof MARKET.items)[number];

/** The 402 for one item. The price is the item's; everything else is the seller's. */
export function marketChallenge(terms: Omit<Terms, "price6">, item: Item, error?: string) {
  return {
    x402Version: terms.x402Version,
    ...(error ? { error } : {}),
    accepts: [
      {
        scheme: terms.scheme,
        network: terms.network,
        asset: terms.asset,
        payTo: terms.payTo,
        amount: item.price6.toString(),
        maxTimeoutSeconds: MARKET.maxTimeoutSeconds,
        resource: item.path,
        description: item.description,
        mimeType: "application/json",
        extra: { name: terms.domain.name, version: terms.domain.version },
      },
    ],
  };
}

/**
 * What an item answers with once it is paid for.
 *
 * Sample data, and each body says so in a field a reader cannot miss. A demo
 * that quietly presents invented numbers as real readings teaches the wrong
 * thing about a project whose whole argument is that figures come from
 * somewhere checkable.
 */
function body(item: Item): Record<string, unknown> {
  const sample = { sample: true, note: "Sample data. This endpoint exists to be bought from." };
  switch (item.path) {
    case "/v1/signal/btc":
      return { ...sample, asset: "BTC", horizon: "4h", direction: "long", confidence: 0.62 };
    case "/v1/sentiment/eth":
      return { ...sample, asset: "ETH", score: 0.18, scale: "-1..1", sources: ["social", "funding"] };
    case "/v1/paper/erc-8004":
      return {
        ...sample,
        title: item.title,
        findings: ["registry adoption is concentrated in a few deployers", "most agents register once and never update"],
      };
    case "/v1/filing/circle":
      return { ...sample, issuer: "Circle", period: "Q2", highlights: ["reserves disclosed monthly", "attestation cadence unchanged"] };
    case "/v1/dataset/onchain-flows":
      return { ...sample, rows: 128_000, format: "parquet", note: "Sample manifest. Priced above a per-draw cap on purpose." };
    default:
      return sample;
  }
}

export function createMarket(options: MarketOptions) {
  const { terms, collector } = options;
  const now = options.now ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const nonces = new Nonces();
  const byPath = new Map(MARKET.items.map((item) => [item.path, item]));

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...CORS, "content-length": "0" });
      return res.end();
    }
    if (req.method !== "GET") {
      return json(res, 405, { error: "this market sells readings, not writings" });
    }

    /* The catalogue is free to read. A buyer that cannot see the price list
       without paying for it is a buyer that cannot choose, and choosing is
       the part the bound is supposed to meet. */
    if (url.pathname === "/" || url.pathname === "/health") {
      return json(res, 200, {
        seller: MARKET.name,
        tagline: MARKET.tagline,
        network: terms.network,
        asset: terms.asset,
        payTo: terms.payTo,
        scheme: terms.scheme,
        x402Version: terms.x402Version,
        catalogue: MARKET.items.map((item) => ({
          path: item.path,
          title: item.title,
          price: `${(Number(item.price6) / 1e6).toFixed(2)} USDC`,
          price6: item.price6.toString(),
          description: item.description,
        })),
      });
    }

    const item = byPath.get(url.pathname as Item["path"]);
    if (!item) {
      return json(res, 404, {
        error: "no such endpoint",
        catalogue: MARKET.items.map((i) => i.path),
      });
    }

    const offer = (error?: string) => json(res, 402, marketChallenge(terms, item, error));

    const header = paymentHeader(req);
    if (!header) return offer();

    /* The item's price, joined to the seller's terms. Everything below then
       reads exactly as the single-resource sellers do. */
    const full: Terms = { ...terms, price6: item.price6 };

    let payment;
    try {
      payment = parsePayment(header);
    } catch (error) {
      if (error instanceof PaymentError) return offer(error.message);
      throw error;
    }

    const verdict = await verifyPayment(payment, full, now());
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

    return json(res, 200, body(item), {
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
