/**
 * The proxy surface, tested against what it is supposed to prevent.
 *
 * Every test here is named after the thing that would be wrong if it failed,
 * because the failures worth catching in a surface like this are the quiet
 * ones: a payment header forwarded from the program, a recipient the agent got
 * to choose, a refusal rendered as an empty success, a CONNECT tunnelled into
 * ciphertext nobody can read.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest, type Server } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { connect as tlsConnect } from "node:tls";
import type { AddressInfo } from "node:net";
import { createEphemeralCa, type CertAuthority } from "../src/ca.ts";
import { httpDaemon, type DaemonClient, type FetchResult } from "../src/client.ts";
import { createProxy } from "../src/proxy.ts";

const NODE = `0x${"11".repeat(32)}`;
const SELLER = "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57";
/** $0.0024 — the AIsa scholar endpoint from Circle's live catalogue. */
const PRICE = 2_400n;

interface Seen {
  node: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** A daemon that records what it was asked and answers what the test wants. */
function fakeDaemon(answer: (seen: Seen) => FetchResult): DaemonClient & { seen: Seen[] } {
  const seen: Seen[] = [];
  return {
    seen,
    async fetch(request) {
      seen.push(request as Seen);
      /* The daemon answers over JSON, so a bigint arrives as a string. The
         proxy must not depend on having had the in-process value. */
      return JSON.parse(
        JSON.stringify(answer(request as Seen), (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
      ) as FetchResult;
    },
  };
}

const paid = (): FetchResult => ({
  paid: true,
  status: 200,
  headers: { "content-type": "application/json" },
  body: { citations: 3 },
  draw: { released: true, reason: "none", txHash: `0x${"ab".repeat(32)}` },
  offer: {
    scheme: "exact",
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: SELLER,
    amount: PRICE,
  },
});

const refused = (): FetchResult => ({
  paid: false,
  free: false,
  refusal: {
    released: false,
    reason: "window-budget",
    breachedAt: `0x${"22".repeat(32)}`,
    refusalId: 7n,
    txHash: `0x${"cd".repeat(32)}`,
  },
  offer: {
    scheme: "exact",
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: SELLER,
    amount: PRICE,
  },
});

const free = (): FetchResult => ({
  paid: false,
  free: true,
  status: 200,
  headers: { "content-type": "text/plain" },
  body: "no charge",
});

/** Speak proxy: an absolute-form request line, the way every HTTP client does
 *  when HTTP_PROXY is set. */
function throughProxy(
  port: number,
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method: options.method ?? "GET", path: url, headers: options.headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string>,
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const portOf = (server: Server | ReturnType<typeof createTlsServer>) =>
  (server.address() as AddressInfo).port;

const listen = (server: Server | ReturnType<typeof createTlsServer>) =>
  new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

const close = (server: Server | ReturnType<typeof createTlsServer>) =>
  new Promise<void>((resolve) => {
    /* Node keeps client sockets alive by default, and `close` waits for every
       one of them. Without this the suite passes and then hangs, which reads
       as a failure somewhere else entirely. */
    server.closeAllConnections();
    server.close(() => resolve());
  });

let ca: CertAuthority;

before(() => {
  ca = createEphemeralCa();
});

after(() => {
  ca.destroy();
});

test("an unmodified program buys through one environment variable, and never sees a key", async (t) => {
  const daemon = fakeDaemon(paid);
  const proxy = createProxy({ node: NODE, daemon });
  await listen(proxy);
  t.after(() => close(proxy));

  const response = await throughProxy(portOf(proxy), "http://seller.example/apis/v2/scholar");

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { citations: 3 });
  assert.equal(daemon.seen[0]!.url, "http://seller.example/apis/v2/scholar");
  assert.equal(daemon.seen[0]!.node, NODE);
  /* What the proxy sends is a node and a URL. There is no field here in which
     a recipient or an amount could be named, which is the same fence the MCP
     tool list is. */
  assert.deepEqual(Object.keys(daemon.seen[0]!).sort(), ["body", "headers", "method", "node", "url"]);
  assert.equal(response.headers["cordon-paid"], String(PRICE));

});

test("a refusal arrives as 402 naming the bound and the transaction, not as an empty success", async (t) => {
  const daemon = fakeDaemon(refused);
  const proxy = createProxy({ node: NODE, daemon });
  await listen(proxy);
  t.after(() => close(proxy));

  const response = await throughProxy(portOf(proxy), "http://seller.example/apis/v2/scholar");

  assert.equal(response.status, 402, "a refusal is payment-required, which is what happened");
  assert.equal(response.headers["cordon-refusal"], "window-budget");
  assert.equal(response.headers["cordon-breached-at"], `0x${"22".repeat(32)}`);
  const body = JSON.parse(response.body);
  assert.equal(body.cordon, "refused");
  assert.equal(body.transaction, `0x${"cd".repeat(32)}`);
  assert.equal(body.refusalId, "7");

});

test("a free URL is passed through and never reaches the tree", async (t) => {
  const daemon = fakeDaemon(free);
  const proxy = createProxy({ node: NODE, daemon });
  await listen(proxy);
  t.after(() => close(proxy));

  const response = await throughProxy(portOf(proxy), "http://docs.example/readme");

  assert.equal(response.status, 200);
  assert.equal(response.body, "no charge");
  assert.equal(response.headers["cordon-paid"], undefined, "nothing was bought, so nothing is claimed");

});

test("a payment header supplied by the program is never forwarded", async (t) => {
  const daemon = fakeDaemon(paid);
  const proxy = createProxy({ node: NODE, daemon });
  await listen(proxy);
  t.after(() => close(proxy));

  await throughProxy(portOf(proxy), "http://seller.example/apis/v2/scholar", {
    headers: {
      "PAYMENT-SIGNATURE": "0xforged",
      "X-PAYMENT": "0xalso-forged",
      authorization: "Bearer the-seller-api-key",
    },
  });

  const headers = daemon.seen[0]!.headers;
  assert.equal(headers["payment-signature"], undefined, "only the daemon writes a payment header");
  assert.equal(headers["x-payment"], undefined);
  assert.equal(
    headers.authorization,
    "Bearer the-seller-api-key",
    "an API key is the program's own business and travels untouched",
  );
  assert.equal(headers["proxy-connection"], undefined, "hop-by-hop headers stop here");

});

test("a request body reaches the seller, so a paid POST endpoint works", async (t) => {
  const daemon = fakeDaemon(paid);
  const proxy = createProxy({ node: NODE, daemon });
  await listen(proxy);
  t.after(() => close(proxy));

  await throughProxy(portOf(proxy), "http://seller.example/api/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: SELLER }),
  });

  assert.equal(daemon.seen[0]!.method, "POST");
  assert.deepEqual(JSON.parse(daemon.seen[0]!.body!), { address: SELLER });

});

test("a body past the limit is refused rather than buffered", async (t) => {
  const daemon = fakeDaemon(paid);
  const proxy = createProxy({ node: NODE, daemon, maxBodyBytes: 64 });
  await listen(proxy);
  t.after(() => close(proxy));

  const response = await throughProxy(portOf(proxy), "http://seller.example/api/enrich", {
    method: "POST",
    body: "x".repeat(4096),
  });

  assert.equal(response.status, 500);
  assert.match(JSON.parse(response.body).error, /too large/);
  assert.equal(daemon.seen.length, 0, "nothing was asked of the daemon, so nothing could be paid");

});

test("with no daemon behind it the proxy fails to buy, and says so, rather than passing the request on", async (t) => {
  /* Port 1 is not a daemon. The failure that matters is the one where a proxy
     cannot reach the gate and helpfully forwards the request anyway. */
  const proxy = createProxy({ node: NODE, daemon: httpDaemon("http://127.0.0.1:1") });
  await listen(proxy);
  t.after(() => close(proxy));

  const response = await throughProxy(portOf(proxy), "http://seller.example/apis/v2/scholar");

  assert.equal(response.status, 502);
  assert.match(JSON.parse(response.body).error, /no cordon daemon/);

});

test("a CONNECT is refused, not tunnelled, when the proxy cannot read what is inside it", async (t) => {
  const daemon = fakeDaemon(paid);
  const proxy = createProxy({ node: NODE, daemon });
  await listen(proxy);
  t.after(() => close(proxy));

  /* Node hands a CONNECT answer to `connect` whatever the status is, so the
     status is the thing to read. A client that ignores it — and none do — gets
     a socket that is already closed rather than a tunnel. */
  const answer = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port: portOf(proxy), method: "CONNECT", path: "seller.example:443" });
    req.on("connect", (res, socket, head) => {
      let body = head.toString("utf8");
      socket.setEncoding("utf8");
      socket.on("data", (c: string) => (body += c));
      socket.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      socket.on("close", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });

  assert.equal(answer.status, 502, "not a tunnel: the proxy cannot read a 402 it cannot decrypt");
  assert.match(answer.body, /certificate authority/);
  assert.equal(daemon.seen.length, 0);
});

test("https is terminated with the run's own authority, so the seller's 402 can be read", async (t) => {
  const daemon = fakeDaemon(paid);
  const proxy = createProxy({ node: NODE, daemon, ca });
  await listen(proxy);
  t.after(() => close(proxy));

  /* A real TLS client, with a real handshake, trusting the CA this run made
     and nothing else — which is exactly the position `cordon run` puts a child
     process in. */
  const body = await new Promise<string>((resolve, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port: portOf(proxy),
      method: "CONNECT",
      path: "seller.example:443",
    });
    req.on("connect", (_res, socket) => {
      const secure = tlsConnect(
        { socket, servername: "seller.example", ca: readFileSync(ca.certPath) },
        () => {
          secure.write(
            "GET /apis/v2/scholar HTTP/1.1\r\nHost: seller.example\r\nConnection: close\r\n\r\n",
          );
        },
      );
      let text = "";
      secure.setEncoding("utf8");
      secure.on("data", (c: string) => (text += c));
      secure.on("end", () => resolve(text));
      secure.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });

  assert.match(body, /^HTTP\/1\.1 200/);
  assert.match(body, /"citations":3/);
  assert.equal(
    daemon.seen[0]!.url,
    "https://seller.example/apis/v2/scholar",
    "the daemon fetches the real https URL; the proxy only read the request",
  );

});

test("the authority is trusted by nobody: a client with the system store rejects it", async (t) => {
  const seller = createTlsServer(ca.contextFor("localhost"), (_req, res) => res.end("ok"));
  await listen(seller);
  t.after(() => close(seller));

  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        const socket = tlsConnect({ host: "127.0.0.1", port: portOf(seller), servername: "localhost" }, () =>
          resolve(undefined),
        );
        socket.on("error", reject);
      }),
    /self-signed|unable to verify|UNABLE_TO_VERIFY|SELF_SIGNED/i,
    "an ephemeral CA nobody installed is trusted by nobody",
  );

});

test("the authority disappears with the run that made it", () => {
  const temporary = createEphemeralCa();
  assert.ok(existsSync(temporary.certPath));
  temporary.destroy();
  assert.equal(existsSync(temporary.certPath), false, "a key that outlives its run is a key someone can use");
});

test("a hostname that is not one never reaches openssl", () => {
  assert.throws(() => ca.contextFor("seller.example/../../etc/passwd"), /not a hostname/);
  assert.throws(() => ca.contextFor("-out"), /not a hostname/);
});

test("a request without an absolute URL is answered, not proxied to somewhere invented", async (t) => {
  const daemon = fakeDaemon(paid);
  const proxy = createProxy({ node: NODE, daemon });
  await listen(proxy);
  t.after(() => close(proxy));

  const response = await throughProxy(portOf(proxy), "/relative/path");

  assert.equal(response.status, 400);
  assert.equal(daemon.seen.length, 0);

});
