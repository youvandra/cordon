# @cordon/daemon

The product. It holds the operator keys, reads a seller's payment challenge,
asks the vault for exactly what that seller asked for, and signs the payment
the contract allowed. Every other surface — MCP, the proxy, plain HTTP —
forwards to this.

```bash
node --env-file=.env.live --env-file="$HOME/.cordon/cordon.env" src/main.ts
```

It prints the nodes it holds keys for and **refuses to start misconfigured**. A
daemon that starts anyway is one that discovers a missing address halfway
through a payment, and it is holding a key while it does.

## The keys

The daemon is the only thing that ever needs one, so the daemon makes them:

```bash
npm run init -- --nodes 4
```

Writes `~/.cordon/cordon.env` at `0600` and prints **addresses only** — the
public half, and the part you paste into the console when you sign a mandate.
No private key is printed, and there is a test asserting that. A second run
refuses rather than overwriting: a key in that file may already be the operator
of a live mandate, and an operator is set at `open` and cannot be repointed.

Each address needs gas and holds no USDC by design. The vault tops it up one
purchase at a time.

## Endpoints

| | |
|---|---|
| `GET /status` | every node this process holds a key for, its headroom and its mandate |
| `POST /fetch` | `{ node, url, method?, body? }` |
| `POST /spawn` | `{ node, budget6, trancheCap6, … }` — a child, narrower than its parent |
| *absent* | there is no transfer endpoint, and there will not be one |

`POST /spawn` refuses an `operator` argument: a node whose key this process
does not hold can neither draw nor be stopped by it, and a child funded from
outside the tree is the shape the whole product exists to prevent.

A purchase and a refusal are both `200`. A refusal is an answer, not a failure,
so it does not arrive as a `5xx` for a retry loop to hammer.

## What one purchase does

1. Request the URL. Free? The body comes back and nothing touches the tree.
2. A `402` arrives, naming the seller's own price and payee. **Both come from
   the seller** — never from the agent, never from us.
3. `TreeVault.draw(node, counterparty, amount6)`. The contract checks every
   bound on every node up to the root.
4. Allowed: the tranche lands in this operator's Gateway balance, the daemon
   signs an EIP-3009 authorisation for exactly the price, and the seller
   collects it.
5. Refused: nothing moved, no budget was spent, and the refusal is published to
   ERC-8004 naming the draw transaction that produced it.

## The parts

| | |
|---|---|
| `config.ts` | every variable read, in one place — and the list the website's config block is generated from |
| `gate.ts` | the chain: mandates, headroom, draws, spawns, and the enrolment that binds a node to an identity |
| `fetch.ts` | the 402 path, and the transport a test can replace |
| `settle.ts` | Circle's Gateway: the burn intent, the fee it charges on top, and the floor that puts under a purchase |
| `record.ts` | publishing a refusal, which is skipped entirely when `CORDON_RECORD` is unset — and said out loud at startup |

## Configuration

`CORDON_VAULT`, `CORDON_REGISTRY`, `CORDON_NODE_<label>` and
`CORDON_KEY_<label>` are required. `CORDON_RECORD`, `CORDON_IDENTITY`,
`CORDON_RPC`, `CORDON_CHAIN_ID`, `CORDON_USDC`, `CORDON_NETWORKS`,
`CORDON_ASSETS`, `CORDON_PORT` and `CORDON_POLL_MS` are optional, and every one
of them is documented at <https://getcordon.xyz/docs/configuration> — from this
package's own `ENV`, so the page cannot name a variable no code reads.

**Configuration carries the name of the variable holding a key, never the key.**
A configuration dump cannot leak one.

## Where it should run

Not on a web-facing box. An operator key belongs where its owner is, and the
public deployment runs only the meter and the attest endpoint — neither of
which can draw from the vault or pay anybody.
