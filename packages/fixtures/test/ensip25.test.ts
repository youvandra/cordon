/**
 * The ENSIP-25 key an ERC-8004 registration is published under.
 *
 * This encoding has already been got wrong once in this project, and it failed
 * quietly: a key one byte out is not rejected by a resolver, it simply resolves
 * to nothing — and nothing is exactly what an agent that never registered looks
 * like. A wrong key does not report an error, it reports a different agent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ERC8004, SEPOLIA, erc7930, registrationKey } from "../src/index.ts";

const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

/**
 * Pinned by hand rather than by re-running the builder, which would assert
 * only that the function agrees with itself. Sepolia is 11155111 — `0xaa36a7`,
 * three bytes, so the length prefix is `03` and the address prefix is `14`.
 */
test("the registration key is the ERC-7930 bytes ENSIP-25 asks for, to the byte", () => {
  assert.equal(
    erc7930(11155111, REGISTRY),
    "0x0001000003aa36a714" + "8004a818bfb912233c491871b3d84c89a494bd9e",
  );
});

test("a chain reference of an odd number of hex digits is padded, not truncated", () => {
  /* 1 → 0x01, one byte. An unpadded "1" would shift every byte after it. */
  const key = erc7930(1, REGISTRY);
  assert.equal(key.slice(0, 12), "0x0001000001");
  assert.equal(key.length, 2 + 4 + 4 + 2 + 2 + 2 + 40);
});

test("the address is lowercased, so a checksummed one and a flat one key the same record", () => {
  assert.equal(erc7930(11155111, REGISTRY), erc7930(11155111, REGISTRY.toLowerCase()));
});

/* The builder refuses what it cannot encode rather than encoding it short,
   because a short key is indistinguishable from an absent registration. */
test("something that is not a 20-byte address is refused rather than encoded short", () => {
  assert.throws(() => erc7930(11155111, "0x8004"), /not a 20-byte address/);
  assert.throws(() => erc7930(11155111, REGISTRY.slice(2)), /not a 20-byte address/);
});

test("a chain id that is not a positive integer is refused", () => {
  assert.throws(() => erc7930(0, REGISTRY), /positive integer/);
  assert.throws(() => erc7930(-1, REGISTRY), /positive integer/);
  assert.throws(() => erc7930(1.5, REGISTRY), /positive integer/);
});

test("the key names the agent id beside the registry it is registered in", () => {
  assert.equal(
    registrationKey(11155111, REGISTRY, 894130n),
    "agent-registration[0x0001000003aa36a714" +
      "8004a818bfb912233c491871b3d84c89a494bd9e" +
      "][894130]",
  );
});

/**
 * The surfaces key by the figures in this file rather than by literals, so the
 * key they build is asserted against the figures rather than against a copy of
 * them. A deployment moving `ERC8004.identity` should move the key with it.
 */
test("the key the surfaces actually build is the one this file's figures describe", () => {
  assert.equal(
    registrationKey(SEPOLIA.chainId, ERC8004.identity, 1n),
    `agent-registration[0x0001000003aa36a714${ERC8004.identity.slice(2).toLowerCase()}][1]`,
  );
});
