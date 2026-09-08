/**
 * The record, end to end, with nobody deciding what goes on it.
 *
 * G6 proves the contract cannot be made to write a refusal that did not
 * happen. This proves the other half of the same claim: that the refusals
 * which did happen actually get written, automatically, by the daemon, with no
 * filter and no human in the loop. A seat that can only be driven by hand
 * produces a record with gaps exactly where somebody was busy.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { load } from "../src/config.ts";
import { Gate } from "../src/gate.ts";
import { ConductRecordAbi, TreeVaultAbi } from "../src/abi.gen.ts";
import { startHarness, type Harness, OP_CHILD_KEY, SELLER_PAYOUT, PRICE, TRANCHE } from "./harness.ts";

let h: Harness;

before(async () => {
  h = await startHarness(8550);
});
after(async () => {
  await h.stop();
});

function gateWith(record?: Address): Gate {
  process.env.CORDON_KEY_CHILD = OP_CHILD_KEY;
  return new Gate(
    load({
      CORDON_RPC: h.rpc,
      CORDON_CHAIN_ID: "31337",
      CORDON_VAULT: h.vault,
      CORDON_REGISTRY: h.registry,
      CORDON_USDC: h.usdc,
      CORDON_IDENTITY: h.identity,
      ...(record ? { CORDON_RECORD: record } : {}),
      CORDON_NODE_CHILD: h.child,
      CORDON_KEY_CHILD: OP_CHILD_KEY,
    } as NodeJS.ProcessEnv),
  );
}

const agentIdOf = (node: Hex) =>
  h.publicClient.readContract({
    address: h.record,
    abi: ConductRecordAbi,
    functionName: "agentIdOf",
    args: [node],
  }) as Promise<bigint>;

const attested = (refusalId: bigint) =>
  h.publicClient.readContract({
    address: h.record,
    abi: ConductRecordAbi,
    functionName: "attested",
    args: [refusalId],
  }) as Promise<boolean>;

test("a node's identity is its operator's, registered with the operator's own key", async () => {
  const gate = gateWith(h.record);

  const agentId = await gate.enrol(h.child);
  assert.ok(agentId !== null && agentId > 0n, "the registry assigned an id");
  assert.equal(await agentIdOf(h.child), agentId, "and the seat is bound to it");

  /* Binding checks on chain that the identity's holder is the node's operator.
     Cordon does not hold the token: a record about a token we control is the
     shape of the thing being replaced. */
  const again = await gate.enrol(h.child);
  assert.equal(again, agentId, "enrolment is idempotent, so a restart does not mint a second identity");
});

test("every refusal is published, without anyone asking for it", async () => {
  const gate = gateWith(h.record);
  await gate.enrol(h.child);

  const refused = await gate.draw(h.child, SELLER_PAYOUT as Address, TRANCHE + 1n);

  assert.equal(refused.released, false, "over the tranche cap");
  assert.ok(refused.refusalId, "the refusal is on chain");
  assert.equal(
    await attested(refused.refusalId!),
    true,
    "and on the record, because the daemon does not choose which refusals are worth reporting",
  );
});

test("a released draw writes nothing, because there is nothing to report", async () => {
  const gate = gateWith(h.record);
  await gate.enrol(h.child);

  const before = await h.publicClient.readContract({
    address: h.vault,
    abi: TreeVaultAbi,
    functionName: "refusalCount",
  });

  const ok = await gate.draw(h.child, SELLER_PAYOUT as Address, PRICE);
  assert.equal(ok.released, true);

  const after = await h.publicClient.readContract({
    address: h.vault,
    abi: TreeVaultAbi,
    functionName: "refusalCount",
  });

  assert.equal(after, before, "a purchase inside the bound is not conduct, and the record stays quiet");
});

test("without a seat the daemon still refuses, and says the refusal is unpublished", async () => {
  /* The failure mode worth being precise about: recording is publicity, never
     control. A daemon with no ConductRecord enforces every bound exactly as
     before — it just cannot tell anyone. */
  const gate = gateWith(undefined);
  assert.equal(gate.recorder.enabled, false);

  const refused = await gate.draw(h.child, SELLER_PAYOUT as Address, TRANCHE + 1n);
  assert.equal(refused.released, false, "the bound is the contract's, not the recorder's");
  assert.equal(await attested(refused.refusalId!), false, "and nothing was written");
});
