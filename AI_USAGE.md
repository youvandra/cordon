# Use of AI tools

Written for the ETHOnline 2026 submission requirement that a project state
where and how AI tools were used, and kept current for ETHGlobal Tokyo 2026.
Last revised 25 September 2026.

## The short version

**Claude Code (Claude Opus 5) wrote most of the code in this repository, in a
long series of directed sessions.** It was not prompted once and left to run.
Every session was steered: what to build next, what to cut, which claim was too
strong, which figure was invented, what the screen should say. The direction,
the product decisions and every action involving a key were the author's.

Nothing here is a generated project scaffold. There is no starter kit, no
template and no boilerplate generator in the history.

## Which tool

| Tool | Used for |
|---|---|
| Claude Code (Claude Opus 5) | Solidity, TypeScript, React, CSS, tests, build scripts, ops configuration, and most prose on the site and in `/docs` |
| Claude (chat) | Reviewing a written product specification and arguing about scope |

No other coding assistant was used, and the submitted video will carry no AI
voiceover — the narration is the author's own.

## Which parts of the repository

Effectively all source files were written or substantially edited with Claude
Code. Rather than list every file, here is the honest shape of it:

| Area | AI involvement |
|---|---|
| `packages/contracts` | Written with AI. The invariants they enforce, and the decision that a refused draw returns rather than reverts, were argued out in conversation before any code |
| `packages/daemon`, `packages/mcp`, `packages/proxy` | Written with AI |
| `packages/meter`, `packages/attest` | Written with AI |
| `packages/eval` | Written with AI. The acceptance criteria and the two conditions were fixed in conversation before the first run, and the decision not to measure latency — the first run's figures were the client's polling interval — was the author's |
| `packages/site`, `packages/console`, `packages/ui` | Written with AI. The visual design decisions — layout, what to delete, what a figure should say — were the author's, given as review notes and applied |
| `packages/fixtures`, `packages/brand` | Written with AI |
| `ops/` | Written with AI; every command that touched the server was run by the author |
| Generated files (`*.gen.ts`, `Fixtures.gen.sol`) | Written by scripts in this repository, from test runs and from a live MCP server. Not written by a model and not written by hand |

## Where a model is, and is not, in the product

This matters more than which editor wrote the lines, because the project's
whole claim is that a refusal is a contract's and not a judgement.

**No model originates a refusal.** Enforcement is `TreeVault.draw`: it reads
the mandate, walks the path to the root and returns a reason from a fixed
enum. There is no model, heuristic or score anywhere in that path, and nothing
above the contract can permit what it refuses. The same rule covers the record:
what is published to ERC-8004 is what the contract decided, never an opinion
about it.

**A model is the thing being bounded.** Cordon's whole purpose is to sit in
front of an agent that is usually a model with tools, and the MCP server is
where that meets the fence. That agent holds no key, and the tool list is part
of the bound — `cordon_fetch` takes a URL, and no tool takes a recipient or an
amount.

**A model was the adversary in G3.** The hostile drill is an agent given the
daemon and a target, told to spend as much as it could, neither restricted nor
helped. It spent real testnet money and the figure it reached — 35% of the
ceiling, stopped by `concentration` — is published whichever way it came out.
That is AI being used as an attacker against this project's own contracts.

**No model is in G7.** The agents in the work-still-gets-done gate are
scripted and deterministic, which is stated on the page rather than implied.
A gate that measured a model's choices would be measuring the model; this one
is evidence about the contracts.

**`packages/mcp/SKILL.md` is instructions for somebody else's agent**, and it
is generated from the same fixtures the tools and the surfaces read, so it
cannot describe a tool that no longer registers or explain a refusal
differently from the console.

## What the author did, and no tool did

- Chose the problem, the product and what it would refuse to claim.
- Made every visual and editorial call. Large parts of the site exist because
  a draft was rejected: the landing page was cut back twice, one hero figure
  was replaced entirely, and several sections were deleted rather than
  improved.
- Held every key. The deployer keystore was created by the author, the
  password never left their machine, and the mandate is signed from their own
  wallet. No model has ever held a key in this project.
- Ran the deployment, the server installs and the DNS.
- Set the constraints the code is written against, including the rule that no
  surface may display a number the contract does not enforce. That rule is the
  reason `pending` appears on screen where a figure has not been produced yet,
  and it caused work to be thrown away more than once.
- Reviewed and rejected. Several AI proposals were wrong and were caught,
  including an attestation that reported a released refusal as never published,
  and a config block that named environment variables no code reads.
- Directed the audits that found the rest. A late pass over every public page,
  asked for by the author, turned up a breach rate printed as 300% because an
  empty denominator had been clamped to one, a "100% of refusals name their
  transaction" figure on records with no refusals in them, a config block
  pointing at an npm package that was never published, and an operator field
  that accepted the owner's own wallet — which no contract can catch.

## How the work was directed

The repository is built against a written set of engineering constraints and a
plan, kept as files and revised as decisions closed. Sessions read them first
and were expected to follow them; a session that violated one was corrected and
the rule was tightened.

Verification was part of the direction rather than an afterthought: sessions
were expected to run the suites, read the deployed pages back from outside, and
check a figure against the chain before writing it down. Where that was not
possible — anything needing a signature, a server password or a key — the
session stopped and the author did it.

### Where the direction lives, and what is kept out

**Technical direction is in this repository.** Not in a private file: it is in
the commit messages, which state what changed and why and what the alternative
would have broken; in `packages/contracts/script/ens/README.md`, which is the
sequence the ENS work runs in and the traps it hit; and in `/docs`, which is
written as the work closes rather than after it. A reader who wants to know why
a decision went the way it did can read the commit that made it.

**What is kept out is prize strategy.** Which tracks to enter, which partner
prizes to name, how to present the work to judges. That is a plan about a
competition rather than direction for a build, it names nothing a reader of the
code would need, and it stays on the author's machine.

If the organisers consider this a spec-driven workflow within the meaning of
their rules, every planning file is available in full on request.

## What is reused

Third-party dependencies only, all open source and declared in the lockfiles:
Foundry and `forge-std`, viem, the Model Context Protocol SDK, React, React
Router, framer-motion, Privy, Vite and the Node standard library. The contracts
import no third-party Solidity at all — `lib/` holds `forge-std` and nothing
else, and the four interfaces they compile against (ERC-20, ERC-8004 Identity
and Reputation, and Circle's `GatewayWallet`) are the minimal declarations
those live deployments require, written in this repository.

The ERC-8004 registries and Circle's Gateway and USDC contracts are existing
deployments on Arc that this project reads and writes; it did not author them.

No code was carried over from any earlier project of the author's. The design
system in `packages/ui` was written for this project and is vendored as source
from a sibling directory of the same age.

ENSv2's contracts are somebody else's deployment, read and written here and not
authored here. The interfaces this repository compiles against them —
`script/ens/IEns.sol` — are minimal declarations written against
`ensdomains/contracts-v2`, and every one of them is exercised by a script that
reverts if the shape is wrong.

## ETHGlobal Tokyo 2026, 25–27 September

Cordon existed before this event and is entered on the Continuity track. The
boundary is a tag rather than a claim: `v0.1.0` is the last commit that predates
it, so `git log v0.1.0..HEAD` is the weekend's work and nothing else.

The same practice as before, and the same division. What the weekend added:

| Built at the event | How |
|---|---|
| `LocalGateway.sol` and its tests | directed; the interface it satisfies and the decision to shim rather than edit `TreeVault` were the author's |
| `DirectSettler` and its tests | directed, including the test that puts one purchase to both rails so the difference is a run rather than a sentence |
| The Sepolia deployment | **the author ran every transaction.** Each one was signed from an encrypted keystore, at the author's keyboard, after reading a simulation |
| The ENS scripts under `script/ens/` | written by the tool, run by the author, one password at a time |
| The console's `Resolve` screen, `lib/chain.ts`, `lib/names.ts` | directed |
| The `names` docs page and the landing section | drafted by the tool against the author's argument, then cut down |

Three defects in this period are worth naming, because they say what the review
was actually for. A check script labelled a name that grants *less* authority
than its mandate as though it granted more — the claim reversed — and was caught
by running it against a node it had not been written for. The console printed
"nothing has been refused" over a tree with a refusal on chain, because it asked
an indexer for a different chain and took an empty answer as an answer. And a
record was written with an address where a name belonged, because `cast`
resolves `.eth` arguments before encoding; the transaction succeeded and the
event fired.

None of those three were found by a model reading its own output. Two were
found by running the thing against real state, and one by the author noticing
that a screen said something he knew to be false.

## Honest limits

This document describes practice, not a guarantee about any individual line.
The accurate summary is that a human decided what this should be and what it
must never claim, and an AI wrote most of the code that implements it, under
review, with the human running everything that spends money or holds a key.
