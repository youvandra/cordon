# @cordon/mcp

Cordon inside an MCP client. One config block, and the agent in front of you is
bounded by a contract it cannot reach.

```json
{
  "mcpServers": {
    "cordon": {
      "command": "npx",
      "args": ["-y", "@cordon/mcp"],
      "env": {
        "CORDON_ENV_FILE": "/Users/<you>/.cordon/cordon.env",
        "CORDON_MCP_NODE": "0x<node id>"
      }
    }
  }
}
```

`CORDON_ENV_FILE` is the key file `cordon-init` wrote, as an absolute path —
an MCP client starts the server with no shell, so nothing expands `~` or
`$HOME`. The key is read from that file and never appears in the client
config. The contract addresses default to the Arc testnet deployment this
version was built against; `CORDON_VAULT`, `CORDON_REGISTRY` and
`CORDON_RECORD` override them. Several files can be listed, comma-separated.

Node 22 or newer. The operator keys, the mandate and the daemon setup are in
the [repository](https://github.com/youvandra/cordon) and at
<https://getcordon.xyz/docs/walkthrough>.

Where the keyring holds several nodes, `CORDON_MCP_NODE` names the one this
server speaks for. Without it the server takes whichever key parsed first,
which is not a thing anybody can see; a node it holds no key for is refused by
name rather than silently falling back to another.

## Three tools

| | |
|---|---|
| `cordon_fetch(url, method?, body?)` | fetch, and pay if the seller asks. The recipient and the price come from the seller's own challenge |
| `cordon_status()` | what this mandate may still draw, and which node is the limit — often an ancestor |
| `cordon_spawn(label, budgetUsdc, …)` | a child mandate, narrower than this one. The key stays here |

## The tools that are missing, permanently

`cordon_transfer`, `cordon_pay`, `cordon_send`.

The absence is part of the fence rather than a gap in it. An agent that cannot
express "send money to X" cannot be talked into it, and a test asserts each of
those names stays unregistered. The tool list the website renders is
introspected out of a live server over the real protocol, so a tool that failed
to register disappears from the docs too.

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
