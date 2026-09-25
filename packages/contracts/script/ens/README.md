# ENSv2 on Sepolia — the sequence, and the two traps

The scripts here stand up an agent's name and bind it to the mandate that
bounds it. Run in this order; each one prints what the next one needs.

| | |
|---|---|
| `CommitName.s.sol` | mint the registration fee, approve it, commit |
| `RegisterName.s.sol` | reveal, at least `MIN_COMMITMENT_AGE` later |
| `AttachSubregistry.s.sol` | deploy the name's own registry and point the name at it |
| `IssueSubname.s.sol` | issue an agent's name inside it |
| `StandUpDemo.s.sol` | the mandate tree, a resolver, and the records, in one broadcast |
| `FundVault.s.sol` | put the root's budget behind the tree |
| `FuelOperators.s.sol` | gas for the daemon keys |

`.env.ens` holds the addresses and the commitment secret. It is gitignored, and
the commit and the reveal must read the identical values — a secret typed twice
is a secret typed differently once.

## Trap 1 — `--evm-version cancun`

This project compiles to Shanghai. The ENSv2 contracts need a later opcode, and
forge simulates the whole call under one EVM version, so without the flag a
call into them fails with:

```
ETH_REGISTRY::register(...) ← [NotActivated] EvmError: NotActivated
```

which reads like a broken registry and is really a simulator configured for an
older chain. Pass the flag on the command line rather than changing
`foundry.toml`; changing the file rebuilds every contract here with a different
pipeline.

## Trap 2 — `cast` resolves `.eth` arguments

`cast send` resolves any argument that looks like an ENS name into an address
before it encodes the call. Setting a primary name with

```
cast send $RESOLVER 'setName(bytes32,string)' $NODE 'probe.mira.eth' --rpc-url …
```

stores **the address**, not the name. The transaction succeeds, the event fires,
and the record is wrong — the failure is silent and only shows up when reverse
resolution keeps answering "no name".

Build the calldata offline, where there is no RPC to resolve against, and send
that:

```
cast calldata 'setName(bytes32,string)' $NODE 'probe.mira.eth'   # encodes the string
cast send $RESOLVER 0x7737…                                       # sends it verbatim
```

A forge script is immune, because the encoding happens in Solidity.

## Two ENSv2 deployments

Sepolia carries two complete ENSv2 deployments. Only one is reachable from the
root registry, and that is the one names must live in — a name registered in the
other resolves to nothing. Its `UserRegistry` and `PermissionedResolver`
implementations, however, predate the `initialize(address,uint256)` the factory
calls, so the proxies here run the other deployment's implementations. The
factory does not care which implementation a proxy points at.

`packages/fixtures` holds the addresses of the resolving set, checked against
the chain.

## The primary name, in two transactions by two accounts

Reverse resolution needs both halves, and they are signed by different people
on purpose:

1. **The operator claims its own reverse node**, because it is the operator's
   address being named:
   `ReverseRegistrarAdapter.claim(operator, resolver)`
2. **The owner writes the name**, because the owner holds the roles on the
   resolver: `setName(reverseNode, "probe.mira.eth")`

An operator that could write its own reverse record could claim any name it
liked. It cannot, and the check that proves it is that the call reverts with
`EACUnauthorizedAccountRoles` when the operator tries.
