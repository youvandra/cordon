#!/usr/bin/env node
/**
 * Cordon inside an MCP client. One config block, and the agent in front of you
 * is bounded by a contract it cannot reach.
 *
 *   { "mcpServers": { "cordon": {
 *       "command": "node", "args": ["/path/to/cordon/packages/mcp/src/main.ts"],
 *       "env": { "CORDON_NODE_ME": "0x…", "CORDON_KEY_ME": "…",
 *                "CORDON_VAULT": "0x…", "CORDON_REGISTRY": "0x…" } } } }
 *
 * A path rather than `npx -y @cordon/mcp`, because this package is private and
 * unpublished: the npx form is a 404 until `npm publish` says otherwise.
 *
 * stdout belongs to the protocol. Anything this process wants to say goes to
 * stderr, or it corrupts the transport.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { load } from "../../daemon/src/config.ts";
import { Gate } from "../../daemon/src/gate.ts";
import { CircleSettler } from "../../daemon/src/settle.ts";
import { ARC } from "../../fixtures/src/index.ts";
import { createMcpServer } from "./server.ts";

const config = load(process.env);
const gate = new Gate(config);

/* One MCP server speaks for one node, and a keyring holding several has no
   natural first. Naming it beats the order the environment happened to parse
   in, which is not a thing anybody can see. */
const configured = gate.nodes();
const asked = process.env.CORDON_MCP_NODE?.toLowerCase();
const node = asked ? configured.find((n) => n.toLowerCase() === asked) : configured[0];
if (!node) {
  console.error(
    asked
      ? `cordon: CORDON_MCP_NODE is ${asked} and this process holds no key for it. It holds: ${configured.join(", ") || "none"}`
      : "cordon: no node configured; set CORDON_NODE_<label> and CORDON_KEY_<label>",
  );
  process.exit(1);
}

const server = createMcpServer({
  gate,
  settler: new CircleSettler({
    publicClient: gate.publicClientForSettlement,
    walletFor: (node) => gate.signerFor(node),
    chainId: config.chainId,
  }),
  acceptable: { networks: config.networks, assets: config.assets },
  node,
  explorer: config.chainId === ARC.chainId ? ARC.explorer : undefined,
});

console.error(`cordon mcp: node ${node} on chain ${config.chainId}`);
await server.connect(new StdioServerTransport());
