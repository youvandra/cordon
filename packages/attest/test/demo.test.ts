/**
 * The demo seller, end to end, with the settlement and the chain stubbed.
 *
 * Payments are really signed and really recovered; only the transaction that
 * takes the money and the RPC read stand in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { DEMO_SELLER } from "../../fixtures/src/index.ts";
import { parseChallenge, selectOffer } from "../../daemon/src/challenge.ts";
import { createDemoSeller, type Snapshot } from "../src/demo.ts";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, type Payment, type Terms } from "../src/payment.ts";
import type { Collection, Collector } from "../src/collect.ts";

const payer = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const ASSET = "0x3600000000000000000000000000000000000000" as Address;
const PAYTO = "0xc0d000000000000000000000000000000000c0d0" as Address;
const CHAIN = 5042002;
const NOW = 1_800_000_000n;

const terms: Terms = {
  network: `eip155:${CHAIN}`,
  asset: ASSET,
  payTo: PAYTO,
  price6: DEMO_SELLER.price6,
  scheme: DEMO_SELLER.scheme,
  minLeadSeconds: DEMO_SELLER.minLeadSeconds,
  x402Version: DEMO_SELLER.x402Version,
  domain: { name: "USD Coin", version: "2", chainId: CHAIN, verifyingContract: ASSET },
};

const reading: Snapshot = { chainId: CHAIN, blockNumber: 61_825_839n, timestamp: NOW - 1n, gasPrice: 160_000_000_000n };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bodyOf = async (res: Response): Promise<any> => res.json();

class StubCollector implements Collector {
  calls: Payment[] = [];
  fail = false;
  async collect(payment: Payment): Promise<Collection> {
    this.calls.push(payment);
    if (this.fail) throw new Error("reverted");
    return { txHash: `0x${"ab".repeat(32)}` as Hex, payer: payment.authorization.from, amount6: payment.authorization.value };
  }
}

async function sign(value: bigint, nonce = `0x${"01".repeat(32)}` as Hex): Promise<string> {
  const authorization = {
    from: payer.address,
    to: PAYTO,
    value,
    validAfter: 0n,
    validBefore: NOW + 600n,
    nonce,
  };
  const signature = await payer.signTypedData({
    domain: terms.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });
  const body = {
    x402Version: terms.x402Version,
    scheme: terms.scheme,
    network: terms.network,
    payload: {
      signature,
      authorization: Object.fromEntries(
        Object.entries(authorization).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
      ),
    },
  };
  return Buffer.from(JSON.stringify(body)).toString("base64");
}

async function serve(options: { collector?: StubCollector; read?: () => Promise<Snapshot> } = {}) {
  const collector = options.collector ?? new StubCollector();
  const server = createDemoSeller({ terms, collector, read: options.read ?? (async () => reading), now: () => NOW });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, collector, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("an unpaid request gets the dollar offer, in the dialect the daemon settles", async () => {
  const s = await serve();
  try {
    const res = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`);
    assert.equal(res.status, 402);
    const offer = selectOffer(parseChallenge(402, await bodyOf(res))!, {
      networks: [terms.network],
      assets: [ASSET],
    });
    assert.equal(offer.amount, DEMO_SELLER.price6);
    assert.equal(offer.payTo.toLowerCase(), PAYTO.toLowerCase());
  } finally {
    await s.close();
  }
});

test("a paid request gets the reading and names the settlement", async () => {
  const s = await serve();
  try {
    const res = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`, {
      headers: { "payment-signature": await sign(DEMO_SELLER.price6) },
    });
    assert.equal(res.status, 200);
    const body = await bodyOf(res);
    assert.equal(body.blockNumber, reading.blockNumber.toString());
    const receipt = JSON.parse(Buffer.from(res.headers.get("x-payment-response")!, "base64").toString());
    assert.equal(receipt.amount, "1000000");
    assert.equal(s.collector.calls.length, 1);
  } finally {
    await s.close();
  }
});

test("an authorisation for less than a dollar is refused before it reaches the chain", async () => {
  const s = await serve();
  try {
    const res = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`, {
      headers: { "x-payment": await sign(10_000n) },
    });
    assert.equal(res.status, 402);
    assert.match((await bodyOf(res)).error, /the price is 1000000/);
    assert.equal(s.collector.calls.length, 0);
  } finally {
    await s.close();
  }
});

test("the same authorisation is not taken twice", async () => {
  const s = await serve();
  try {
    const header = await sign(DEMO_SELLER.price6, `0x${"02".repeat(32)}`);
    const first = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`, { headers: { "x-payment": header } });
    assert.equal(first.status, 200);
    const again = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`, { headers: { "x-payment": header } });
    assert.equal(again.status, 402);
    assert.equal(s.collector.calls.length, 1);
  } finally {
    await s.close();
  }
});

test("a failed settlement leaves the authorisation usable and sells nothing", async () => {
  const collector = new StubCollector();
  collector.fail = true;
  const s = await serve({ collector });
  try {
    const header = await sign(DEMO_SELLER.price6, `0x${"03".repeat(32)}`);
    const res = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`, { headers: { "x-payment": header } });
    assert.equal(res.status, 402);
    assert.match((await bodyOf(res)).error, /settlement failed/);
    collector.fail = false;
    const retry = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`, { headers: { "x-payment": header } });
    assert.equal(retry.status, 200);
  } finally {
    await s.close();
  }
});

test("a chain it cannot read is a 503 with no price attached", async () => {
  const s = await serve({ read: async () => { throw new Error("rpc down"); } });
  try {
    const res = await fetch(`${s.base}${DEMO_SELLER.resourcePath}`, {
      headers: { "x-payment": await sign(DEMO_SELLER.price6, `0x${"04".repeat(32)}`) },
    });
    assert.equal(res.status, 503);
    assert.equal((await bodyOf(res)).accepts, undefined);
    assert.equal(s.collector.calls.length, 0);
  } finally {
    await s.close();
  }
});
