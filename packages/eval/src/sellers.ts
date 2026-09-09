/**
 * Four sellers, each answering 402 the way Circle's catalogue does and each
 * serving one fact for one price.
 *
 * Real HTTP on a real socket rather than a stubbed transport: the thing being
 * measured is whether an agent behind the fence can complete a job, and a
 * transport that never refuses a connection is not the job.
 */
import { createServer, type Server } from "node:http";
import type { Address, Hex } from "viem";
import { SOURCES, priceOf, type Source } from "./task.ts";

export interface Seller {
  source: Source;
  url: string;
  payTo: Address;
  price6: bigint;
  /** The body it serves once paid. The acceptance check compares against it. */
  body: string;
  /** How many times it was actually paid, counted by the seller itself. */
  paid: number;
}

export interface Sellers {
  list: Seller[];
  byId(id: string): Seller;
  /** Source id to the body that source serves, for `accept`. */
  served(): Map<string, string>;
  stop(): Promise<void>;
}

/* Distinct payees, because concentration is measured per counterparty and
   four facts bought from one address is a different test than four facts
   bought from four. Fixed addresses so a run is reproducible. */
const PAYEES: Address[] = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
];

export async function startSellers(opts: {
  window6: bigint;
  usdc: Hex;
  network: string;
}): Promise<Sellers> {
  const list: Seller[] = [];
  /* Per call, not per module: two runs of the same condition start their own
     sellers, and a shared array would have the second run close the first
     run's sockets. */
  const servers: Server[] = [];

  for (const [index, source] of SOURCES.entries()) {
    const payTo = PAYEES[index]!;
    const price6 = priceOf(source, opts.window6);
    const body = `${source.fact}: ${source.id}-${price6}`;
    const seller: Seller = { source, url: "", payTo, price6, body, paid: 0 };

    const server: Server = createServer((req, res) => {
      if (!req.headers["payment-signature"]) {
        res.writeHead(402, { "content-type": "application/json" });
        res.end(JSON.stringify({
          x402Version: 2,
          accepts: [{
            scheme: "exact", network: opts.network, asset: opts.usdc,
            payTo, amount: price6.toString(), maxTimeoutSeconds: 300,
          }],
        }));
        return;
      }
      seller.paid += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ fact: body }));
    });

    await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
    const port = (server.address() as { port: number }).port;
    seller.url = `http://127.0.0.1:${port}/${source.id}`;
    list.push(seller);
    servers.push(server);
  }

  return {
    list,
    byId(id) {
      const found = list.find((s) => s.source.id === id);
      if (!found) throw new Error(`no seller for ${id}`);
      return found;
    },
    served() {
      return new Map(list.map((s) => [s.source.id, s.body]));
    },
    async stop() {
      for (const server of servers.splice(0)) {
        await new Promise<void>((done) => server.close(() => done()));
      }
    },
  };
}
