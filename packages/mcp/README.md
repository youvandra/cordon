# cordon-mcp

**An agent that can buy things and cannot spend past the mandate its owner
signed.** One config block, and
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

**Contents** ·
[Install](#install) ·
[Environment](#environment) ·
[Tools](#the-three-tools) ·
[Refusal reasons](#why-a-purchase-was-refused) ·
[A session](#a-session-end-to-end) ·
[What holds what](#what-holds-what) ·
[Chains](#chains) ·
[Troubleshooting](#troubleshooting)

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
| `CORDON_KEY_FILE` | Where a spawned child's key is written, before the spawn is sent. Defaults to the last file in `CORDON_ENV_FILE`. A child whose key was never written is a mandate nobody can sign for once this process restarts. |
| `CORDON_NODE_<label>` | One operator key per node, read from the key file rather than set by hand. `cordon-init` writes them; `CORDON_MCP_NODE` picks which one this server speaks for. |

A variable already set in the environment is never overwritten by the key file,
so the block above can override anything the file carries.

Nothing here takes a private key. `CORDON_ENV_FILE` is a path; the keys stay in
the file, which is `0600`, and the client config can be pasted into an issue
without leaking anything.

## The three tools

### `cordon_fetch`

Fetch a URL, and pay if the seller asks. The recipient and the price come from
the seller's own x402 challenge, never from the agent.

| Parameter | Type | |
|---|---|---|
| `url` | string, required | The URL to fetch. Must parse as a URL. |
| `method` | string, optional | HTTP method. Defaults to `GET`. |
| `body` | string, optional | Request body, for `POST` and friends. |

Three answers come back, and they read differently on purpose.

**Free** — the seller never asked for money:

```
https://example.com/thing charged nothing.

<the body>
```

**Paid**:

```
Paid 1.00 USDC to 0x6302… on eip155:11155111.
Tranche credited to 0xe21a…
Draw 0x1525a8ce…

<the body>
```

**Refused** — an answer, never an exception:

```
REFUSED — the purchase is larger than one draw may be.

The purchase        2.00 USDC to 0x6302…
The bound that hit  tranche-cap
Enforced at         0xe07a70dd…
On the record as    refusal #1
Transaction         0x41962813…

Nothing was paid and no budget was consumed. This is a decision the
contract made; it cannot be retried past the bound that produced it.
```

`Enforced at` is the node whose bound stopped it, which is often an ancestor
rather than the agent's own — the thing no per-agent limit can express.

### `cordon_status`

No parameters.

```
Can still draw   4.000000 USDC
Limited by       0x6052919a…
An ancestor is the binding constraint, not this node's own budget.
```

The last line appears only when the limit is above this node.

### `cordon_spawn`

A child mandate for a sub-agent, narrower than this one in every bound. The
contract refuses a wider child whoever asks.

| Parameter | Type | |
|---|---|---|
| `label` | string, required | What the sub-agent is for, in one line. Written beside its key and onto its ERC-8004 identity as a stated purpose. A description, not a bound. |
| `budgetUsdc` | string, required | Window budget in USDC, as a decimal string: `"25.00"`. A string so no float ever touches money. |
| `trancheUsdc` | string, optional | Per-draw cap. Defaults to the parent's. |
| `concentrationPct` | number, optional | Percent of the window one counterparty may take. Defaults to the parent's. |

The child's key is generated here, written to the key file, and never returned
or logged. An agent that could read it would be an agent that holds a key.

## Why a purchase was refused

Six reasons, and the contract returns exactly one. They are the same words the
console prints and the same words written to the record.

| Reason | |
|---|---|
| `revoked` | The mandate for this branch was cut. Nothing below a cut node spends again. |
| `tranche-cap` | The purchase is larger than one draw may be. |
| `window-budget` | The window is spent, on this node or an ancestor. |
| `concentration` | This recipient has taken its share of the window. |
| `vault-balance` | Every bound passed and the treasury is empty. |
| `lifetime-cap` | The total this mandate was signed for is spent, and it does not come back. |

Only `window-budget` and `concentration` pass with time, when the window rolls.
`lifetime-cap` and `revoked` never do. Splitting a purchase to get under a cap
is the behaviour the cap exists to catch, and the attempt is recorded.

## A session, end to end

What an assistant holding a $5 mandate with a $1 per-draw cap actually sees.

```
> cordon_status()
Can still draw   5.000000 USDC
Limited by       this mandate

> cordon_fetch({ url: "https://demo-seller.example/snapshot" })
Paid 1.00 USDC to 0x6302… on eip155:11155111.
Draw 0x1525a8ce…

{ "block": 11785656, "gasPrice": "1.04 gwei" }

> cordon_fetch({ url: "https://demo-seller.example/bulk" })
REFUSED — the purchase is larger than one draw may be.
The bound that hit  tranche-cap
On the record as    refusal #1

> cordon_status()
Can still draw   4.000000 USDC
```

Two things in that transcript are the argument. The refusal consumed no
budget — headroom is `4.000000` after it, the same as before it — and it left
a numbered record the seller can read without asking anyone's permission.

<a id="paying-for-things"></a>

## Paying for things

`cordon_fetch` answers an x402 `exact` challenge. The seller states its price
and its address; the agent states neither. What the agent can do is ask for a
URL, and what the contract decides is whether that purchase fits inside the
mandate. A purchase that does not fit comes back as a refusal with a reason and
the node that refused it.

<a id="the-record"></a>

## The record

Every refusal is written to the node's ERC-8004 record, by the contract that
refused it. It is not a log this process keeps and could lose; it is on chain,
and it is readable by anyone deciding whether to serve this agent at all.

Publishing needs an ERC-8004 identity bound to the node, held by the node's
own operator. Without one, refusals are still enforced and simply go
unpublished — the bound never depends on the record.

## What holds what

| | |
|---|---|
| **The agent** | Nothing. It can name a URL. It cannot name a recipient, an amount, or a key. |
| **This server** | The operator key for one node, read from a `0600` file. It signs draws and settlements and nothing else. |
| **The contracts** | The money, and every bound. A draw debits every ancestor up to the root before it releases anything. |
| **The owner** | The only key that can open a mandate, fund it, release a refusal or cut a branch. None of those are reachable from here. |

A key that reaches this process is still bounded: it can spend only what the
mandate already permits, and the tranche it draws is the size of the purchase
in front of it. Losing it is bounded by the same caps that bound normal use,
which is the difference between a bounded key and a hot wallet.

## The tools that are missing, permanently

`cordon_transfer`, `cordon_pay`, `cordon_send`, `cordon_withdraw`,
`cordon_approve`.

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
| **Arc testnet** (5042002) | Circle's Gateway. A draw lands in the operator's Gateway balance and settlement releases it, which costs Circle's fee on top of the price. Gas there is USDC, so an operator needs one asset. |
| **Ethereum Sepolia** (11155111) and anything else | The direct rail. A draw lands in the operator's own balance and settlement is the authorisation alone — no fee on top, and so no floor under the price. Gas is the chain's own token, so an operator needs two. |

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
| `no such mandate` on every call | The contracts this build defaults to are not the ones the node was opened in. A node id is derived from the registry address, so a redeployed registry means new node ids — set `CORDON_VAULT`, `CORDON_REGISTRY` and `CORDON_RECORD` together, or take a build matching the deployment. |
| Every draw fails with an insufficient-funds error | The operator has no gas. Off Arc that is the chain's own token and not the USDC it spends, so an operator with a tranche and no ETH cannot send the draw that would earn it. Fund the operator address, not the vault. |
| `cordon_spawn` succeeds and the child cannot sign later | The child's key is written to `CORDON_KEY_FILE`, which defaults to the last file in `CORDON_ENV_FILE`. If that path is not writable the spawn still lands on chain and the key is lost with the process. |

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
