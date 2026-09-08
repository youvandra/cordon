import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Hex } from "viem";
import { load } from "../src/config.ts";
import { Gate } from "../src/gate.ts";
import { cordonFetch, type Transport } from "../src/fetch.ts";
import { createDaemon } from "../src/server.ts";
import type { Settler, Payment, Settlement } from "../src/settle.ts";
import { TreeVaultAbi } from "../src/abi.gen.ts";
import {
  startHarness, type Harness, ERC20, GATEWAY, OP_CHILD_KEY, SELLER_PAYOUT, PRICE, ROOT_BUDGET,
} from "./harness.ts";

/**
 * The claim, end to end: an agent that holds no key pays a seller through the
 * daemon, and the same agent is refused when the purchase is out of bounds.
 *
 * Everything here is real except Circle settlement, and the stand-in for that
 * is honest about being one — it spends the Gateway balance the way its
 * depositor really can, off chain, with no contract in the path.
 */
let h: Harness;

before(async () => { h = await startHarness(8546); });
after(async () => { await h.stop(); });

class LocalSettler implements Settler {
  async settle(_node: Hex, payment: Payment): Promise<Settlement> {
    const hash = await h.asOpChild.writeContract({
      address: h.gateway, abi: GATEWAY, functionName: "spendOffChain",
      args: [payment.asset, payment.to, payment.value],
      chain: null, account: h.asOpChild.account!,
    });
    await h.publicClient.waitForTransactionReceipt({ hash });
    return { proof: `local:${hash}`, txHash: hash };
  }
}

function makeGate(): Gate {
  process.env.CORDON_KEY_CHILD = OP_CHILD_KEY;
  return new Gate(load({
    CORDON_RPC: h.rpc, CORDON_CHAIN_ID: "31337",
    CORDON_VAULT: h.vault, CORDON_REGISTRY: h.registry, CORDON_USDC: h.usdc,
    CORDON_NETWORKS: "eip155:31337", CORDON_ASSETS: h.usdc,
    CORDON_NODE_CHILD: h.child, CORDON_KEY_CHILD: OP_CHILD_KEY,
  } as NodeJS.ProcessEnv));
}

const transport: Transport = async (url, init) => {
  const r = await fetch(url, { method: init.method, headers: init.headers, body: init.body });
  return { status: r.status, headers: {}, body: await r.json() };
};

const deps = () => ({
  gate: makeGate(), settler: new LocalSettler(), transport,
  acceptable: { networks: ["eip155:31337"], assets: [h.usdc] },
});

const sellerBalance = () => h.publicClient.readContract({
  address: h.usdc, abi: ERC20, functionName: "balanceOf", args: [SELLER_PAYOUT],
}) as Promise<bigint>;

test("an agent with no key pays a seller through the daemon", async () => {
  const before = await sellerBalance();
  const result = await cordonFetch({ node: h.child, url: h.sellerUrl }, deps());

  assert.equal(result.paid, true);
  assert.deepEqual((result as { body: unknown }).body, { answer: "the paid body" });
  assert.equal((await sellerBalance()) - before, PRICE, "the seller was paid exactly its own price");

  // The agent named no recipient. The seller did, in its own 402.
  assert.equal((result as { offer: { payTo: string } }).offer.payTo, SELLER_PAYOUT);

  const rootSpent = await h.publicClient.readContract({
    address: h.vault, abi: TreeVaultAbi, functionName: "windowSpent", args: [h.root],
  });
  assert.equal(rootSpent, PRICE, "and the root was debited by a purchase one level down");
});

test("the daemon holds a key for its own node and no other", async () => {
  const gate = makeGate();
  assert.deepEqual(gate.nodes(), [h.child.toLowerCase()]);
  await assert.rejects(() => gate.draw(h.root, SELLER_PAYOUT, PRICE), /holds no key/);
});

test("a seller asking past the tranche cap is refused, and nothing is paid", async () => {
  const before = await sellerBalance();
  const result = await cordonFetch({ node: h.child, url: h.greedyUrl }, deps());

  assert.equal(result.paid, false);
  const refusal = (result as { refusal: { reason: string; refusalId?: bigint } }).refusal;
  assert.equal(refusal.reason, "tranche-cap");
  assert.ok(refusal.refusalId! > 0n, "and it is on the record");
  assert.equal(await sellerBalance(), before, "the seller got nothing");
});

test("headroom the daemon reports is the tightest limit above it", async () => {
  const { available } = await makeGate().headroom(h.child);
  const rootSpent = await h.publicClient.readContract({
    address: h.vault, abi: TreeVaultAbi, functionName: "windowSpent", args: [h.root],
  }) as bigint;
  assert.equal(available, ROOT_BUDGET - rootSpent);
});

test("the daemon serves fetch, status and spawn — and no way to transfer", async () => {
  const daemon = createDaemon(deps());
  await new Promise<void>((r) => daemon.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(daemon.address() as { port: number }).port}`;

  const status = (await (await fetch(`${base}/status`)).json()) as {
    nodes: { headroom: { available: string } }[];
  };
  assert.equal(status.nodes.length, 1, "it reports only the node it holds a key for");
  assert.ok(BigInt(status.nodes[0].headroom.available) > 0n);

  const paid = (await (await fetch(`${base}/fetch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ node: h.child, url: h.sellerUrl }),
  })).json()) as { paid: boolean };
  assert.equal(paid.paid, true, "an agent gets its body by asking for a URL");

  /* The absences. An agent that wants to move money has no way to say so. */
  for (const path of ["/transfer", "/pay", "/send", "/draw"]) {
    const res = await fetch(`${base}${path}`, { method: "POST", body: "{}" });
    assert.equal(res.status, 404, `${path} must not exist`);
    assert.match(((await res.json()) as { absent: string }).absent, /no transfer endpoint/);
  }

  await new Promise<void>((r) => daemon.close(() => r()));
});
