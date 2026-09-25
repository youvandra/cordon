# Feedback — ENSv2 on Sepolia

Written by one builder who shipped a working integration against the ENSv2
beta over a single weekend at ETHGlobal Tokyo, 25–27 September 2026. Every
item below cost time, saved time, or changed a design decision. Nothing here
is a feature request dressed as a report.

What was built: [Cordon](https://github.com/youvandra/cordon) gives a tree of
AI agents one budget enforced by a contract, and ENSv2 carries the permission
model — every agent is a name, the name's subregistry is the agent's own
branch, and the roles on the name mirror what the mandate allows. The full
integration is described under
[Partner integration — ENS](README.md#partner-integration--ens).

Deployment used: the ENSv2 set the published docs list for Sepolia, recorded
in `packages/fixtures/src/index.ts` under `ENSV2` and checked against the
chain on 25 September 2026.

---

## What worked, and why it mattered

**The per-name registry is the right shape.** In ENSv2 a name's subnames live
in a registry the name points at, rather than in its parent's. That is the same
structure as a mandate tree: a node's children are its own, and cutting the
node cuts them. Nothing had to bend to fit. Revoking a parent mandate stops its
descendants spending; unregistering the parent's name stops them resolving —
and neither transaction names a descendant. Having those two be the same walk
is the whole reason the integration is not cosmetic.

**EAC separating a role from its admin bit is what made the mirror honest.**
A mandate gives an operator the authority to spawn beneath itself, and nothing
more: it may not delegate that, and it may not cut a branch. Granting
`ROLE_REGISTRAR` without `ROLE_REGISTRAR << 128` says exactly that, on chain,
in one bitmap. A single-owner registry could not have expressed it, and the
alternative would have been an off-chain rule — which is the class of claim
this project exists to avoid making.

**Roles as a bitmap made the check runnable rather than argued.** Because the
grant is a number, comparing the namespace against the contract is a program,
not a paragraph. `packages/daemon/scripts/check-authority.ts` walks the
registries down to an agent's own, reads the mandate the name points at, and
exits non-zero when the name grants an authority the contract would refuse.
A reviewer can run it.

---

## What cost time

### Two complete deployments on Sepolia, one of them unreachable

Sepolia carries more than one full ENSv2 deployment, both live, both holding
registered names. Only one is reachable from the root registry, and a name
registered in the other resolves to nothing — silently, with every transaction
succeeding.

Worse, the two are not interchangeable at the implementation level. The
`UserRegistry` and `PermissionedResolver` implementations in the resolving set
predate the `initialize(address,uint256)` that the `VerifiableFactory` calls,
so a proxy deployed through the resolving set's factory at its own
implementation reverts. The working combination was the resolving set's
factory pointed at the other set's implementations, confirmed by simulating the
call rather than by reading bytecode.

Resolving this took about an hour and two wrong assumptions.

**What would have prevented it:** a deployment page that marks which set is
current, and a `setSubregistry` that refuses an implementation it does not
recognise. The second is the stronger fix — a silent wrong answer is the
failure mode that costs the most, because there is nothing to debug.

### The reverse-resolution path deserves a worked example

Setting a primary name needs two transactions signed by two different
accounts: `ReverseRegistrarAdapter.claim(account, resolver)` from the account
being named, then `setName(reverseNode, name)` from whoever holds the resolver
role. That split is correct — an operator that could write its own reverse
record could claim any name it liked — and finding it meant reading
`ReverseRegistrarAdapter` and `DefaultReverseRegistrarAdapter` directly.

A worked two-account example in the app-developer tutorial would have saved
the reading. The design does not need changing.

### `cast` resolves `.eth` arguments before it encodes

This is the sharpest edge encountered, and it belongs to Foundry rather than
to ENS — but it fails hardest against ENS, so it is reported here.

```bash
cast send $RESOLVER 'setName(bytes32,string)' $NODE 'agent.example.eth'
```

`cast` resolves any argument that looks like an ENS name into an address
before encoding the call, so the **address** is stored as the name. The
transaction succeeds, the event fires, and reverse resolution afterwards
answers that the address has no name. Two transactions were wrong before the
calldata was decoded and read.

The workaround is to encode offline, where there is no RPC to resolve
against, and send the bytes:

```bash
cast calldata 'setName(bytes32,string)' $NODE 'agent.example.eth'
cast send $RESOLVER 0x7737…
```

A forge script is immune, because the encoding happens in Solidity.

**What would help from ENS's side:** naming this in the tutorial, since every
app developer setting a name will reach for `cast` first.

### The EVM version is not obvious from the failure

A repo compiling to Shanghai gets this from any call into ENSv2:

```
ETH_REGISTRY::register(...) ← [NotActivated] EvmError: NotActivated
```

which reads like a broken registry and is a simulator configured for an older
chain. `--evm-version cancun` fixes it. One line in the tutorial stating the
minimum EVM version would turn an hour into a minute.

---

## Smaller notes

- `MIN_COMMITMENT_AGE` of 60 seconds and `MAX_COMMITMENT_AGE` of 86,400 are
  comfortable for a hackathon and the commit–reveal was uneventful. The one
  trap is that the commit and the reveal must read identical values, so the
  secret belongs in a file from the start rather than in shell history.
- Registration is priced in a fee token rather than ETH, which was a pleasant
  surprise on a testnet — no faucet race for the registration itself.
- ENSIP-25's key shape, `agent-registration[<erc7930-registry>][<agentId>]`,
  pushed the integration toward pointing at a real ERC-8004 identity instead of
  inventing an id. Both ENSIP-25 and ENSIP-26 are drafts, and both were stable
  to build against.

---

## The one design question left open

Records that carry a **figure** drift. A cap written into a text record is a
copy, and the mandate can narrow a minute after it is written while the record
still quotes the old number — so this integration writes only pointers
(`cordon.node`, `cordon.registry`) and lets the live answer come from the
contract.

That works, and it means a resolver alone cannot answer "what may this agent
spend" — a reader needs one more call, to a contract ENS knows nothing about.
Whether ENSv2 should offer a record type that is explicitly a pointer to an
on-chain source, rather than a string that happens to hold an address, is a
question worth asking. Every integration that avoids drift will invent the
same convention independently.

---

Contact and the code: <https://github.com/youvandra/cordon> ·
<https://getcordon.xyz>
