# @cordon/fixtures

Every figure any surface displays, in one place. No cap, window, decimal count,
price or count is written anywhere else in this repository.

## Why a package

Two copies of a number are two numbers, and the day they disagree is the day a
page claims something the contract does not do. So the site, the console, the
docs, the MCP skill file and the Solidity test fixtures all read from here.

## Written by hand, and written by runs

Hand-written values are the ones a person decided: a price, a window, the
vocabulary of a bound. The rest are generated, and the file says so at the top:

| | Written by |
|---|---|
| `deployment.gen.ts` | `deploy.sh`, from `deployments/<chainId>.json` |
| `gates.gen.ts` | the runs themselves — a gate missing here reads `pending` |
| `drill.gen.ts` | G3, which publishes its figure whichever way it came out |
| `search.gen.ts` | G4's adversarial sweep |
| `eval.gen.ts` | G7's six runs |
| `settlement.gen.ts` | one purchase, read back off the chain afterwards |
| `tools.gen.ts` | a live MCP server, asked what it exposes |

Never edit a `.gen.ts`. Run the thing that writes it.

## `pending` is a value

A figure no run has produced reads `pending`, and the surfaces print that
rather than a zero or a plausible number. It is not a placeholder to be tidied
away: it is the honest state of a claim nobody has tested yet, and the rule
that produces it is the reason the drill page could have come out against the
product.

## The decimals

USDC on Arc has two decimal views of one balance: native is 18 decimals (gas,
`msg.value`, native sends) and the ERC-20 view is 6, truncating below a
millionth. **Scaling between them happens in exactly one function**, `scaleUsdc`.
This is the highest-probability bug in the project and the class of defect that
is invisible until it is expensive.

## `STRENGTH`

Every figure is marked `enforced` or `declared`, and the surfaces print which.
A concentration bound the contract checks against a payee the daemon *named* is
not the same claim as one it verified, and the difference is printed rather
than blurred.
