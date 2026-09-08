/**
 * The payment check, against the ways a paid endpoint is robbed.
 *
 * Every test here is named after the thing it prevents. A seller that takes a
 * signature without recovering it, or without pinning who is paid, is not
 * selling anything — it is publishing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { ATTEST } from "../../fixtures/src/index.ts";
import {
  Nonces,
  parsePayment,
  PaymentError,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  verifyPayment,
  type Authorization,
  type Terms,
} from "../src/payment.ts";

/* Anvil's first account. Public, funded, worthless. */
const PAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const payer = privateKeyToAccount(PAYER_KEY);

const ASSET = "0x3600000000000000000000000000000000000000" as Address;
const PAYTO = "0xc0d000000000000000000000000000000000c0d0" as Address;
const CHAIN = 5042002;
const NOW = 1_800_000_000n;

const terms: Terms = {
  network: `eip155:${CHAIN}`,
  asset: ASSET,
  payTo: PAYTO,
  price6: ATTEST.price6,
  scheme: ATTEST.scheme,
  minLeadSeconds: ATTEST.minLeadSeconds,
  domain: { name: "USD Coin", version: "2", chainId: CHAIN, verifyingContract: ASSET },
};

function authorization(overrides: Partial<Authorization> = {}): Authorization {
  return {
    from: payer.address,
    to: PAYTO,
    value: ATTEST.price6,
    validAfter: NOW - 10n,
    validBefore: NOW + 300n,
    nonce: `0x${"7f".repeat(32)}` as Hex,
    ...overrides,
  };
}

async function signed(auth: Authorization, terms_ = terms): Promise<string> {
  const signature = await payer.signTypedData({
    domain: terms_.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: auth,
  });
  return header({ signature, authorization: auth }, terms_);
}

function header(
  payload: { signature: Hex; authorization: Authorization },
  terms_ = terms,
): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: ATTEST.x402Version,
      scheme: terms_.scheme,
      network: terms_.network,
      asset: terms_.asset,
      payload: {
        signature: payload.signature,
        authorization: {
          from: payload.authorization.from,
          to: payload.authorization.to,
          value: payload.authorization.value.toString(),
          validAfter: payload.authorization.validAfter.toString(),
          validBefore: payload.authorization.validBefore.toString(),
          nonce: payload.authorization.nonce,
        },
      },
    }),
  ).toString("base64");
}

test("a well formed payment is taken", async () => {
  const verdict = await verifyPayment(parsePayment(await signed(authorization())), terms, NOW);
  assert.deepEqual(verdict, { ok: true, payer: payer.address });
});

test("a signature by somebody else does not pay for the person it names", async () => {
  const other = privateKeyToAccount(`0x${"5d".repeat(32)}` as Hex);
  const auth = authorization();
  const signature = await other.signTypedData({
    domain: terms.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: auth,
  });

  const verdict = await verifyPayment(parsePayment(header({ signature, authorization: auth })), terms, NOW);
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /signature is by/);
});

test("an authorisation that pays somebody else is not a payment to us", async () => {
  const auth = authorization({ to: "0x1111111111111111111111111111111111111111" as Address });
  const verdict = await verifyPayment(parsePayment(await signed(auth)), terms, NOW);
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /this endpoint is paid at/);
});

test("underpaying is refused, and the amount it fell short by is in the refusal", async () => {
  const auth = authorization({ value: ATTEST.price6 - 1n });
  const verdict = await verifyPayment(parsePayment(await signed(auth)), terms, NOW);
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /the price is 1000/);
});

test("overpaying is allowed, because the payer chose it", async () => {
  const verdict = await verifyPayment(
    parsePayment(await signed(authorization({ value: ATTEST.price6 * 2n }))),
    terms,
    NOW,
  );
  assert.equal(verdict.ok, true);
});

test("an authorisation that expires while the settlement is in flight is refused before it is sent", async () => {
  const auth = authorization({ validBefore: NOW + BigInt(ATTEST.minLeadSeconds) });
  const verdict = await verifyPayment(parsePayment(await signed(auth)), terms, NOW);
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /too soon to settle/);
});

test("an authorisation that is not valid yet is refused", async () => {
  const auth = authorization({ validAfter: NOW + 60n });
  const verdict = await verifyPayment(parsePayment(await signed(auth)), terms, NOW);
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /not valid yet/);
});

test("a signature against another chain's domain does not spend here", async () => {
  const elsewhere: Terms = { ...terms, domain: { ...terms.domain, chainId: 8453 } };
  const auth = authorization();
  const verdict = await verifyPayment(parsePayment(await signed(auth, elsewhere)), terms, NOW);
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /signature is by/);
});

test("a payment for another network is refused before any recovery is attempted", async () => {
  const auth = authorization();
  const other: Terms = { ...terms, network: "eip155:8453" };
  const verdict = await verifyPayment(parsePayment(await signed(auth, other)), terms, NOW);
  assert.equal(verdict.ok, false);
  assert.match((verdict as { reason: string }).reason, /settles on eip155:5042002/);
});

test("an amount is a base-unit string, never a float", () => {
  const auth = authorization();
  const body = JSON.parse(Buffer.from(header({ signature: "0xdead" as Hex, authorization: auth }), "base64").toString());
  body.payload.authorization.value = 0.001;
  assert.throws(
    () => parsePayment(Buffer.from(JSON.stringify(body)).toString("base64")),
    PaymentError,
  );
});

test("a header that is not a payment says so rather than being treated as one", () => {
  assert.throws(() => parsePayment("not-a-payment"), PaymentError);
  assert.throws(() => parsePayment(Buffer.from("{}").toString("base64")), PaymentError);
});

test("the nonce map forgets a settlement that failed, because the payer never spent it", () => {
  const nonces = new Nonces();
  const auth = authorization();
  nonces.add(auth);
  assert.equal(nonces.has(auth), true);
  nonces.drop(auth);
  assert.equal(nonces.has(auth), false);
});
