# @cordon/meter

The indexer. Arc's events are the log; this folds them into the ledger the
public record page and the console render.

```bash
node src/main.ts --chain 5042002 --from 0     # index, then serve read-only
node src/main.ts --once --out ledger.json     # index and exit
```

## It is a cache, in the strict sense

Delete the snapshot, replay from block zero, and the same ledger comes back.
Nothing here is an authority on what happened — the chain is. A test asserts
the round trip, because a cache that cannot be rebuilt has quietly become a
second source of truth, and then the two disagree on the day it matters.

Every response carries the block range it covers. An indexer that does not say
how far behind it is invites a reader to assume it is current.

## What it counts, and what it refuses to

Only facts the chain emitted:

| Figure | From |
|---|---|
| `draws`, `drawn6` | `Drawn`, per node |
| `refusals`, `refused6` | `Refused`, filed against the node that drew |
| `breaches` | `Refused`, filed against the node whose bound stopped it |
| `debited6` | `AncestorDebited`, per ancestor — the number no per-agent wallet can produce |
| `counterparties` | `Drawn`, declared payee, all-time |
| `released6` | `Released`, counted apart from draws: an override is not a purchase |
| `agentId`, `attested` | `Bound` and `Attested` from the seat |

Not here, on purpose:

- **No score, no rate, no "risk".** A number that is not in an event and not
  enforced by a contract has no business in a ledger a surface renders.
- **No recomputed bounds.** The contract's window and concentration figures are
  window-scoped and roll. An all-time total would look like the same number and
  refuse nothing, so the live bound is read from `TreeVault` and the totals here
  are labelled for what they are.

## Reading it

```
GET /health          the range, the node count, the refusal count
GET /tree/:root      every node under one root, with its counters
GET /node/:node      one node's conduct, and its refusals
GET /agent/:agentId  the same, addressed by ERC-8004 identity
GET /refusal/:id     one refusal, and the transaction it happened in
```

Read-only, and the process holds no key. `access-control-allow-origin: *`
because the record is meant to be read by people who are not the owner —
sellers before serving, underwriters before pricing, other owners before
hiring. A record only its owner can fetch is not a record.

## Reconciliation

`reconcileGateway` checks the one thing that is checkable from chain state
alone:

> an operator's Gateway balance must never exceed what the vault released to it

A balance *below* that total is the ordinary case — it means the agent bought
something. A balance *above* it means money reached that agent from outside the
tree, and the claim that the vault is the only funding source is false for that
node. Both directions have a test.

The other half — matching each declared counterparty against the seller who was
actually paid — needs Circle's `search-x402transfers`, and whether a buyer can
read their own transfers is unresolved. It reports `unavailable` rather than
approximating, because a reconciliation that quietly compares nothing always
passes.

## Addresses

From `packages/contracts/deployments/<chainId>.json`, written by the deploy
script from the broadcast. Never an argument, never typed by hand: a meter
pointed at a mistyped address produces a ledger that looks right and is about
another tree.

## Tests

```bash
npm test
```

`ledger.test.ts` is the arithmetic. `chain.test.ts` runs anvil and the real
contracts, because a reducer tested only against events a test wrote cannot
catch a renamed parameter or a reordered enum — which is the defect that
produces a ledger full of zeroes on the day of a demo.
