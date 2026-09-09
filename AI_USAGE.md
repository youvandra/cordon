# Use of AI tools

Written for the ETHOnline 2026 submission requirement that a project state
where and how AI tools were used.

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

No other coding assistant was used. No AI voiceover is used in any submitted
video.

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

## How the work was directed

The repository is built against a written set of engineering constraints and a
plan, kept as files and revised as decisions closed. Sessions read them first
and were expected to follow them; a session that violated one was corrected and
the rule was tightened.

Those planning files are not currently committed here. If the organisers
consider this a spec-driven workflow within the meaning of their rules, they
are available in full on request and can be added to this repository.

## What is reused

Third-party dependencies only, all open source and declared in the lockfiles:
Foundry and forge-std, OpenZeppelin interfaces where used, viem, React,
framer-motion, Vite and the Node standard library. The ERC-8004 Identity and
Reputation registries and Circle's Gateway and USDC contracts are existing
deployments on Arc that this project reads and writes; it did not author them.

No code was carried over from any earlier project of the author's. The design
system in `packages/ui` was written for this project during the event and is
vendored as source from a sibling directory of the same age.

## Honest limits

This document describes practice, not a guarantee about any individual line.
The accurate summary is that a human decided what this should be and what it
must never claim, and an AI wrote most of the code that implements it, under
review, with the human running everything that spends money or holds a key.
