# Cordon — working rules

One budget for a tree of agents, enforced on chain. Every draw debits every
ancestor.

These are the engineering constraints. They are decisions, not options — each
one is here because getting it wrong produces a plausible-looking product that
does not do what it says.

## The rule that keeps this from becoming cosmetic

**No surface may display a number the contract does not enforce.**

The predictable failure is a handsome "risk score" or "anomaly detected" panel
wired to no refusal. If a figure appears on screen, point at the contract
function that produces it, or delete it. That is what the `.enforced` badge
under a figure is for, and it is not decoration.

The same rule applies to claims: every claim this project makes is enforced
mechanically **and** falsifiable by a test. A claim with neither is marketing.

## Numbers

`packages/fixtures` is the only source of any figure. Never hardcode a cap, a
window, a decimal count, a price or a count anywhere else — import them.

**USDC on Arc has two decimal views of one balance.** Native is 18 decimals
(gas, `msg.value`, native sends). The ERC-20 view at
`0x3600000000000000000000000000000000000000` is 6 decimals, and `balanceOf`
truncates below a millionth. Scaling between them happens in **exactly one
function**, `scaleUsdc` in `fixtures`. This is the highest-probability bug in
the project, and it is the class of defect that is invisible until it is
expensive.

A figure no run has produced yet is marked `pending` and is never invented to
fill a space. `pending` is a value, not a placeholder to be tidied away.

Deployment addresses live in `packages/contracts/deployments/5042002.json` and
nowhere else. Nothing hardcodes an address.

## Invariants that never bend

Each gets a test named after the attack it prevents.

- Enforcement lives only in the contract. No model originates a refusal.
- A draw debits the window of **every ancestor** up to the root. Without this,
  delegation is the bypass.
- Child mandates narrow monotonically, and `windowSeconds` must be **equal** to
  the parent's, never smaller — a shorter child window resets faster than the
  parent it debits.
- A refused draw **returns**, never reverts. A revert rolls back the events, and
  a refusal that leaves no trace is not a record.
- A refusal consumes no budget: window state is untouched when a draw is
  refused.
- The vault is the only funding source. Every agent key holds zero balance and
  zero allowance beyond its current tranche.
- No supervisor role exists in any contract. No admin key, no proxy. A refusal
  must survive its authors.
- Counterparty and notional are **derived** inside the contract, never accepted
  as parameters. A value the caller controls is not a constraint.
- The MCP tool list is part of the fence. There is `cordon_fetch`; there is no
  `cordon_transfer(to, amount)`, and there never will be. The agent cannot
  express "send money to X" — only "fetch this URL". A general transfer tool
  leaks the claim.
- The agent holds no key. The daemon holds it, and every purchase passes the
  gate. Not "no more than one tranche" — none.

## The fast lane is not ours

The daemon signs and pays; we add nothing to the payment path itself. EIP-3009
signing stays EOA, off chain, zero gas, sub-second. Any change that adds latency
to a nanopayment is wrong — x402 batch settlement requires EOA signatures and
does not support ERC-1271, so there is no contract to put in that path even if
we wanted one. Cordon bounds capacity, not items.

## Evidence

Arc is public with sub-second deterministic finality. **Its events are the
log.** Postgres is a cache and must be rebuildable from chain; it is never the
authority on what happened. Do not build a commitment layer the chain already
provides.

Case files are generated deterministically. No model layer. Every claim carries
a reference that resolves to a chain record, and claims without one do not
render.

## The record

Conduct goes into the **ERC-8004 Reputation Registry**, never into a table of
our own. The registries are already live on Arc testnet — Identity
`0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation
`0x8004B663056A597Dffe9eCcC1965A193B7388713` — so there is nothing to deploy.

Every record names the draw transaction that produced it. A record without that
linkage is not written.

We publish measurements, never opinions. No score originates in a model, a
heuristic, or a human judgement call — only in what the contract refused.

## Interface

Animation may not gate visibility. `requestAnimationFrame`, `ResizeObserver` and
`IntersectionObserver` only run during a rendering step, and a hidden document
runs none — so anything whose opacity, position or geometry waits on one of them
is blank in a background tab, sometimes permanently. Content renders in its
final state unless we know we can animate it, measured drawings carry a fallback
to draw into, and a zero is treated as a missing measurement rather than a
measurement of zero.

## Commits

No `Co-Authored-By` trailer, no generated-with footer. Commit after every task.
