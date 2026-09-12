# @cordon/contracts

Three contracts, no admin key, no proxy, nothing upgradeable. Everything the
rest of the repository does is a way of asking these a question or reading what
they answered.

```bash
forge test                      # the suites, including the adversarial search
forge test --match-path test/G1_TreeArithmetic.t.sol -vv
CORDON_G4_VARIANTS=3 forge test # the search, coarse, while iterating
```

## What each one is for

| | |
|---|---|
| `MandateRegistry` | The tree. Opens a root, spawns a child that can only be narrower, revokes a branch. Node ids are **derived**, never listed, so every node under an owner is reachable from that owner's address alone |
| `TreeVault` | The money, and the arithmetic. Holds the treasury, evaluates every bound on every node from the asking node to the root, debits all of them, and releases exactly one purchase |
| `ConductRecord` | The seat. The only address that may write these refusals into the ERC-8004 Reputation Registry, and it writes nothing that does not name its draw transaction |

## The decisions that are not preferences

**A refused draw returns; it does not revert.** A revert rolls back the events
with it, and a refusal that leaves no trace is not a record. `draw` returns a
`Reason` and emits `Refused`, and the caller reads the outcome rather than
catching an error.

**A refusal consumes no budget.** Window state is untouched when a draw is
refused — verified by a test named after the attack, because a fence that
charged for being hit would be a way of draining a window without spending.

**The counterparty and the notional are derived inside the contract**, never
accepted as parameters that the caller could shape. A value the caller controls
is not a constraint.

**`windowSeconds` must be equal to the parent's**, not merely no larger. A
shorter child window refills faster than the window it debits, which is a hole
rather than a tightening — and it is the one field where "narrower" would have
been the wrong rule.

**Zero is never "unlimited".** A zero budget, tranche cap, lifetime cap,
concentration or depth is a setup mistake and `open` says so, rather than
opening a mandate that can never draw or one that is bounded by nothing.

**No supervisor role exists.** There is no pause, no owner, no upgrade path and
no function that can reverse a refusal. What exists is `release`: the owner
signs an exception to one specific refusal, and both stay on the record.

## The gates that live here

| | |
|---|---|
| **G1** | tree arithmetic — every draw debits every ancestor, exactly |
| **G4** | a bounded search: 1,200 adversarial strategies through 45,360 draws, scored by the contract and never by a model of it. One tactic is a negative control that must reach zero refusals |
| **G5** | the refusal survives us — reversal fails as the deployer, and there is no key that changes that |
| **G6** | the record cannot be forged — every record names its draw transaction, and nobody else can write one |

Gate rows are written into `packages/fixtures/src/gates.gen.ts` by the run
itself. A gate missing from that file reads `pending` on every surface.

## Deploying

The private key is never an argument and never an environment variable:

```bash
cast wallet import cordon-deployer --interactive
./script/deploy.sh
```

The script writes `deployments/<chainId>.json`, then rewrites the address
fixture the bundles read and the table in the repository README from it.
**Addresses live in that file and nowhere else**; nothing in this repository
hardcodes one.

## Layout

```
src/
  MandateRegistry.sol     the tree, and narrowing
  TreeVault.sol           the money, and ancestor debit
  ConductRecord.sol       the enforcement seat that publishes
  SafeTransfer.sol        a non-standard-return ERC-20, handled once
  interfaces/             ERC-20, ERC-8004, GatewayWallet — minimal, written here
test/                     one file per gate, named after what it prevents
script/deploy.sh          deploy, verify, and rewrite every place an address appears
scripts/                  the recorders that write fixtures from runs
```

`lib/` holds `forge-std` and nothing else. The contracts import no third-party
Solidity.
