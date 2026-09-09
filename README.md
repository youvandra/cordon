# Cordon

One budget for a tree of AI agents, enforced on Arc.

An agent that spawns agents has no budget. Four workers allowed $5 each do not
implement a $10 limit, because nothing adds them up. Cordon makes the addition
happen in a contract: **every draw debits every ancestor up to the root**, so a
child cannot spend past a total it never sees, and no agent in the tree holds a
key.

- Site — <https://getcordon.xyz>
- Console — <https://getcordon.xyz/console/>
- Docs — <https://getcordon.xyz/docs>

## What is deployed

Arc testnet, chain **5042002**. All three verified on
[arcscan](https://testnet.arcscan.app).

| Contract | Address |
|---|---|
| `MandateRegistry` | [`0xa50d9454e71acf152399c872815ae6895cb53229`](https://testnet.arcscan.app/address/0xa50d9454e71acf152399c872815ae6895cb53229) |
| `TreeVault` | [`0x045b2050aadaff4b80a2325d63648c09f15ab1f3`](https://testnet.arcscan.app/address/0x045b2050aadaff4b80a2325d63648c09f15ab1f3) |
| `ConductRecord` | [`0x12d15135b5bba8eef0d1098aa65a15af503d09c9`](https://testnet.arcscan.app/address/0x12d15135b5bba8eef0d1098aa65a15af503d09c9) |

Addresses live in `packages/contracts/deployments/5042002.json` and nowhere
else. Nothing in this repository hardcodes one.

## How it fits together

```
owner signs a mandate ──> MandateRegistry ──> TreeVault (holds the money)
                                                   │
        agent ──> MCP server ──> daemon ──> draw ──┘──> Gateway ──> seller (x402)
        (holds no key)            (holds the key)          │
                                                           └──> ConductRecord ──> ERC-8004
```

| Package | What it is |
|---|---|
| `contracts` | `MandateRegistry` (the tree and its narrowing), `TreeVault` (the money and ancestor debit), `ConductRecord` (the enforcement seat that writes into ERC-8004) |
| `daemon` | Holds the operator keys, answers 402 challenges, draws, pays, publishes refusals |
| `mcp` | The agent's surface. Three tools, and the absent ones are part of the fence |
| `proxy` | `cordon run -- <your program>`. An unmodified program, one env var; a refusal arrives as a 402 |
| `meter` | Arc events into a ledger, plus a read-only API. The snapshot is a cache and there is a test that says so |
| `attest` | `GET /attest/:agentId`, an agent's conduct record sold over x402 |
| `site`, `console`, `ui`, `brand` | The public site, the owner's surface, the design system and the marks |
| `fixtures` | Every figure the surfaces display, in one place |

## Gates

Claims in this project are meant to be falsifiable, so each one is a gate with
a test named after the attack it prevents. A gate is green because a run said
so: `packages/fixtures/src/gates.gen.ts` is written by the test run, and a gate
missing from it reads as pending.

| Gate | Ends when | Status |
|---|---|---|
| G1 tree arithmetic | every draw debits every ancestor, exactly | green, 65 tests |
| G2 live on Arc | four-agent tree, no agent holds a key, refusal on arcscan | pending |
| G3 the hostile drill | an unrestricted agent is told to spend, and the number is published | pending |
| G4 bounded search | thousands of strategies scored by the contract, none passes a bound | green |
| G5 the refusal survives us | no admin key, no proxy, reversal fails as the deployer | green, 12 tests |
| G6 the record cannot be forged | every record names its draw transaction; nobody else can write one | green, 14 tests |
| G7 the work still gets done | one task, two conditions, three runs each, and the brief completes under the fence | green, 9 tests |

G7 is the gate that can come out against the product. One task — a brief
citing four paid sources, split across a root and its two workers — run three
times under Cordon and three times under a plain shared cap, scored against
acceptance criteria fixed before the first run. Both conditions completed 3 of
3 and spent the same $4.68. What separates them is when the money leaves the
owner: **$0.00 at risk before any work under Cordon, the whole cap under a
shared balance**, because a shared cap is released up front and enforced by a
counter in the process doing the spending. The fence costs a second transaction
per purchase. The agent is scripted and deterministic, and the run record says
so rather than implying a model.

G4 swept 1,200 strategies through 45,360 draws: 12,033 refused, **0 past a
bound**, and the closest any strategy came was $100.000000 of the $100 window
that run was scored against. Those numbers are written into
`packages/fixtures/src/search.gen.ts` by the run itself, never typed.
Tactic 8 is a negative control that must reach zero refusals, because a
contract that refused everything would pass every other assertion.

Suites: contracts 83 test functions, daemon 18, proxy 18, attest 27, meter 16,
mcp 11.

## What this does not claim

Being explicit about the edge of the guarantee is the point of the project, so:

- **The deployed contracts bound the budget per window, not per lifetime.**
  `windowSeconds` is equal at every depth and the window is tumbling, so a
  mandate left running across many windows authorises more than one window's
  budget. A lifetime cap is implemented and green in G1; the addresses below
  predate it, and this line stands until they are replaced.
- **Counterparty concentration is declared, not enforced.** A seller's address
  lives in an off-chain signed burn intent that no contract can read, so the
  vault bounds a counterparty the daemon *names*. `STRENGTH` in `fixtures`
  marks every figure `enforced` or `declared`, and the surfaces print which.
- **The bound is the contract plus the fact that the agent holds no key.** The
  proxy is not the bound. A request that never reaches the proxy fails; it does
  not escape.
- **A draw and the payment it funds are two steps, and nothing closes the gap
  between them.** The contract releases a tranche into the operator's Gateway
  balance; paying the seller is an off-chain signature after that. If the
  daemon stops in between, the window has been debited, the money is in the
  operator's balance and no seller was paid — there is no commitment ledger, no
  retry and no compensating entry. The meter's `reconcileGateway` bounds the
  aggregate, that an operator's balance never exceeds what the vault released
  to it; it does not reconcile one purchase.
- **G2 and G3 have not been run.** G3 is the hostile drill, and its number gets
  published whichever way it comes out.
- Figures that no run has produced read `pending`. That is a value, not a
  placeholder to be tidied away.

## Running it

Built and tested on Node 26 with [Foundry](https://getfoundry.sh). The
packages run their `.ts` sources directly, so they need a Node new enough to
strip types without a flag.

```bash
npm ci --prefix packages/site && npm run dev --prefix packages/site
```

```bash
cd packages/contracts && forge test
```

`CORDON_G4_VARIANTS=3` runs the search coarse while iterating; the full sweep is
most of the suite's runtime.

Deploying needs a Foundry keystore and a funded account; the private key is
never an argument to the script and never an environment variable:

```bash
cast wallet import cordon-deployer --interactive
cd packages/contracts && ./script/deploy.sh
```

`ops/README.md` covers serving the site, the console, the meter and `attest`
behind nginx.

## Reuse and AI tools

Third-party dependencies are open source and declared in the lockfiles. No code
was carried over from an earlier project. See [AI_USAGE.md](AI_USAGE.md) for
how AI tools were used and what was directed by hand.

## Licence

Every Solidity source carries an `SPDX-License-Identifier: MIT` header. A
repository-level licence file has not been added yet.
