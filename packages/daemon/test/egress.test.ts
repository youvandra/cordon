/**
 * The network half of the fence.
 *
 * The tool list is the argument: there is `cordon_fetch` and there is no
 * `cordon_transfer(to, amount)`, so an agent cannot express "send money to X".
 * That claim is about money and it holds. It was doing duty for a second claim
 * nobody had made good on — `cordon_fetch` takes a method and a body, so it is
 * a general HTTP client, and the daemon sits on a box beside a meter and an
 * attest endpoint that listen on loopback *because they trust loopback*.
 *
 * Each test is named after the address an agent would have reached.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { assertPublicUrl, EgressError, isPrivateAddress } from "../src/egress.ts";
import { createHttpTransport, type Transport } from "../src/fetch.ts";

/** DNS, without DNS. Every test says what the name answers with. */
const answers = (...addresses: string[]) => async () => addresses;

test("a name that resolves to loopback reaches neither the meter nor the attest endpoint", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://seller.example/x", { resolve: answers("127.0.0.1") }),
    (error: Error) => {
      assert.ok(error instanceof EgressError);
      assert.match(error.message, /127\.0\.0\.1/);
      assert.match(error.message, /loopback/);
      return true;
    },
  );
});

test("the cloud metadata address is not somewhere an agent may point this", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://169.254.169.254/latest/meta-data/iam/security-credentials/"),
    EgressError,
  );
});

test("a private network address is refused whether it is named or written out", async () => {
  for (const address of ["10.0.0.5", "172.16.9.1", "192.168.1.1", "100.64.0.1"]) {
    await assert.rejects(() => assertPublicUrl(`http://${address}/x`), EgressError, address);
  }
  await assert.rejects(
    () => assertPublicUrl("https://inside.example/x", { resolve: answers("10.1.2.3") }),
    EgressError,
  );
});

test("loopback wearing a v6 hat is still loopback", () => {
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true, "the first thing anybody tries");
  assert.equal(isPrivateAddress("fd00::1"), true);
  assert.equal(isPrivateAddress("fe80::1"), true);
  assert.equal(isPrivateAddress("2606:4700::1111"), false);
});

test("a name with one public answer and one loopback answer is refused for the loopback one", async () => {
  await assert.rejects(
    () => assertPublicUrl("http://both.example/x", { resolve: answers("93.184.216.34", "127.0.0.1") }),
    (error: Error) => {
      assert.match(error.message, /127\.0\.0\.1/, "every address, not the first one that looks fine");
      return true;
    },
  );
});

test("a scheme that is not http is not a purchase", async () => {
  await assert.rejects(() => assertPublicUrl("file:///etc/passwd"), EgressError);
  await assert.rejects(() => assertPublicUrl("gopher://example.com/"), EgressError);
});

test("an ordinary public URL is left alone", async () => {
  const url = await assertPublicUrl("https://seller.example/x", { resolve: answers("93.184.216.34") });
  assert.equal(url.origin, "https://seller.example");
});

/* ------------------------------------------------------------------ */
/* Redirects, which are the seller choosing the next URL               */
/* ------------------------------------------------------------------ */

/**
 * A test server is on loopback, which the guard refuses — correctly, and that
 * is the point of the tests above. To exercise what happens on the *second*
 * hop, the guard here is the real one with the test's own two origins let
 * through. Everything else still goes through `assertPublicUrl` untouched, so
 * a redirect to a metadata address is refused by the code that ships.
 */
function transportAllowing(...origins: string[]): Transport {
  const allowed = new Set(origins);
  return createHttpTransport({
    assert: async (raw, options) => {
      const url = new URL(raw);
      if (allowed.has(url.origin)) return url;
      return assertPublicUrl(raw, options);
    },
  });
}

function serverThat(handler: (path: string) => { status: number; location?: string }): Promise<{ server: Server; url: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const answer = handler(req.url ?? "/");
      if (answer.location) {
        res.writeHead(answer.status, { location: answer.location });
        return res.end();
      }
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ answer: "arrived", saw: req.headers["payment-signature"] ?? null }));
    });
    server.listen(0, "127.0.0.1", () =>
      done({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` }),
    );
  });
}

const close = (server: Server) => new Promise<void>((done) => server.close(() => done()));

test("a seller cannot redirect a paid request to an origin it was not priced against", async () => {
  const elsewhere = await serverThat(() => ({ status: 200 }));
  const seller = await serverThat((path) =>
    path === "/start" ? { status: 302, location: `${elsewhere.url}/collect` } : { status: 200 },
  );
  try {
    const transport = transportAllowing(seller.url, elsewhere.url);

    /* Unpaid, the redirect is followed: a seller moving its own resource is
       ordinary, and the guard has already passed both hops. */
    const free = await transport(`${seller.url}/start`, { method: "GET", headers: {} });
    assert.equal(free.status, 200, "an ordinary redirect is still a redirect");

    /* Paid, it is not. The header is an EIP-3009 authorisation the holder
       submits — `fetch` strips `Authorization` across an origin and leaves
       custom headers alone, so this is the hop that would have carried it. */
    await assert.rejects(
      () =>
        transport(`${seller.url}/start`, {
          method: "GET",
          headers: { "PAYMENT-SIGNATURE": "an-authorisation-the-holder-submits" },
        }),
      (error: Error) => {
        assert.ok(error instanceof EgressError);
        assert.match(error.message, /priced against/);
        return true;
      },
    );

    const seen = (await (await fetch(`${elsewhere.url}/collect`)).json()) as { saw: string | null };
    assert.equal(seen.saw, null, "and the second host never saw a signature");
  } finally {
    await close(seller.server);
    await close(elsewhere.server);
  }
});

test("a redirect into this machine is refused the same way a direct one is", async () => {
  const seller = await serverThat((path) =>
    path === "/start" ? { status: 302, location: "http://169.254.169.254/latest/meta-data/" } : { status: 200 },
  );
  try {
    /* Only the seller is let through, so the hop is checked by the real guard. */
    await assert.rejects(
      () => transportAllowing(seller.url)(`${seller.url}/start`, { method: "GET", headers: {} }),
      (error: Error) => {
        assert.ok(error instanceof EgressError);
        assert.match(error.message, /169\.254\.169\.254/);
        return true;
      },
    );
  } finally {
    await close(seller.server);
  }
});

test("a seller that redirects forever is stopped rather than followed", async () => {
  const seller = await serverThat(() => ({ status: 302, location: "/start" }));
  try {
    await assert.rejects(
      () => transportAllowing(seller.url)(`${seller.url}/start`, { method: "GET", headers: {} }),
      (error: Error) => {
        assert.match(error.message, /redirected more than/);
        return true;
      },
    );
  } finally {
    await close(seller.server);
  }
});
