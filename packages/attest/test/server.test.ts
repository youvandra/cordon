/**
 * The endpoint, end to end, with the settlement stubbed and nothing else.
 *
 * The stub is the chain, not the check: every payment in here is really
 * signed and really recovered, and the collector stands in only for the
 * transaction that would take the money. `collect.test.ts` runs that part
 * against a real token on a real chain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { ATTEST } from "../../fixtures/src/index.ts";
import { emptyLedger, reduce, type Event, type Ledger } from "../../meter/src/index.ts";
import { parseChallenge, selectOffer } from "../../daemon/src/challenge.ts";
import { createAttestApi } from "../src/server.ts";
import { Eip3009Collector } from "../src/collect.ts";
import { parsePayment as parsePaymentHeader } from "../src/payment.ts";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, type Authorization, type Terms } from "../src/payment.ts";
import type { Collection, Collector } from "../src/collect.ts";
import type { Payment } from "../src/payment.ts";

const PAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const payer = privateKeyToAccount(PAYER_KEY);

const ASSET = "0x3600000000000000000000000000000000000000" as Address;
const PAYTO = "0xc0d000000000000000000000000000000000c0d0" as Address;
const CHAIN = 5042002;
const NOW = 1_800_000_000n;

const ROOT = `0x${"a1".repeat(32)}` as Hex;
const CHILD = `0x${"b2".repeat(32)}` as Hex;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const OP_ROOT = "0x2222222222222222222222222222222222222222" as Address;
const OP_CHILD = "0x3333333333333333333333333333333333333333" as Address;
const AISA = "0x5555555555555555555555555555555555555555" as Address;

const terms: Terms = {
  network: `eip155:${CHAIN}`,
  asset: ASSET,
  payTo: PAYTO,
  price6: ATTEST.price6,
  scheme: ATTEST.scheme,
  minLeadSeconds: ATTEST.minLeadSeconds,
  x402Version: ATTEST.x402Version,
  domain: { name: "USD Coin", version: "2", chainId: CHAIN, verifyingContract: ASSET },
};

const sources = {
  vault: "0x4c9a1f7b3d0e6852af14c7d95b3e08a6127df4b0",
  registry: "0x0000000000000000000000000000000000000abc",
  explorer: "https://testnet.arcscan.app",
};

let block = 1n;
let index = 0;
function at<T extends object>(fields: T) {
  const site = {
    blockNumber: block,
    transactionHash: `0x${block.toString(16).padStart(64, "0")}` as Hex,
    logIndex: index++,
  };
  block += 1n;
  index = 0;
  return { ...fields, ...site };
}

/** A tree where the child holds identity 7, drew twice and was refused once. */
function ledger(): Ledger {
  block = 1n;
  const events: Event[] = [
    at({ kind: "MandateOpened", node: ROOT, owner: OWNER, operator: OP_ROOT, budget6: 100_000_000n, lifetimeCap6: 250_000_000n, windowSeconds: 86_400, maxDepth: 3 } as const),
    at({ kind: "MandateSpawned", node: CHILD, parent: ROOT, operator: OP_CHILD, budget6: 60_000_000n, lifetimeCap6: 150_000_000n, depth: 1 } as const),
    at({ kind: "Bound", node: CHILD, agentId: 7n, operator: OP_CHILD } as const),
    /* A draw emits one ancestor debit per node on the path, the drawing node
       included. Written without them, a ledger says an agent drew twice and
       has spent nothing, which is the shape of every indexer bug worth
       catching. */
    at({ kind: "Drawn", node: CHILD, counterparty: AISA, beneficiary: OP_CHILD, amount6: 2_400n, root: ROOT } as const),
    at({ kind: "AncestorDebited", node: CHILD, ancestor: CHILD, amount6: 2_400n, spent6: 2_400n, budget6: 60_000_000n } as const),
    at({ kind: "AncestorDebited", node: CHILD, ancestor: ROOT, amount6: 2_400n, spent6: 2_400n, budget6: 100_000_000n } as const),
    at({ kind: "Drawn", node: CHILD, counterparty: AISA, beneficiary: OP_CHILD, amount6: 2_400n, root: ROOT } as const),
    at({ kind: "AncestorDebited", node: CHILD, ancestor: CHILD, amount6: 2_400n, spent6: 4_800n, budget6: 60_000_000n } as const),
    at({ kind: "AncestorDebited", node: CHILD, ancestor: ROOT, amount6: 2_400n, spent6: 4_800n, budget6: 100_000_000n } as const),
    at({ kind: "Refused", refusalId: 1n, node: CHILD, breachedAt: ROOT, counterparty: AISA, amount6: 5_000_001n, reason: "tranche-cap" } as const),
  ];
  return reduce(emptyLedger(CHAIN), events);
}

class StubCollector implements Collector {
  calls = 0;
  fail: string | null = null;

  async collect(payment: Payment): Promise<Collection> {
    this.calls++;
    if (this.fail) throw new Error(this.fail);
    return {
      txHash: `0x${"fe".repeat(32)}` as Hex,
      payer: payment.authorization.from,
      amount6: payment.authorization.value,
    };
  }
}

/* `response.json()` is `unknown`, which is right. A test asserts on shapes,
   so it says so once here rather than casting in every line. */
const bodyOf = (response: Response): Promise<any> => response.json();

async function serve(collector: Collector, current: () => Ledger = ledger) {
  const server = createAttestApi({ current, terms, collector, sources, now: () => NOW });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((done) => server.close(() => done())),
  };
}

async function payment(overrides: Partial<Authorization> = {}): Promise<string> {
  const auth: Authorization = {
    from: payer.address,
    to: PAYTO,
    value: ATTEST.price6,
    validAfter: NOW - 10n,
    validBefore: NOW + 300n,
    nonce: `0x${"7f".repeat(32)}` as Hex,
    ...overrides,
  };
  const signature = await payer.signTypedData({
    domain: terms.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: auth,
  });
  return Buffer.from(
    JSON.stringify({
      x402Version: ATTEST.x402Version,
      scheme: terms.scheme,
      network: terms.network,
      asset: terms.asset,
      payload: {
        signature,
        authorization: {
          from: auth.from,
          to: auth.to,
          value: auth.value.toString(),
          validAfter: auth.validAfter.toString(),
          validBefore: auth.validBefore.toString(),
          nonce: auth.nonce,
        },
      },
    }),
  ).toString("base64");
}

test("the 402 is one the project's own daemon can read and pay", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const response = await fetch(`${url}/attest/7`);
    assert.equal(response.status, 402);

    /* Parsed by the buying side of this repository, not by a copy of it. Two
       dialects of the same challenge is exactly the drift this catches. */
    const challenge = parseChallenge(402, await bodyOf(response));
    assert.ok(challenge);
    const offer = selectOffer(challenge!, { networks: [terms.network], assets: [ASSET] });
    assert.equal(offer.payTo, PAYTO);
    assert.equal(offer.amount, ATTEST.price6);
    assert.equal(collector.calls, 0, "nothing was collected for a 402");
  } finally {
    await stop();
  }
});

test("an identity this range does not contain costs nothing to ask about", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const response = await fetch(`${url}/attest/999`);
    assert.equal(response.status, 404, "a payer must never buy an empty answer");
    assert.equal(collector.calls, 0);
  } finally {
    await stop();
  }
});

test("a paid call answers with the record, and every refusal in it names its transaction", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const response = await fetch(`${url}/attest/7`, { headers: { "x-payment": await payment() } });
    assert.equal(response.status, 200);
    assert.equal(collector.calls, 1);

    const body = await bodyOf(response);
    assert.equal(body.agentId, "7");
    assert.equal(body.mandate.live, true);
    assert.equal(body.conduct.draws, 2);
    assert.equal(body.conduct.refusals, 1);
    assert.equal(body.conduct.linkage, 1);
    /* A buyer given the window figure alone prices a mandate that renews
       itself every day. The answer carries the total and says whether its
       range reaches back far enough for that total to be the whole of it. */
    assert.equal(body.mandate.lifetimeCap6, "150000000");
    assert.equal(body.conduct.lifetimeSpent6, "4800");
    assert.equal(body.conduct.lifetimeComplete, true);
    assert.match(body.refusals[0].transactionHash, /^0x[0-9a-f]{64}$/);
    assert.equal(body.refusals[0].reason, "tranche-cap");
    assert.equal(body.verify.vault, sources.vault);

    const receipt = JSON.parse(
      Buffer.from(response.headers.get("x-payment-response")!, "base64").toString("utf8"),
    );
    assert.equal(receipt.success, true);
    assert.equal(receipt.payer, payer.address);
    assert.match(receipt.transaction, /^0x[0-9a-f]{64}$/);
  } finally {
    await stop();
  }
});

test("the same authorisation does not buy a second answer", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const header = await payment();
    assert.equal((await fetch(`${url}/attest/7`, { headers: { "x-payment": header } })).status, 200);

    const again = await fetch(`${url}/attest/7`, { headers: { "x-payment": header } });
    assert.equal(again.status, 402);
    assert.match((await bodyOf(again)).error, /already been used/);
    assert.equal(collector.calls, 1, "the second was refused before it reached the token");
  } finally {
    await stop();
  }
});

test("a settlement that fails returns the reason and leaves the authorisation spendable", async () => {
  const collector = new StubCollector();
  collector.fail = "insufficient balance";
  const { url, stop } = await serve(collector);
  try {
    const header = await payment();
    const first = await fetch(`${url}/attest/7`, { headers: { "x-payment": header } });
    assert.equal(first.status, 402);
    assert.match((await bodyOf(first)).error, /insufficient balance/);

    collector.fail = null;
    const second = await fetch(`${url}/attest/7`, { headers: { "x-payment": header } });
    assert.equal(second.status, 200, "the payer never spent it, so they may use it again");
  } finally {
    await stop();
  }
});

test("a payment that pays somebody else buys nothing", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const header = await payment({ to: "0x1111111111111111111111111111111111111111" as Address });
    const response = await fetch(`${url}/attest/7`, { headers: { "x-payment": header } });
    assert.equal(response.status, 402);
    assert.equal(collector.calls, 0);
  } finally {
    await stop();
  }
});

test("the daemon's own header name is accepted, so Cordon can pay Cordon", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const response = await fetch(`${url}/attest/7`, {
      headers: { "payment-signature": await payment() },
    });
    assert.equal(response.status, 200);
  } finally {
    await stop();
  }
});

test("nothing here can be written to", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const response = await fetch(`${url}/attest/7`, { method: "POST" });
    assert.equal(response.status, 405);
  } finally {
    await stop();
  }
});

test("health says what the price is and how far the answer reaches", async () => {
  const collector = new StubCollector();
  const { url, stop } = await serve(collector);
  try {
    const body = await bodyOf(await fetch(`${url}/health`));
    assert.equal(body.price6, ATTEST.price6.toString());
    assert.equal(body.payTo, PAYTO);
    assert.equal(body.chainId, CHAIN);
    assert.equal(body.nodes, 2);
  } finally {
    await stop();
  }
});

/* ------------------------------------------------------------------ */
/* What a browser needs before it will let a page pay                  */
/* ------------------------------------------------------------------ */

/**
 * `X-PAYMENT` is not a header a browser will send cross-origin without asking
 * first, so a page paying this endpoint sends `OPTIONS` before the real
 * request. That was answered with 405, and the browser then blocked the
 * payment — every browser x402 client locked out of the one surface here that
 * takes money, with nothing in the body to say so because there is no body.
 */
test("the preflight a browser sends before paying is answered", async () => {
  const server = await serve(new StubCollector());
  try {
    const response = await fetch(`${server.url}/attest/7`, {
      method: "OPTIONS",
      headers: {
        origin: "https://getcordon.xyz",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-payment",
      },
    });

    assert.equal(response.status, 204, "a preflight is not a request for the resource");
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /x-payment/);
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /GET/);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    await server.stop();
  }
});

test("the receipt is a header a page is allowed to read", async () => {
  const server = await serve(new StubCollector());
  try {
    const response = await fetch(`${server.url}/attest/7`, {
      headers: { "X-PAYMENT": await payment() },
    });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("x-payment-response"), "the transaction the payer just paid in");
    assert.match(
      response.headers.get("access-control-expose-headers") ?? "",
      /x-payment-response/,
      "`*` origin lets a page read the body and not the headers, so the receipt has to be named",
    );
  } finally {
    await server.stop();
  }
});

/**
 * One submitter key, and nginx hands this process as many paying requests at
 * once as arrive. Two settlements that overlap between reading the pending
 * nonce and sending ask for the same nonce; the loser is a payer who signed a
 * valid authorisation and was told settlement failed.
 */
test("two payments arriving together settle one at a time", async () => {
  let inFlight = 0;
  let overlapped = false;

  class SlowCollector implements Collector {
    async collect(p: Parameters<Collector["collect"]>[0]) {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await new Promise((done) => setTimeout(done, 40));
      inFlight -= 1;
      return {
        txHash: `0x${"fe".repeat(32)}` as Hex,
        payer: p.authorization.from,
        amount6: p.authorization.value,
      };
    }
  }

  /* The queue lives in the collector the endpoint holds, so this exercises the
     real one rather than the server around it. */
  const collector = new Eip3009Collector({
    rpcUrl: "http://127.0.0.1:1",
    chain: { id: 31337, name: "t", nativeCurrency: { name: "e", symbol: "e", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:1"] } } } as never,
    token: terms.asset,
    privateKey: `0x${"11".repeat(32)}` as Hex,
  });
  const slow = new SlowCollector();
  /* Borrow the real queue and the real key, and let the work be the stub's:
     what is under test is the ordering, not the transaction. */
  const queued = (p: Parameters<Collector["collect"]>[0]) =>
    (collector as unknown as { inTurn: <T>(k: string, w: () => Promise<T>) => Promise<T> }).inTurn(
      collector.submitter,
      () => slow.collect(p),
    );

  const one = await parsePaymentFor(await payment({ nonce: `0x${"01".repeat(32)}` as Hex }));
  const two = await parsePaymentFor(await payment({ nonce: `0x${"02".repeat(32)}` as Hex }));
  await Promise.all([queued(one), queued(two)]);

  assert.equal(overlapped, false, "the second waits for the first rather than racing it for a nonce");
});

/** The header a payer sends, decoded the way the server decodes it. */
const parsePaymentFor = async (header: string) => parsePaymentHeader(header);
