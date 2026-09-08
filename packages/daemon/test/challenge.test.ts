import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChallenge, selectOffer, ChallengeError } from "../src/challenge.ts";

/** A real one, copied from Circle's live catalogue on 2026-09-08. */
const REAL = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57",
      amount: "10000",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    },
    {
      scheme: "exact",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      payTo: "9246XrsAEKH6hAyEQe5PvdpUL1p5Ktj9c7ySnwQn6ois",
      amount: "10000",
      maxTimeoutSeconds: 300,
    },
  ],
};

const BASE = {
  networks: ["eip155:8453"],
  assets: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
};

test("a real challenge parses, and the amount stays exact", () => {
  const c = parseChallenge(402, REAL);
  assert.ok(c);
  assert.equal(c.offers.length, 2);
  assert.equal(c.offers[0].amount, 10_000n);
  assert.equal(typeof c.offers[0].amount, "bigint");
});

test("a non-402 is not a challenge, and does not throw", () => {
  assert.equal(parseChallenge(200, REAL), null);
  assert.equal(parseChallenge(404, null), null);
});

test("the counterparty is the seller's payTo and nothing else", () => {
  const offer = selectOffer(parseChallenge(402, REAL)!, BASE);
  assert.equal(offer.payTo, "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57");
  assert.equal(offer.network, "eip155:8453");
});

test("an offer on a network we do not settle is not chosen", () => {
  assert.throws(
    () => selectOffer(parseChallenge(402, REAL)!, { networks: ["eip155:1"], assets: BASE.assets }),
    ChallengeError,
  );
});

test("a seller cannot steer us onto another asset by pricing it lower", () => {
  const bait = {
    x402Version: 2,
    accepts: [
      { ...REAL.accepts[0], asset: "0x00000000000000000000000000000000deadbeef", amount: "1" },
      REAL.accepts[0],
    ],
  };
  const offer = selectOffer(parseChallenge(402, bait)!, BASE);
  assert.equal(offer.amount, 10_000n, "the configured asset wins, not the cheaper one");
});

test("an amount that is not a base-unit string is refused rather than rounded", () => {
  for (const amount of [10000, "1.5", "", "0x10", "-1"]) {
    assert.throws(
      () => parseChallenge(402, { x402Version: 2, accepts: [{ ...REAL.accepts[0], amount }] }),
      ChallengeError,
      `accepted ${JSON.stringify(amount)}`,
    );
  }
});

test("an amount past 2^53 survives, because this is money", () => {
  const huge = "9007199254740993";
  const c = parseChallenge(402, { x402Version: 2, accepts: [{ ...REAL.accepts[0], amount: huge }] });
  assert.equal(c!.offers[0].amount, BigInt(huge));
});

test("a payTo that is not an address never reaches a contract call", () => {
  const bad = { x402Version: 2, accepts: [{ ...REAL.accepts[0], payTo: "0xnot-an-address" }] };
  assert.throws(() => selectOffer(parseChallenge(402, bad)!, BASE), ChallengeError);
});

test("a malformed challenge throws rather than paying something arbitrary", () => {
  assert.throws(() => parseChallenge(402, { accepts: [] }), ChallengeError);
  assert.throws(() => parseChallenge(402, { x402Version: 2 }), ChallengeError);
  assert.throws(() => parseChallenge(402, { x402Version: 2, accepts: [] }), ChallengeError);
  assert.throws(() => parseChallenge(402, "nope"), ChallengeError);
});
