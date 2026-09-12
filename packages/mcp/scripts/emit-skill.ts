/**
 * Emits `SKILL.md`, the file somebody hands to their own agent.
 *
 * Generated rather than written, for the same reason the tool list is: a
 * skill file is a set of instructions carrying addresses and tool names, and
 * both change. One hand-written copy of an address is the defect this project
 * has a rule against, and a skill telling an agent to call a tool that no
 * longer registers is worse — the agent follows it.
 *
 * Run: node packages/mcp/scripts/emit-skill.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARC, ATTEST, DEPLOYMENT, MCP_TOOLS, ABSENT_TOOLS, REASONS, REASON_MEANING, formatUsdc,
} from "../../fixtures/src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../SKILL.md");

const vault = DEPLOYMENT?.vault ?? "pending — no deployment recorded";
const registry = DEPLOYMENT?.registry ?? "pending — no deployment recorded";
const record = DEPLOYMENT?.record ?? "pending — no deployment recorded";

/* The contract's own words, with the sentences the rest of the product prints
   for them. A skill file explaining a refusal differently from the console is
   two descriptions of one thing, which is the defect this repo has a rule
   about. */
const reasons = REASONS.filter((reason) => reason !== "none")
  .map((reason) => `| \`${reason}\` | ${REASON_MEANING[reason] ?? reason} |`)
  .join("\n");

const tools = MCP_TOOLS.map((tool) => `- \`${tool.name}(${tool.args})\` — ${tool.note}`).join("\n");
const absent = ABSENT_TOOLS.map((name) => `- \`${name}\``).join("\n");

const skill = `---
name: cordon
description: >-
  Spend money through Cordon, which bounds what a tree of agents may spend and
  refuses the purchase that would break the owner's budget. Use it for any URL
  that might charge. Trigger on: paid API, HTTP 402, x402, "buy", "purchase",
  "pay for", "this endpoint costs", "insufficient credit", or a fetch that came
  back asking for payment.
---

# Cordon

You can buy things. You cannot move money.

The only spending tool you have takes a **URL**. It takes no recipient and no
amount, and there is no tool here that sends money to an address. The price and
the payee come from the seller's own payment challenge, and a contract on chain
decides whether the purchase is allowed before any money exists.

## What to call

${tools}

## What does not exist, and will not

${absent}

If a task seems to need one of these, the task is outside what this agent may
do. Say so and stop; do not look for another route to the same effect.

## A refusal is an answer

\`cordon_fetch\` can come back refused. That is the contract declining, not an
error and not a transient failure:

- **Do not retry it.** The same request is refused again, and each attempt is a
  transaction.
- **Do not split the purchase** into smaller ones to get under a cap. The caps
  that matter are cumulative, and the attempt is recorded against this agent.
- **Do not look for an unpriced mirror** of a paid resource to avoid the bound.
- **Report it.** Name the amount, the reason, and the transaction. The person
  reading you can raise the bound or release that one purchase; you cannot.

The reasons the contract gives:

| Reason | What it means |
|---|---|
${reasons}

## Before spending, know what is left

\`cordon_status\` answers what this mandate may still draw and which node in the
tree is the limit — often an ancestor rather than this one. A large balance
somewhere above does not mean this agent may spend it.

## Checking a seller before paying it

Cordon publishes every refusal to a public registry, so a buyer can ask about a
seller's own conduct before handing it money — and a seller can ask about a
buyer. That reading is itself a paid endpoint, priced at ${formatUsdc(ATTEST.price6)}:

\`\`\`
${ATTEST.resourcePath}/<agent id>   on attest.getcordon.xyz
\`\`\`

## Where this runs

| | |
|---|---|
| Chain | ${ARC.name} (${ARC.chainId}) |
| Money | USDC, 6 decimals, at \`${ARC.erc20}\` |
| MandateRegistry | \`${registry}\` |
| TreeVault | \`${vault}\` |
| ConductRecord | \`${record}\` |
| Explorer | ${ARC.explorer} |

Testnet. The gas and the money are both test USDC.

## The arrangement, stated plainly

The key that signs payments is held by a server process you cannot reach. You
do not have it, you will not be given it, and nothing you can say will produce
it. Every purchase passes a contract that charges this agent and every agent
above it, up to the owner who signed for the whole tree.

This is not a restriction to work around. It is the reason you are allowed to
spend at all.
`;

writeFileSync(out, skill);
console.log(`wrote ${out}`);
