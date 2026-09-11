/**
 * The settler, without the network.
 *
 * Two things are worth a test here and neither is "does viem sign". The first
 * is the arithmetic that decides whether a purchase can be settled at all:
 * Circle charges its fee **on top of** the value, so a tranche at or below the
 * fee releases nothing, and the daemon should say that with Circle's number
 * rather than sending an intent it can predict will be refused. The second is
 * that the intent and the authorisation carry what the seller asked for and
 * not what we would have guessed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWalletClient, http, defineChain, verifyTypedData, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GATEWAY, ATTEST } from "../../fixtures/src/index.ts";
import { CircleSettler, SettlementError, TRANSFER_WITH_AUTHORIZATION_TYPES } from "../src/settle.ts";
import { buildBurnIntent, GatewayApi, GATEWAY_EIP712_DOMAIN, BURN_INTENT_TYPES } from "../src/gateway.ts";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const account = privateKeyToAccount(KEY);
const SELLER = "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57" as Address;
const USDC = "0x3600000000000000000000000000000000000000" as Address;
const NODE = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

const arc = defineChain({
  id: 5042002, name: "arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:1"] } },
});
const wallet = createWalletClient({ account, chain: arc, transport: http() });

/** Circle, answering from a fixture instead of from Virginia. */
function fakeApi(recorder: { body?: string } = {}, balance = "0.020000"): GatewayApi {
  const fetchImpl = (async (url: string, init?: { body?: string }) => {
    if (String(url).endsWith("/v1/balances")) {
      /* Circle's own view of the tranche, which the settler waits for. */
      return new Response(JSON.stringify({ balances: [{ balance }] }), { status: 200 });
    }
    if (String(url).endsWith("/v1/info")) {
      return new Response(
        JSON.stringify({ domains: [{ domain: GATEWAY.domain, burnIntentExpirationHeight: "62790718" }] }),
        { status: 200 },
      );
    }
    recorder.body = init?.body;
    return new Response(
      JSON.stringify({
        attestation: "0xdead", signature: "0xbeef",
        transferId: "t-1", fees: { total: "0.0035" },
      }),
      { status: 201 },
    );
  }) as unknown as typeof fetch;
  return new GatewayApi({ base: "https://gateway.test", fetchImpl });
}

const MINT_TX = ("0x" + "ab".repeat(32)) as Hex;

const settler = (api: GatewayApi) =>
  new CircleSettler({
    publicClient: {} as never,
    walletFor: () => wallet,
    chainId: arc.id,
    api,
    now: () => 1_757_000_000_000,
    balanceWaitMs: 0,
    balancePollMs: 1,
    nonce: () => ("0x" + "11".repeat(32)) as Hex,
    /* The mint is one contract call and needs a chain; the rest of the path
       is signatures and arithmetic, which is what these tests are about. */
    mint: async () => MINT_TX,
  });

/** Base units the way Circle reports them: whole USDC, six places. */
const circleDecimal = (base6: bigint) =>
  `${base6 / 1_000_000n}.${(base6 % 1_000_000n).toString().padStart(6, "0")}`;

const offer = (value: bigint) => ({
  to: SELLER, value, asset: USDC, network: `eip155:${arc.id}`,
  extra: { name: "USD Coin", version: "2" }, maxTimeoutSeconds: ATTEST.maxTimeoutSeconds,
});

test("a tranche at or below Circle's fee is refused with Circle's own number", async () => {
  await assert.rejects(
    () => settler(fakeApi()).settle(NODE, offer(GATEWAY.baseFee6)),
    (error: Error) => {
      assert.ok(error instanceof SettlementError);
      assert.match(error.message, new RegExp(String(GATEWAY.baseFee6)));
      assert.match(error.message, /cannot pay for its own release/);
      return true;
    },
  );
});

test("the burn releases the tranche less the fee, because the fee is charged on top", async () => {
  const recorder: { body?: string } = {};
  /* The mint is the only part that needs a chain, and it is not what this
     asserts, so the intent is read out of what was sent to Circle. */
  await settler(fakeApi(recorder)).settle(NODE, offer(ATTEST.price6));

  const sent = JSON.parse(recorder.body!)[0] as { burnIntent: { maxFee: string; spec: Record<string, string> } };
  assert.equal(sent.burnIntent.maxFee, String(GATEWAY.baseFee6));
  assert.equal(sent.burnIntent.spec.value, String(ATTEST.price6 - GATEWAY.baseFee6));
  assert.equal(
    sent.burnIntent.spec.destinationRecipient.toLowerCase(),
    `0x000000000000000000000000${account.address.slice(2)}`.toLowerCase(),
    "the tranche comes back to the operator, because an x402 payment spends its token balance",
  );
  assert.equal(sent.burnIntent.spec.sourceDomain, GATEWAY.domain);
  assert.equal(sent.burnIntent.spec.destinationDomain, GATEWAY.domain);
});

test("the burn intent is signed against the domain Circle verifies", async () => {
  const intent = buildBurnIntent({
    depositor: account.address, wallet: GATEWAY.wallet as Address, minter: GATEWAY.minter as Address,
    token: USDC, domain: GATEWAY.domain, value: 6_500n, maxFee: GATEWAY.baseFee6,
    maxBlockHeight: 62_795_718n, salt: ("0x" + "22".repeat(32)) as Hex,
  });
  const signature = await account.signTypedData({
    domain: GATEWAY_EIP712_DOMAIN, types: BURN_INTENT_TYPES,
    primaryType: "BurnIntent", message: intent as never,
  });
  assert.ok(
    await verifyTypedData({
      address: account.address, domain: GATEWAY_EIP712_DOMAIN, types: BURN_INTENT_TYPES,
      primaryType: "BurnIntent", message: intent as never, signature,
    }),
  );
});

test("the authorisation pays the seller its whole price, against the seller's own domain", async () => {
  const settlement = await settler(fakeApi()).settle(NODE, offer(ATTEST.price6));
  assert.equal(settlement.txHash, MINT_TX);

  const payload = JSON.parse(Buffer.from(settlement.proof, "base64").toString("utf8")) as {
    scheme: string;
    network: string;
    payload: { signature: Hex; authorization: Record<string, string> };
  };
  assert.equal(payload.scheme, "exact");
  assert.equal(payload.network, `eip155:${arc.id}`);

  const authorization = {
    from: account.address, to: SELLER,
    /* The seller is paid the whole price. What the burn released was the
       price less Circle's fee; the difference came from the operator's own
       float, the same place its gas does. */
    value: ATTEST.price6,
    validAfter: 0n, validBefore: 1_757_000_300n, nonce: ("0x" + "11".repeat(32)) as Hex,
  };
  assert.equal(payload.payload.authorization.value, String(ATTEST.price6));
  assert.equal(payload.payload.authorization.to, SELLER);

  const domain = { name: "USD Coin", version: "2", chainId: arc.id, verifyingContract: USDC };
  assert.ok(
    await verifyTypedData({
      address: account.address, domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES, primaryType: "TransferWithAuthorization",
      message: authorization, signature: payload.payload.signature,
    }),
    "the seller submits this, so it must recover to the operator against the token's own domain",
  );
});

test("a seller that names no EIP-712 domain is refused before anything is burned", async () => {
  const recorder: { body?: string } = {};
  const api = fakeApi(recorder);
  const bare = { ...offer(ATTEST.price6), extra: undefined };

  await assert.rejects(() => settler(api).settle(NODE, bare), SettlementError);
  assert.equal(
    recorder.body,
    undefined,
    "a tranche released for a payment that cannot be signed is a tranche gone and nothing bought",
  );
});

/**
 * The tranche the vault deposits is the whole balance a purchase gets.
 *
 * `TreeVault.draw` puts the seller's price into the operator's Gateway balance
 * and nothing beside it, so an operator on its first purchase holds exactly
 * the price. The intent built from that price debits exactly the price —
 * `value - fee` landing, `maxFee` of the fee on top — which is the arithmetic
 * Circle stated when it refused a $0.0100 burn against a $0.0100 balance for
 * `required 0.0135` and accepted a $0.0065 one.
 *
 * The settler waited for the price *plus* the fee, a balance no draw produces.
 * Every purchase that ever got past it was made by an operator carrying a
 * float from an earlier run; a fresh one waited out the window and threw,
 * after the draw had already debited every ancestor. The fixture below is the
 * balance a first purchase actually has, and it used to be a minute of waiting
 * and a `SettlementError`.
 */
test("a tranche is enough to settle the purchase it was drawn for", async () => {
  const recorder: { body?: string } = {};
  const exactly = circleDecimal(ATTEST.price6);
  assert.equal(exactly, "0.010000", "the fixture is the price, in Circle's own six places");

  const settlement = await settler(fakeApi(recorder, exactly)).settle(NODE, offer(ATTEST.price6));
  assert.equal(settlement.txHash, MINT_TX, "it settled rather than waiting for money it will not get");

  const sent = JSON.parse(recorder.body!)[0] as { burnIntent: { maxFee: string; spec: { value: string } } };
  assert.equal(
    BigInt(sent.burnIntent.spec.value) + BigInt(sent.burnIntent.maxFee),
    ATTEST.price6,
    "and what it sent debits the tranche exactly, which is why the tranche covers it",
  );
});

/**
 * Circle answers in whole USDC as a decimal string; this project counts in base
 * units. That conversion went through a float — `Number(seen) * 1e6`, rounded —
 * and rounding money up is the one failure this project cannot have.
 *
 * `0.0099995` is nine thousand nine hundred and ninety-nine base units and a
 * half. Truncated to the six places a base unit has, it is 9,999: one short of
 * a one-cent purchase. Doubled through a float and rounded, it is 10,000, and
 * the settler goes on to sign an intent Circle refuses for a balance that is
 * not there — after the draw has debited every ancestor.
 */
test("a balance half a base unit short is not rounded up into a settlement", async () => {
  const short = "0.0099995";
  await assert.rejects(
    () => settler(fakeApi({}, short)).settle(NODE, offer(ATTEST.price6)),
    (error: Error) => {
      assert.ok(error instanceof SettlementError);
      assert.match(error.message, /still reports 0\.0099995/);
      assert.match(error.message, new RegExp(`${ATTEST.price6} base units`));
      return true;
    },
  );
});
