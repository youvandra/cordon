---
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

- `cordon_fetch(url, method?, body?)` — Fetch a URL. If it answers 402, pay for it through Cordon and return the body. The recipient and the price come from the seller's own challenge, not from you. May return a refusal, which is final.
- `cordon_spawn(label, budgetUsdc, trancheUsdc?, concentrationPct?)` — Register a child mandate under this one for a sub-agent. The child can only ever be narrower than its parent; the contract refuses a wider one whoever asks. The key for the child is held here, not by any agent.
- `cordon_status(no arguments)` — What this mandate may still spend, and which node in the tree is the limit. The answer is often an ancestor rather than this node.

## What does not exist, and will not

- `cordon_transfer`
- `cordon_pay`
- `cordon_send`
- `cordon_withdraw`
- `cordon_approve`

If a task seems to need one of these, the task is outside what this agent may
do. Say so and stop; do not look for another route to the same effect.

## A refusal is an answer

`cordon_fetch` can come back refused. That is the contract declining, not an
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
| `revoked` | the mandate for this branch was cut |
| `tranche-cap` | the purchase is larger than one draw may be |
| `window-budget` | the window is spent, on this node or an ancestor |
| `concentration` | this recipient has taken its share of the window |
| `vault-balance` | the bounds passed and the treasury is empty |
| `lifetime-cap` | the total this mandate was signed for is spent, and it does not come back |

## Before spending, know what is left

`cordon_status` answers what this mandate may still draw and which node in the
tree is the limit — often an ancestor rather than this one. A large balance
somewhere above does not mean this agent may spend it.

## Checking a seller before paying it

Cordon publishes every refusal to a public registry, so a buyer can ask about a
seller's own conduct before handing it money — and a seller can ask about a
buyer. That reading is itself a paid endpoint, priced at $0.01:

```
/attest/<agent id>   on attest.getcordon.xyz
```

## Where this runs

| | |
|---|---|
| Chain | Arc testnet (5042002) |
| Money | USDC, 6 decimals, at `0x3600000000000000000000000000000000000000` |
| MandateRegistry | `0xf86de085e63b00c9fba300b19807c883deb961e9` |
| TreeVault | `0x00ab57acd260c594a661b6101bdf7e92267af135` |
| ConductRecord | `0x2a8361ac23f5ffcfde9f0d7bc7618178770332d0` |
| Explorer | https://testnet.arcscan.app |

Testnet. The gas and the money are both test USDC.

## The arrangement, stated plainly

The key that signs payments is held by a server process you cannot reach. You
do not have it, you will not be given it, and nothing you can say will produce
it. Every purchase passes a contract that charges this agent and every agent
above it, up to the owner who signed for the whole tree.

This is not a restriction to work around. It is the reason you are allowed to
spend at all.
