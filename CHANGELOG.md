# Changelog

## 0.2.0 — unreleased

Built at **ETHGlobal Tokyo 2026** (25–27 September), on the **Continuity track /
Extend Open Source**. Everything in this section was written during the event.

The boundary is a tag, so it can be checked rather than taken on trust:

```
git log v0.1.0..HEAD      # the work done at Tokyo
git diff v0.1.0..HEAD     # and the whole of it
```

`v0.1.0` is the last commit that predates the event. The first commit made
during it is `8aa6e22`.

### Added

- **An ENSv2 name for every agent, and the permission model in that namespace.**
  A subname is issued inside a spawn, Enhanced Access Control roles carry the
  mandate's own authority and cannot widen it, and the records are a pointer to
  the enforcing contract rather than a copy of a figure. ENSIP-25 for the
  ERC-8004 link, ENSIP-26 for the endpoint and context.
- **Cordon on Ethereum Sepolia**, because that is where ENSv2 is. Registry,
  vault and record, against `LocalGateway` and Circle's Sepolia USDC.
- `LocalGateway`, a settlement rail for chains without Circle's Gateway.
  `TreeVault` reaches its gateway through `IGatewayWallet`, so the chain is
  served by satisfying that interface. No existing contract changed.
- `SEPOLIA` and `ENSV2` fixtures, beside `ARC` and replacing nothing. Arc stays
  deployed and stays reachable.
- `DirectSettler`, which settles an x402 purchase against the operator's own
  token balance. It has no fee floor, so purchases below Circle's
  `GATEWAY.baseFee6` settle for the first time.
- A console screen that answers a stranger: paste a name or the address in a
  payment and it shows the bound, whether the branch is live, and the chain of
  operators who could cut it off.
- `resolve-agent.ts` and `check-authority.ts` — the check a seller makes, and a
  run that fails when a name grants authority the contract refuses.
- **`/demo`, the run of show**, for the phone in the presenter's hand: five
  beats, the line to say, and an exit for each one that does not land. Its
  pre-flight block reads the tree from the meter on load rather than stating
  its condition from memory — a rehearsal that cut a branch or emptied the
  treasury shows up there instead of on stage. The two beats that quote a
  figure quote the live one. `noindex`, and nothing links to it.

### Changed

- The console reads Sepolia. The chain is named in one place, `lib/chain.ts`,
  and moving it back is one constant.
- The MCP server picks its settlement rail from the chain rather than from
  configuration.
- **The ENSIP-25 key is built in one place.** It was built twice, in the
  daemon's seller check and in the console's Resolve screen, from two copies of
  the same encoding. A key one byte out is not rejected by a resolver — it
  resolves to nothing, which is what an agent that never registered looks like,
  so the two copies could have come to disagree about the same agent without
  either reporting an error. The builder now lives in `fixtures`, beside the
  registries it encodes, and both surfaces call it.
- **The mirror between a name and its mandate is decided where a test can
  reach it.** The comparison was arithmetic inside a top-level script and could
  not be called without an RPC, which is why the defect that reversed its claim
  was found by running it rather than by a test. `invented` and `narrower` are
  now named verdicts in `daemon/src/namespace.ts`, and a test asserts they
  never collapse into each other.
- The console has a test suite. `format.ts` — shares, revocation running down a
  branch, and dollars typed by an owner into the token's units — had none.

### Fixed

Found by an independent review of `a53e862`, and verified here before each was
touched.

- **The daemon listened on `0.0.0.0` with no authentication.** It is the only
  process in the system that holds keys and can pay, and it was the only one of
  the three that did not bind loopback. Anyone who could route to it could
  enumerate the tree, force purchases until the budget was gone, or spawn a
  child into the operator's key file. It binds `127.0.0.1` now, and off
  loopback a bearer token is required rather than advised — a bind that leaves
  the machine without `CORDON_TOKEN` is refused at startup.
- **A seller could ask for an authorisation valid for years.** `validBefore`
  came from the seller's own 402 with no ceiling, so a seller could hold signed
  EIP-3009 authorisations and cash them together later. Ten minutes is the
  ceiling; an offer asking for more is refused rather than clamped quietly.
- **Two concurrent purchases could spend one release twice.** `claim` read the
  chain twice between checking that a release was unspent and marking it spent.
  It is serialised per node now, on the queue `gate.draw` already used.
  `released-spent.json` is also written atomically, as `keyfile.ts` does.
- **`npm test` in the daemon required Foundry to run any test at all**, because
  it began by regenerating an ABI that is committed. The eighty-four tests that
  need no chain run as `test:unit`; the two files that need anvil moved to
  `test/chain`.

- **A looping agent could write an unbounded number of refusal transactions.**
  A refusal spends no USDC, but it costs gas, which is outside the mandate
  entirely — and it filled the conduct record with the same sentence. A refusal
  identical to one already on chain and still standing is now answered from
  that one. Only a duplicate is ever suppressed, and the memory expires with
  the window, because a refusal against a fresh budget is a new fact.

### Corrected

- **"An agent that can buy things and cannot move money" was not true**, and it
  was on npm, in the README, in the agent's own skill and on the docs page. The
  agent chooses the URL and the payee comes from that URL's 402, so a hostile
  or injected agent can pay itself up to the bounds; concentration is keyed by
  address and an address is free. What is enforced is how much and how fast,
  against every ancestor, with every refusal on chain — which is what the
  surfaces say now.

### Added

- Continuous integration. Nothing ran on push before, so gates were green on
  the day somebody ran them and unknown since.

### Reused, unchanged

The mandate tree, the vault's enforcement, the conduct record, the daemon, the
MCP server and the console all predate the event. What the weekend adds sits
beside them.

## 0.1.0 — 2026-09-16

Built for ETHOnline 2026. Mandate registry, tree vault, conduct record, daemon,
MCP server, console, meter and attest seller, deployed on Arc testnet.
