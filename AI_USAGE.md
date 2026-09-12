# Use of AI tools

Written for the ETHOnline 2026 submission requirement that a project state
where and how AI tools were used. Last revised 13 September 2026.

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

Those planning files are not currently committed here. If the organisers
consider this a spec-driven workflow within the meaning of their rules, they
are available in full on request and can be added to this repository.

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
system in `packages/ui` was written for this project during the event and is
vendored as source from a sibling directory of the same age.

## Honest limits

This document describes practice, not a guarantee about any individual line.
The accurate summary is that a human decided what this should be and what it
must never claim, and an AI wrote most of the code that implements it, under
review, with the human running everything that spends money or holds a key.
