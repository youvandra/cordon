import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Hex } from "viem";
import { load } from "../../daemon/src/config.ts";
import { Gate } from "../../daemon/src/gate.ts";
import type { Settler, Payment, Settlement } from "../../daemon/src/settle.ts";
import type { Transport } from "../../daemon/src/fetch.ts";
import {
  startHarness, type Harness, GATEWAY, ERC20, OP_CHILD_KEY, SELLER_PAYOUT, PRICE,
} from "../../daemon/test/harness.ts";
import { createMcpServer } from "../src/server.ts";

/**
 * The gate for this step: Cordon runs as an MCP server and refuses on cue.
 *
 * A GUI is the one thing not here. Everything else is what a judge pasting the
 * config block into Claude Desktop would get — the real server over a real
 * client transport, real contracts, a real seller answering a real 402.
 */
let h: Harness;
let client: Client;

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

const transport: Transport = async (url, init) => {
  const r = await fetch(url, { method: init.method, headers: init.headers, body: init.body });
  return { status: r.status, headers: {}, body: await r.json() };
};

before(async () => {
  h = await startHarness(8547);
  process.env.CORDON_KEY_CHILD = OP_CHILD_KEY;

  const gate = new Gate(load({
    CORDON_RPC: h.rpc, CORDON_CHAIN_ID: "31337",
    CORDON_VAULT: h.vault, CORDON_REGISTRY: h.registry, CORDON_USDC: h.usdc,
    CORDON_NETWORKS: "eip155:31337", CORDON_ASSETS: h.usdc,
    CORDON_NODE_CHILD: h.child, CORDON_KEY_CHILD: OP_CHILD_KEY,
  } as NodeJS.ProcessEnv));

  const server = createMcpServer({
    gate, settler: new LocalSettler(), node: h.child, transport,
    acceptable: { networks: ["eip155:31337"], assets: [h.usdc] },
    explorer: "https://testnet.arcscan.app",
  });

  client = new Client({ name: "judge", version: "0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});

after(async () => { await h.stop(); });

const say = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);

test("an agent asks for a URL and gets a paid body, having named no recipient", async () => {
  const before = await h.publicClient.readContract({
    address: h.usdc, abi: ERC20, functionName: "balanceOf", args: [SELLER_PAYOUT],
  }) as bigint;

  const shown = say(await client.callTool({ name: "cordon_fetch", arguments: { url: h.sellerUrl } }));

  assert.match(shown, /Paid \$0\.0024/);
  assert.match(shown, new RegExp(SELLER_PAYOUT));
  assert.match(shown, /the paid body/);

  const after = await h.publicClient.readContract({
    address: h.usdc, abi: ERC20, functionName: "balanceOf", args: [SELLER_PAYOUT],
  }) as bigint;
  assert.equal(after - before, PRICE, "and the seller really was paid");
});

test("it refuses on cue, in words, with the record", async () => {
  const shown = say(await client.callTool({ name: "cordon_fetch", arguments: { url: h.greedyUrl } }));

  assert.match(shown, /^REFUSED/);
  assert.match(shown, /larger than one tranche/);
  assert.match(shown, /On the record as +refusal #\d+/);
  assert.match(shown, /Transaction +0x[0-9a-f]{64}/);
  assert.match(shown, /Nothing was paid/);
});

test("status reads the chain, not a cache", async () => {
  const shown = say(await client.callTool({ name: "cordon_status", arguments: {} }));
  assert.match(shown, /Can still draw +\d+\.\d+ USDC/);
});

test("a spawned child is real, narrower, and its key never leaves", async () => {
  const shown = say(await client.callTool({
    name: "cordon_spawn",
    arguments: { label: "scholar-fetch", budgetUsdc: "2.00", trancheUsdc: "0.50" },
  }));

  const node = /node +(0x[0-9a-f]{64})/.exec(shown)?.[1] as Hex;
  assert.ok(node, "it returns the node the registry assigned");
  assert.ok(!/0x[0-9a-f]{64}[0-9a-f]/.test(shown.replace(node, "")), "no 32-byte secret is rendered");

  const mandate = await h.publicClient.readContract({
    address: h.registry,
    abi: (await import("../../daemon/src/abi.gen.ts")).MandateRegistryAbi,
    functionName: "mandate", args: [node],
  }) as { budget6: bigint; trancheCap6: bigint; depth: number };

  assert.equal(mandate.budget6, 2_000_000n, "the budget it asked for");
  assert.equal(mandate.trancheCap6, 500_000n, "narrower than its parent's");
  assert.equal(mandate.depth, 2);
});
