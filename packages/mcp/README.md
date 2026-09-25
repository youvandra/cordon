# cordon-mcp

**An agent that can buy things and cannot move money.** One config block, and
the assistant in front of you spends against a mandate enforced by a contract
it has no way to reach.

[![npm](https://img.shields.io/npm/v/cordon-mcp?color=6E56CF)](https://www.npmjs.com/package/cordon-mcp)
[![Node](https://img.shields.io/badge/Node-22%2B-5FA04E)](#requirements)
[![x402](https://img.shields.io/badge/x402-exact-6E56CF)](#paying-for-things)
[![ERC-8004](https://img.shields.io/badge/ERC--8004-identity%20%2B%20reputation-B5342A)](#the-record)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

The limit is not a prompt, a policy or a wrapper around a key. It is a mandate
on chain, and every draw debits every ancestor up to the root — so a tree of
agents cannot spend past a total none of them can see. A refusal comes back as
an answer the agent can read, never as a crash, and it is written to the
agent's own record whether or not anyone is watching.

## Install

Nothing to install. Point your MCP client at it:

```json
{
  "mcpServers": {
    "cordon": {
      "command": "npx",
      "args": ["-y", "cordon-mcp"],
      "env": {
        "CORDON_ENV_FILE": "/Users/<you>/.cordon/cordon.env",
        "CORDON_MCP_NODE": "0x<node id>"
      }
    }
  }
}
```

Claude Desktop, Claude Code, Cursor and anything else speaking MCP over stdio
read a block of this shape. Restart the client after editing it.

## Before that block works

This server speaks for a mandate that already exists. Two things have to be in
place, and both come from the main repository:

1. **A mandate**, opened by an owner who funded it. The owner signs; nothing
   here can open one for them.
2. **A key file**, written by `cordon-init`. It holds the operator key for each
   node, and this server reads it. The key never goes in the client config.

The [walkthrough](https://getcordon.xyz/docs/walkthrough) is the short path
through both.

## Environment

| Variable | |
|---|---|
| `CORDON_ENV_FILE` | **Absolute path** to the key file `cordon-init` wrote. An MCP client starts the server with no shell, so nothing expands `~` or `$HOME`. Several files may be listed, comma-separated, in order. |
| `CORDON_MCP_NODE` | Which node this server speaks for, when the key file holds more than one. Without it the server takes whichever key parsed first, which is not a thing anybody can see. A node it holds no key for is refused by name. |
| `CORDON_VAULT` `CORDON_REGISTRY` `CORDON_RECORD` | The contracts. They default to the deployment this version was built against; an explicit value always wins. Set all three to point a published build at a different chain. |

A variable already set in the environment is never overwritten by the key file,
so the block above can override anything the file carries.

## The three tools

| | |
|---|---|
| `cordon_fetch(url, method?, body?)` | Fetch, and pay if the seller asks. The recipient and the price come from the seller's own challenge, never from the agent. |
| `cordon_status()` | What this mandate may still draw, and which node is the limit — often an ancestor rather than this one. |
| `cordon_spawn(label, budgetUsdc, …)` | A child mandate, narrower than this one in every bound. The child's key is generated here and stays here. |

### Paying for things

`cordon_fetch` answers an x402 `exact` challenge. The seller states its price
and its address; the agent states neither. What the agent can do is ask for a
URL, and what the contract decides is whether that purchase fits inside the
mandate. A purchase that does not fit comes back as a refusal with a reason and
the node that refused it.

### The record

Every refusal is written to the node's ERC-8004 record, by the contract that
refused it. It is not a log this process keeps and could lose; it is on chain,
and it is readable by anyone deciding whether to serve this agent at all.

## The tools that are missing, permanently

`cordon_transfer`, `cordon_pay`, `cordon_send`.

The absence is part of the fence rather than a gap in it. An agent that cannot
express "send money to X" cannot be talked into it — by a prompt injection, a
confused user or its own reasoning. A test asserts each of those names stays
unregistered, and the tool list the website renders is introspected out of a
live server over the real protocol, so a tool that failed to register
disappears from the documentation too.

## Chains

The rail follows the chain, and the server picks it rather than asking:

| | |
|---|---|
| **Arc testnet** | Circle's Gateway. A draw lands in the operator's Gateway balance and settlement releases it, which costs Circle's fee on top of the price. |
| **Anything else** | The direct rail. A draw lands in the operator's own balance and settlement is the authorisation alone — no fee on top, and so no floor under the price. |

Both are bounded identically. Caps, windows, concentration and the ancestor
debit are decided before a settler is reached.

## SKILL.md

Tools say what an agent may call. They do not say that a refusal is final, that
retrying one costs gas and lands on the agent's own record, or that splitting a
purchase to get under a cap is the behaviour the cap exists to catch.

[`SKILL.md`](SKILL.md) is that, and it is generated — from the same fixtures
the tools and the surfaces read, so it cannot describe a tool that no longer
registers or explain a refusal differently from the console.

```bash
node scripts/emit-skill.ts    # rewrites SKILL.md
node scripts/emit-tools.ts    # rewrites the tool list the website renders
```

## Troubleshooting

| What you see | What it is |
|---|---|
| `no node configured` | `CORDON_ENV_FILE` was not read. It must be an absolute path; a client starts this server with no shell. |
| `CORDON_MCP_NODE is 0x… and this process holds no key for it` | The key file holds other nodes. The message lists the ones it does hold. |
| The client shows no tools | stdout belongs to the protocol. If something in the chain prints to it, the transport is corrupt — this server sends every word of its own to stderr. |
| A purchase is refused | That is the product working. `cordon_status()` names the node that is the limit, and it is often an ancestor. |

## Requirements

Node 22 or newer.

## Running it from a clone

```bash
node /path/to/cordon/packages/mcp/src/main.ts
```

Same environment, same server. The published build is this file bundled.

## Tests

```bash
npm test
```

`mcp.test.ts` is the protocol surface and the absent names. `live.test.ts` runs
the real server over a real client transport against real contracts and a real
seller answering a real 402 — everything a judge pasting the config block would
get, minus the GUI. `boot.test.ts` starts `main.ts` the way a client starts it,
which is the one path the other two do not exercise, and which was broken for
as long as nothing ran it.

## Links

[Repository](https://github.com/youvandra/cordon) ·
[The argument](https://getcordon.xyz) ·
[Documentation](https://getcordon.xyz/docs) ·
[Owner's console](https://getcordon.xyz/console/) ·
[Changelog](https://github.com/youvandra/cordon/blob/main/CHANGELOG.md)

## Licence

MIT. See [LICENSE](LICENSE).
