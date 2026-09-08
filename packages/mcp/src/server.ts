/**
 * Cordon as an MCP server.
 *
 * This is the surface that can be run by someone who has never seen the
 * repository: one config block in Claude Desktop, a mandate id, and the agent
 * in front of them is bounded by a contract. Nothing here decides anything —
 * the daemon holds the key and the contract makes the decision. This file
 * turns three verbs into tools and, above all, makes a refusal legible.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { Gate } from "../../daemon/src/gate.ts";
import { cordonFetch, httpTransport, type Transport } from "../../daemon/src/fetch.ts";
import type { Settler } from "../../daemon/src/settle.ts";
import type { Acceptable, Offer } from "../../daemon/src/challenge.ts";
import type { DrawOutcome } from "../../daemon/src/gate.ts";
import { renderPaid, renderRefusal } from "./render.ts";

export interface McpDeps {
  gate: Gate;
  settler: Settler;
  acceptable: Acceptable;
  /** The node this session acts as. The agent cannot choose another. */
  node: Hex;
  explorer?: string;
  transport?: Transport;
  /** Injected in tests. Real runs generate one and keep it in memory. */
  newOperatorKey?: () => Hex;
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer(
    { name: "cordon", version: "0.1.0" },
    {
      instructions:
        "Cordon bounds what this agent can spend. Use cordon_fetch for any URL " +
        "that may charge; it pays through a contract that can refuse. There is " +
        "no tool here that sends money to an address, and a refusal is a final " +
        "answer rather than an error to retry.",
    },
  );

  const transport = deps.transport ?? httpTransport;
  const newKey = deps.newOperatorKey ?? generatePrivateKey;

  server.registerTool(
    "cordon_fetch",
    {
      description:
        "Fetch a URL. If it answers 402, pay for it through Cordon and return the " +
        "body. The recipient and the price come from the seller's own challenge, " +
        "not from you. May return a refusal, which is final.",
      inputSchema: {
        url: z.string().url().describe("The URL to fetch."),
        method: z.string().optional().describe("HTTP method. Defaults to GET."),
        body: z.string().optional().describe("Request body, for POST and friends."),
      },
    },
    async ({ url, method, body }) => {
      const result = await cordonFetch(
        { node: deps.node, url, method, body },
        { gate: deps.gate, settler: deps.settler, acceptable: deps.acceptable, transport },
      );

      if ("free" in result && result.free) {
        const shown = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
        return text(`${url} charged nothing.\n\n${shown}`);
      }

      if (!result.paid) {
        const refused = result as { refusal: DrawOutcome; offer: Offer };
        return text(renderRefusal(refused.refusal, refused.offer, deps.explorer));
      }

      const paid = result as { draw: DrawOutcome; offer: Offer; body: unknown };
      return text(renderPaid(paid.draw, paid.offer, paid.body));
    },
  );

  server.registerTool(
    "cordon_spawn",
    {
      description:
        "Register a child mandate under this one for a sub-agent. The child can " +
        "only ever be narrower than its parent; the contract refuses a wider one " +
        "whoever asks. The key for the child is held here, not by any agent.",
      inputSchema: {
        label: z.string().describe("What this sub-agent is for. For the record."),
        budgetUsdc: z.string().describe('Window budget in USDC, e.g. "25.00".'),
        trancheUsdc: z.string().optional().describe("Per-draw cap. Defaults to the parent's."),
        concentrationPct: z.number().optional().describe("Percent of the window one counterparty may take."),
      },
    },
    async ({ label, budgetUsdc, trancheUsdc, concentrationPct }) => {
      const parent = (await deps.gate.mandate(deps.node)) as {
        trancheCap6: bigint;
        concentrationBps: number;
      };

      /* The child's key is generated here and never leaves. It is not returned
         to the agent, not logged, and not written down: the agent holds no key
         is the claim, and a key it could read is a key it holds. */
      const key = newKey();
      const operator = deps.gate.addOperator(key);

      const { node, txHash } = await deps.gate.spawn(deps.node, {
        operator,
        budget6: toBase6(budgetUsdc),
        trancheCap6: trancheUsdc ? toBase6(trancheUsdc) : parent.trancheCap6,
        concentrationBps:
          concentrationPct !== undefined ? Math.round(concentrationPct * 100) : parent.concentrationBps,
      });

      return text(
        [
          `Spawned "${label}".`,
          `  node       ${node}`,
          `  operator   ${operator}`,
          `  budget     ${budgetUsdc} USDC`,
          txHash ? `  tx         ${txHash}` : "",
          "",
          "Every draw this child makes also debits this mandate and every one",
          "above it. It cannot be widened later.",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "cordon_status",
    {
      description:
        "What this mandate may still spend, and which node in the tree is the " +
        "limit. The answer is often an ancestor rather than this node.",
      inputSchema: {},
    },
    async () => {
      const { available, boundBy } = await deps.gate.headroom(deps.node);
      const own = boundBy.toLowerCase() === deps.node.toLowerCase();
      return text(
        [
          `Can still draw   ${fromBase6(available)} USDC`,
          `Limited by       ${own ? "this mandate" : boundBy}`,
          own ? "" : "An ancestor is the binding constraint, not this node's own budget.",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );

  return server;
}

/** "25.00" -> 25000000n. String in, so no float ever touches money. */
export function toBase6(usdc: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!match) throw new Error(`not a USDC amount: ${usdc}`);
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

export function fromBase6(base6: bigint): string {
  return `${base6 / 1_000_000n}.${(base6 % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;
}

export type { Address };
