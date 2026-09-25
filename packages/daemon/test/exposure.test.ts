/**
 * The daemon is the only process here that can spend, and it was the only one
 * of the three that did not bind loopback.
 *
 * `attest` binds `127.0.0.1` and says why in a comment: a default of 0.0.0.0
 * puts a key-holding process on the public internet the moment the box has an
 * open port. `meter` takes a `bind` argument. The daemon called
 * `server.listen(port)` with no host — which is 0.0.0.0 — and answered
 * `/fetch`, `/spawn` and `/status` to anyone who could route to it, with no
 * token, no allowlist and no origin check.
 *
 * These tests are the fence, not a description of it: they run the real server
 * and the real config loader.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createDaemon } from "../src/server.ts";
import { load } from "../src/config.ts";
import type { Gate } from "../src/gate.ts";

const NODE = `0x${"08".repeat(32)}` as `0x${string}`;
const ADDRESS = `0x${"11".repeat(20)}`;

/* Enough of a gate for /status to answer. Nothing here is reached unless the
   request gets past the token, which is the point. */
const gate = {
  nodes: () => [NODE],
  headroom: async () => ({ available6: 0n, boundBy: NODE }),
  mandate: async () => ({ operator: ADDRESS }),
} as unknown as Gate;

async function serve(token?: string) {
  const server = createDaemon({ gate, token } as Parameters<typeof createDaemon>[0]);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  return {
    port,
    get: (headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}/status`, { headers }),
    post: (path: string, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: "{}",
      }),
    stop: () => new Promise((r) => server.close(r)),
  };
}

const env = (over: Record<string, string> = {}) => ({
  CORDON_VAULT: ADDRESS,
  CORDON_REGISTRY: ADDRESS,
  CORDON_NODE_A: NODE,
  CORDON_KEY_A: "0x01",
  ...over,
});

/* ── where it listens ───────────────────────────────────────────────────── */

test("the daemon stays on this machine unless it is told otherwise", () => {
  assert.equal(load(env()).bind, "127.0.0.1");
});

/**
 * The regression, stated as the thing that was true before: `listen(port)`
 * with no host binds 0.0.0.0. Asserting the default is loopback is asserting
 * that the daemon no longer does that.
 */
test("a bind that leaves this machine is refused unless a token comes with it", () => {
  assert.throws(() => load(env({ CORDON_BIND: "0.0.0.0" })), /CORDON_TOKEN is not set/);
  assert.throws(() => load(env({ CORDON_BIND: "::" })), /CORDON_TOKEN is not set/);
  assert.throws(() => load(env({ CORDON_BIND: "10.0.0.5" })), /CORDON_TOKEN is not set/);
});

test("the same bind is allowed once there is something to authenticate with", () => {
  const config = load(env({ CORDON_BIND: "0.0.0.0", CORDON_TOKEN: "s3cret" }));
  assert.equal(config.bind, "0.0.0.0");
  assert.equal(config.token, "s3cret");
});

test("loopback in its other spellings is still loopback, and needs no token", () => {
  for (const bind of ["127.0.0.1", "127.0.0.53", "localhost", "::1", "[::1]"]) {
    assert.equal(load(env({ CORDON_BIND: bind })).bind, bind);
  }
});

/* An empty string is not a token. Left alone it would satisfy a truthiness
   check and open the interface with nothing behind it. */
test("an empty token is no token", () => {
  assert.throws(() => load(env({ CORDON_BIND: "0.0.0.0", CORDON_TOKEN: "" })), /CORDON_TOKEN is not set/);
});

/* ── what it answers ────────────────────────────────────────────────────── */

test("with no token configured the endpoints answer, which is the loopback case", async () => {
  const server = await serve();
  try {
    assert.equal((await server.get()).status, 200);
  } finally {
    await server.stop();
  }
});

test("with a token configured, a request without one is refused before anything is read", async () => {
  const server = await serve("s3cret");
  try {
    for (const response of [
      await server.get(),
      await server.post("/fetch"),
      await server.post("/spawn"),
    ]) {
      assert.equal(response.status, 401);
    }
  } finally {
    await server.stop();
  }
});

test("a wrong token is refused, and so is the right one offered the wrong way", async () => {
  const server = await serve("s3cret");
  try {
    assert.equal((await server.get({ authorization: "Bearer wrong" })).status, 401);
    assert.equal((await server.get({ authorization: "s3cret" })).status, 401);
    assert.equal((await server.get({ authorization: "Basic s3cret" })).status, 401);
    /* A prefix of the token must not pass. A comparison that stopped at the
       first difference would also leak how far a guess got. */
    assert.equal((await server.get({ authorization: "Bearer s3c" })).status, 401);
    assert.equal((await server.get({ authorization: "Bearer s3cretX" })).status, 401);
  } finally {
    await server.stop();
  }
});

test("the right token is let through", async () => {
  const server = await serve("s3cret");
  try {
    assert.equal((await server.get({ authorization: "Bearer s3cret" })).status, 200);
  } finally {
    await server.stop();
  }
});
