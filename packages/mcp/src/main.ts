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
import { keyFileAt } from "../../daemon/src/keyfile.ts";
import { ChainReleases } from "../../daemon/src/released.ts";
import { dirname, join } from "node:path";
import { ARC, DEPLOYMENT } from "../../fixtures/src/index.ts";
import { createMcpServer } from "./server.ts";

/* `npx` cannot pass node's own `--env-file`, so a published server reads the
   same files itself. Comma-separated, in order; like `--env-file`, a variable
   already set is never overwritten. The key stays in the file `init` guards
   and never has to be pasted into a client config. */
const envFiles = (process.env.CORDON_ENV_FILE ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter(Boolean);
for (const file of envFiles) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    console.error(`cordon: CORDON_ENV_FILE names ${file}, which could not be read: ${(error as Error).message}`);
    process.exit(1);
  }
}
/* A spawned child's key is written to the file the keys came from, not to a
   default that may be a different tree's. */
if (envFiles.length > 0) process.env.CORDON_KEY_FILE ??= envFiles[envFiles.length - 1];

/* The deployment this build was made against, so a config block needs no
   addresses. An explicit variable still wins. */
if (DEPLOYMENT) {
  process.env.CORDON_VAULT ??= DEPLOYMENT.vault;
  process.env.CORDON_REGISTRY ??= DEPLOYMENT.registry;
  process.env.CORDON_RECORD ??= DEPLOYMENT.record;
}

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
  keyFile: keyFileAt(config.keyFile),
  /* The same file the daemon keeps, so a release spent through one surface is
     not spent again through the other. */
  released: new ChainReleases({
    count: () => gate.refusalCount(),
    read: (id) => gate.refusal(id),
    live: (node) => gate.isLive(node),
    file: join(dirname(config.keyFile), "released-spent.json"),
  }),
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
