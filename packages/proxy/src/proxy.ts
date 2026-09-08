/**
 * The proxy surface: one environment variable, no code change.
 *
 * An agent runtime whose source we cannot touch still makes HTTP requests, and
 * `HTTP_PROXY` is the one seam every HTTP client in every language already
 * has. The program runs unmodified; its requests arrive here; anything that
 * answers `402` is paid for by the daemon, inside the bound, or is not paid
 * for at all.
 *
 * Be exact about what this surface does and does not do, because the
 * difference is the difference between a control and a convenience:
 *
 * - The proxy does **not** create the bound. The bound is the contract, and
 *   the reason the agent cannot step around it is that it holds no key. A
 *   program that ignores `HTTP_PROXY` entirely still cannot pay anyone.
 * - What the proxy adds is the ability to *succeed* inside the bound. Without
 *   it, an unmodified program meets a `402` it can do nothing with.
 *
 * So a request that never reaches this process is a request that fails, not a
 * request that escapes. That is the direction this has to fail in, and it is
 * why nothing here is described as enforcement.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { createServer as createTlsServer, type TLSSocket } from "node:tls";
import type { CertAuthority } from "./ca.ts";
import { DaemonUnreachable, type DaemonClient, type FetchResult } from "./client.ts";

export interface ProxyDeps {
  /** The mandate node this proxy acts for. One proxy, one node. */
  node: string;
  daemon: DaemonClient;
  /** Absent means plaintext only: a CONNECT is refused, never tunnelled. */
  ca?: CertAuthority;
  /** Bodies larger than this are refused rather than buffered. */
  maxBodyBytes?: number;
}

/* Hop-by-hop headers belong to one connection and must not be forwarded.
   `proxy-connection` is not in the RFC but is real and in the wild. */
const HOP_BY_HOP = new Set([
  "connection", "proxy-connection", "keep-alive", "transfer-encoding",
  "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate",
]);

/* The payment header is the daemon's to write, and only the daemon holds a key
   to write one with. Forwarding a client-supplied one would let a program
   above the proxy present a payment nothing authorised — it would not work,
   because it could not be signed, but the fence should not depend on that. */
const NEVER_FORWARDED = new Set(["host", "payment-signature", "x-payment"]);

function requestHeaders(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.has(key) || NEVER_FORWARDED.has(key)) continue;
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

/* Content-length and content-encoding describe the body the daemon already
   received and decoded. Passing the seller's originals on beside a body we
   re-serialised is how a proxy produces a response that cannot be read. */
function responseHeaders(from: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(from ?? {})) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (key === "content-length" || key === "content-encoding") continue;
    out[key] = value;
  }
  return out;
}

/* The daemon returns a parsed body, so a JSON response is re-serialised here
   and comes back compact rather than byte-identical to the seller's. Nothing
   reads a price off whitespace, and the alternative — a second body format
   carried through the daemon for the proxy's benefit alone — is a worse trade
   than this sentence. */
function bodyBytes(body: unknown, headers: Record<string, string>): Buffer {
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (!headers["content-type"]) headers["content-type"] = "application/json";
  return Buffer.from(JSON.stringify(body ?? null), "utf8");
}

async function readBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("request body is too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString("utf8");
}

function fail(res: ServerResponse, status: number, error: string, extra: object = {}): void {
  const payload = Buffer.from(JSON.stringify({ error, ...extra }, null, 2), "utf8");
  res.writeHead(status, { "content-type": "application/json", "content-length": payload.length });
  res.end(payload);
}

/**
 * Render a daemon answer as an HTTP response.
 *
 * A refusal comes back as **402**, not as an error and not as an empty 200.
 * The seller did ask to be paid and nobody paid, so 402 is the literal truth
 * of what happened; a program that handles payment-required at all handles
 * this without knowing Cordon exists. The refusal itself — which bound, which
 * node, which transaction — travels in the body and in headers, because the
 * record is the product and a refusal nobody can read is not one.
 */
export function render(result: FetchResult, res: ServerResponse): void {
  if (!result.paid && !result.free) {
    const { refusal, offer } = result;
    const payload = Buffer.from(
      JSON.stringify(
        {
          cordon: "refused",
          reason: refusal.reason,
          breachedAt: refusal.breachedAt,
          refusalId: refusal.refusalId,
          transaction: refusal.txHash,
          seller: { payTo: offer.payTo, amount: offer.amount, network: offer.network },
        },
        null,
        2,
      ),
      "utf8",
    );
    const headers: Record<string, string | number> = {
      "content-type": "application/json",
      "content-length": payload.length,
      "cordon-refusal": refusal.reason,
    };
    if (refusal.breachedAt) headers["cordon-breached-at"] = refusal.breachedAt;
    if (refusal.txHash) headers["cordon-transaction"] = refusal.txHash;
    res.writeHead(402, headers);
    res.end(payload);
    return;
  }

  const headers = responseHeaders(result.headers);
  const payload = bodyBytes(result.body, headers);
  headers["content-length"] = String(payload.length);
  if (result.paid) {
    headers["cordon-paid"] = String(result.offer.amount);
    if (result.draw.txHash) headers["cordon-transaction"] = result.draw.txHash;
  }
  res.writeHead(result.status, headers);
  res.end(payload);
}

export function createProxy(deps: ProxyDeps): Server {
  const limit = deps.maxBodyBytes ?? 1_000_000;

  const handle = async (origin: string, req: IncomingMessage, res: ServerResponse) => {
    try {
      /* A proxy is given an absolute URL; a TLS-terminated request arrives in
         origin form and the origin comes from the CONNECT that preceded it. */
      const target = origin ? `${origin}${req.url ?? "/"}` : (req.url ?? "");
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        return fail(res, 400, "this is a proxy: requests must carry an absolute URL", {
          hint: "export HTTP_PROXY=http://127.0.0.1:<port> and let the client form the request",
        });
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return fail(res, 400, `cordon does not proxy ${url.protocol}`);
      }

      const body = await readBody(req, limit);
      const result = await deps.daemon.fetch({
        node: deps.node,
        url: url.toString(),
        method: req.method ?? "GET",
        headers: requestHeaders(req),
        body,
      });
      render(result, res);
    } catch (error) {
      if (error instanceof DaemonUnreachable) {
        /* 502 is the truth: the proxy is fine, the thing behind it is not.
           Nothing was paid, so this is a failure to buy, not a loss. */
        return fail(res, 502, (error as Error).message);
      }
      return fail(res, 500, (error as Error).message);
    }
  };

  const server = createServer((req, res) => void handle("", req, res));

  server.on("connect", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    /* `host:port`. The port stays in the authority and rides through to the
       URL the daemon fetches; only the name is needed for a certificate. */
    const authority = req.url ?? "";
    const hostname = authority.split(":")[0] ?? "";

    if (!deps.ca) {
      /* Refuse rather than tunnel. A tunnel would carry ciphertext the proxy
         cannot read, so the seller's 402 would reach a program with no key and
         no way to pay it — a silent dead end dressed as a working connection.
         Say so on the wire instead. */
      socket.end(
        "HTTP/1.1 502 Bad Gateway\r\ncontent-type: text/plain\r\n\r\n" +
          "cordon proxy has no certificate authority, so it cannot read a 402 " +
          "inside TLS. Start it through `cordon run`, which makes one for the " +
          "child process and nothing else.\r\n",
      );
      return;
    }

    let context;
    try {
      context = deps.ca.contextFor(hostname);
    } catch (error) {
      socket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${(error as Error).message}\r\n`);
      return;
    }

    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

    const tls = createTlsServer(context);
    tls.on("secureConnection", (tlsSocket: TLSSocket) => {
      const inner = createServer((req2, res2) => void handle(`https://${authority}`, req2, res2));
      inner.emit("connection", tlsSocket);
    });
    /* Whatever the client already sent after CONNECT is the start of the
       handshake, and dropping it hangs the connection for the handshake
       timeout with no error anyone can read. */
    if (head?.length) socket.unshift(head);
    tls.emit("connection", socket);

    socket.on("error", () => socket.destroy());
  });

  return server;
}
