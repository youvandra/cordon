# @cordon/mcp

Cordon inside an MCP client. One config block, and the agent in front of you is
bounded by a contract it cannot reach.

```json
{
  "mcpServers": {
    "cordon": {
      "command": "node",
      "args": ["/path/to/cordon/packages/mcp/src/main.ts"],
      "env": {
        "CORDON_VAULT": "0x…",
        "CORDON_REGISTRY": "0x…",
        "CORDON_NODE_ME": "0x…",
        "CORDON_KEY_ME": "…",
        "CORDON_RPC": "https://rpc.testnet.arc.io"
      }
    }
  }
}
```

Not `npx -y @cordon/mcp`: this package is private and unpublished, and a block
that sends a reader to a 404 is worse than one that names a path.

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
