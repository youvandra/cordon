import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Hex } from "viem";
import { createMcpServer, toBase6, fromBase6 } from "../src/server.ts";
import { ABSENT_TOOLS, TOOL_NAMES } from "../src/tools.ts";
import { renderRefusal } from "../src/render.ts";
import type { Gate, DrawOutcome } from "../../daemon/src/gate.ts";
import type { Offer } from "../../daemon/src/challenge.ts";
import type { Settler } from "../../daemon/src/settle.ts";

const NODE = ("0x" + "11".repeat(32)) as Hex;
const ROOT = ("0x" + "22".repeat(32)) as Hex;
const SELLER = "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57";

const OFFER: Offer = {
  scheme: "exact",
  network: "eip155:31337",
  asset: "0x3600000000000000000000000000000000000000",
  payTo: SELLER,
  amount: 2_400n,
};

/** A gate that answers however the test needs, so this file tests the surface
 *  rather than re-testing the contract. */
function stubGate(over: Partial<Record<string, unknown>> = {}): Gate {
  return {
    nodes: () => [NODE],
    headroom: async () => ({ available: 28_580_000n, boundBy: ROOT }),
    mandate: async () => ({ trancheCap6: 5_000_000n, concentrationBps: 3500, windowSeconds: 86_400n, maxDepth: 3 }),
    addOperator: () => "0x000000000000000000000000000000000000dEaD",
    spawn: async () => ({ node: ("0x" + "33".repeat(32)) as Hex, txHash: ("0x" + "44".repeat(32)) as Hex }),
    draw: async () => ({ released: true, reason: "none" }) as DrawOutcome,
    ...over,
  } as unknown as Gate;
}

const settler: Settler = { async settle() { return { proof: "test" }; } };

async function connect(gate: Gate, transport?: unknown) {
  const server = createMcpServer({
    gate, settler, node: NODE,
    acceptable: { networks: ["eip155:31337"], assets: [OFFER.asset] },
    explorer: "https://testnet.arcscan.app",
    transport: transport as never,
    newOperatorKey: () => ("0x" + "ab".repeat(32)) as Hex,
  });
  const client = new Client({ name: "test", version: "0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

test("the tool list is exactly three, and the fourth is the one that is missing", async () => {
  const client = await connect(stubGate());
  const { tools } = await client.listTools();
  const names: string[] = tools.map((t) => t.name).sort();

  /* Before the equality check, not after: `assert.deepEqual` carries an
     `asserts` signature, so past that line TypeScript knows `names` holds only
     the three tools that exist and asking whether it contains a transfer tool
     stops compiling. The type system makes this test's point one step earlier,
     which is a good problem to have and a confusing error to read. */
  for (const absent of ABSENT_TOOLS) {
    assert.ok(!names.includes(absent), `${absent} must not exist`);
  }

  assert.deepEqual(names, [...TOOL_NAMES].sort());
});

test("no tool anywhere takes a recipient", async () => {
  const client = await connect(stubGate());
  const { tools } = await client.listTools();

  // The claim is structural: an agent cannot express "send money to X" because
  // nothing it can call accepts an X.
  for (const tool of tools) {
    const fields = Object.keys(tool.inputSchema?.properties ?? {});
    for (const field of fields) {
      assert.ok(
        !/^(to|recipient|payee|destination|address|counterparty)$/i.test(field),
        `${tool.name} exposes ${field}, which lets an agent name a recipient`,
      );
    }
  }
});

test("asking to transfer is an error, not something near it", async () => {
  const client = await connect(stubGate());

  for (const name of ABSENT_TOOLS) {
    /* The client types `name` to the tools the server declares, which is the
       point being made — asking for these has to go through a cast because
       they do not exist. */
    const result = (await client.callTool({
      name, arguments: { to: SELLER, amount: "5" },
    } as never)) as { isError: boolean; content: { text: string }[] };
    assert.equal(result.isError, true, `${name} was not rejected`);
    assert.match((result.content as { text: string }[])[0].text, /not found/);
  }
});

test("a refusal reads as a decision, names the ancestor, and points at the record", async () => {
  const refused: DrawOutcome = {
    released: false,
    reason: "window-budget",
    breachedAt: ROOT,
    refusalId: 7n,
    txHash: ("0x" + "cd".repeat(32)) as Hex,
  };

  const rendered = renderRefusal(refused, OFFER, "https://testnet.arcscan.app");

  assert.match(rendered, /^REFUSED/, "it says so first");
  assert.match(rendered, /the window is spent/, "in words, not a code");
  assert.match(rendered, new RegExp(ROOT.slice(0, 10)), "and names the node that stopped it");
  assert.match(rendered, /refusal #7/);
  assert.match(rendered, /testnet\.arcscan\.app\/tx\/0xcdcd/, "with somewhere to go and check");
  assert.match(rendered, /Nothing was paid and no budget was consumed/);
  assert.match(rendered, /cannot be retried/, "a refusal is final, not an error to loop on");
  assert.match(rendered, /\$0\.0024/, "and the figure is the seller's own price");
});

test("cordon_status says when an ancestor is the limit, not this node", async () => {
  const client = await connect(stubGate());
  const result = await client.callTool({ name: "cordon_status", arguments: {} });
  const shown = (result.content as { text: string }[])[0].text;

  assert.match(shown, /28\.58/);
  assert.match(shown, /An ancestor is the binding constraint/);
});

test("cordon_spawn never hands the agent a key", async () => {
  const client = await connect(stubGate());
  const result = await client.callTool({
    name: "cordon_spawn",
    arguments: { label: "research", budgetUsdc: "25.00" },
  });
  const shown = (result.content as { text: string }[])[0].text;

  assert.ok(!shown.includes("ab".repeat(32)), "the private key must never be rendered");
  assert.match(shown, /0x000000000000000000000000000000000000dEaD/, "only the address it controls");
  assert.match(shown, /cannot be widened later/);
});

test("USDC amounts are parsed as strings, so no float ever touches money", () => {
  assert.equal(toBase6("25.00"), 25_000_000n);
  assert.equal(toBase6("0.008"), 8_000n);
  assert.equal(toBase6("0.000001"), 1n);
  assert.equal(toBase6("1000000"), 1_000_000_000_000n);
  assert.equal(fromBase6(28_580_000n), "28.58");
  for (const bad of ["1.2345678", "-1", "1e6", "", "abc"]) {
    assert.throws(() => toBase6(bad), `accepted ${bad}`);
  }
});
