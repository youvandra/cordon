/**
 * What naming an agent will do, decided before a wallet is asked to sign.
 *
 * The dialog's hard part is not the form: it is walking an ENSv2 tree whose
 * names are discovered rather than configured, carrying the nearest resolver
 * down a wildcard, and knowing whether the parent has a registry beneath it —
 * which is the difference between one signature and three. The owner signs
 * this path by hand, so what a test can pin is everything up to the signature.
 *
 * A stub reader stands in for the chain, so these assert the plan and not the
 * network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { namehash } from "viem";
import { ENSV2 } from "@cordon/fixtures";
import { placeOf, planFor } from "../src/lib/ens-plan.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const OWNER = `0x${"aa".repeat(20)}`;
const RESOLVER = `0x${"bb".repeat(20)}`;
const MIRA_REGISTRY = `0x${"11".repeat(20)}`;
const PROBE_REGISTRY = `0x${"22".repeat(20)}`;

/**
 * The live shape, reduced to what a name walk reads.
 *
 *   eth registry  — mira  -> MIRA_REGISTRY, resolver RESOLVER
 *   MIRA_REGISTRY — probe -> PROBE_REGISTRY, no resolver of its own
 *   PROBE_REGISTRY— worker1 held by OWNER, and no registry beneath it
 */
const reader = {
  readContract: async ({ address, functionName, args }: { address: string; functionName: string; args?: readonly unknown[] }) => {
    const label = args?.[0];
    if (functionName === "getSubregistry") {
      if (address === ENSV2.registry && label === "mira") return MIRA_REGISTRY;
      if (address === MIRA_REGISTRY && label === "probe") return PROBE_REGISTRY;
      return ZERO;
    }
    if (functionName === "getResolver") {
      if (address === ENSV2.registry && label === "mira") return RESOLVER;
      return ZERO;
    }
    if (functionName === "ownerOf") {
      /* The label is held where it lives. Any other registry knows nothing of
         it, which is how a name that does not exist reads. */
      return address === PROBE_REGISTRY ? OWNER : ZERO;
    }
    throw new Error(`the stub was asked for ${functionName}, which a name walk does not make`);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

test("a name is walked from the eth registry down, and the nearest resolver carried with it", async () => {
  const place = await placeOf(reader, "worker1.probe.mira.eth");

  assert.equal(place.name, "worker1.probe.mira.eth");
  assert.equal(place.label, "worker1");
  assert.equal(place.registry, PROBE_REGISTRY, "the label lives in the parent's subregistry");
  assert.equal(place.holder, OWNER);
  assert.equal(place.subregistry, null, "worker1 has no registry beneath it");
  assert.equal(place.resolver, RESOLVER, "the resolver is inherited from mira.eth by wildcard");
});

test("a parent with no registry beneath it needs one created first, which is the third signature", async () => {
  const plan = await planFor(reader, "worker1.probe.mira.eth", "kid");

  assert.equal(plan.fullName, "kid.worker1.probe.mira.eth");
  assert.equal(plan.node, namehash("kid.worker1.probe.mira.eth"));
  assert.equal(plan.needsSubregistry, true);
  assert.equal(plan.resolver, RESOLVER);
  assert.equal(plan.taken, false);
});

test("a parent that already has a registry needs no extra transaction, and a taken label says so", async () => {
  const plan = await planFor(reader, "probe.mira.eth", "worker1");

  assert.equal(plan.needsSubregistry, false, "probe.mira.eth already has a registry");
  assert.equal(plan.taken, true, "worker1 is already registered under probe.mira.eth");
});

test("a name under a registry-less parent is refused rather than walked to nothing", async () => {
  await assert.rejects(
    () => placeOf(reader, "kid.worker1.probe.mira.eth"),
    /no registry beneath it/,
  );
});
