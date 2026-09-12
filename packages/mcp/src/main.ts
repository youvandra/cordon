#!/usr/bin/env node
/**
 * Cordon inside an MCP client. One config block, and the agent in front of you
 * is bounded by a contract it cannot reach.
 *
 *   { "mcpServers": { "cordon": {
 *       "command": "npx", "args": ["-y", "@cordon/mcp"],
 *       "env": { "CORDON_NODE_ME": "0x…", "CORDON_KEY_ME": "…",
 *                "CORDON_VAULT": "0x…", "CORDON_REGISTRY": "0x…" } } } }
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

const node = gate.nodes()[0];
if (!node) {
  console.error("cordon: no node configured; set CORDON_NODE_<label> and CORDON_KEY_<label>");
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
