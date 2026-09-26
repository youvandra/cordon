# @cordon/verify

Check what an AI agent is permitted to spend, from its ENS name or from the
address that just paid you.

```bash
npm install @cordon/verify
```

## The problem this solves

An x402 payment arrives and the only thing in it identifying the payer is an
address. You cannot tell an agent with a funded, bounded mandate and a named
human behind it from a script with infinite retries — so you either serve every
agent or none.

```ts
import { verify, canAfford } from "@cordon/verify";
import { sepolia } from "viem/chains";

const result = await verify(payerAddress, {
  chain: sepolia,
  vault: "0x…",            // optional: answers headroom from the contract
});

if (!result.ok) {
  // "unnamed"  — no reverse record, or the name does not resolve back to it
  // "unbound"  — a real name, but it carries no Cordon mandate
  return refuse(result.reason);
}

const { agent } = result;
agent.live;        // false once any ancestor is revoked
agent.headroom6;   // the most it could still draw, in USDC base units
agent.boundBy;     // the node whose limit produces that figure — often an ancestor
agent.owner;       // the human who funded the tree and can cut it off
agent.root;        // where a refund belongs: fund(root) is permissionless
agent.chain;       // every operator above it, each of whom can cut it
```

## Four things it is useful for

**Rate limits that delegation cannot bypass.** Every agent in a tree has its own
operator key, so fifty spawned agents are fifty unrelated payer addresses and a
per-address limit of 100/min becomes 5,000/min with nothing on chain linking
them. `agent.root` is the same for all fifty — key your limiter on that.

**Bans that a spawn cannot evade.** Banning an address is useless when the owner
can spawn a new one. Ban the root.

**Refunds that do not break the customer's own fence.** The payer is a key, not
an account: it holds zero by design, it may be revoked, and it may no longer
exist. Refunding it also injects money that no window, lifetime cap or
revocation governs. Refund `agent.root` through the vault's permissionless
`fund` instead.

**Deciding whether to extend anything** — a tier, a metered plan, work delivered
before payment:

```ts
if (!canAfford(agent, price6)) return refuse("not enough headroom");
```

## It never guesses

Every field that could be absent is `null`, not a zero or an empty string. A
seller writing `if (headroom6 > 0n)` against a fabricated zero would refuse a
good agent; one reading `0` as unlimited would serve a dead one.

`canAfford` refuses when headroom is unknown, and refuses a revoked agent
whatever its headroom says. The direction that flatters is the one to refuse.

`parseBase6` is strict: only `/^\d+\.\d{6}$/`. A record written by hand, or by a
resolver that formats differently, reads as absent rather than as a figure you
would act on.

## Where each answer comes from

`sources` says so, because it changes how much the answer is worth.

| Source | Meaning |
|---|---|
| `contract` | read from the registry or the vault — enforced |
| `name-computed` | an ENS text record `CordonResolver` computed from those same contracts |
| `name-stated` | a stored record: the owner's words, enforced by nothing |

Liveness is always read from the contract, because it is the one answer never
worth taking at one remove and it is a single cheap call. `nameAgrees` reports
whether the name's own computed record matched it — `false` means the name is
answering from somewhere that disagrees with the chain, so stop believing the
record. It costs you nothing either way, since every field already came from the
contract.

`endpoint` and `context` are the owner's words. Nothing enforces them and this
package does not pretend otherwise.

## What it does not tell you

The name is **not an identity**. A `.eth` name costs a few dollars and no KYC.
What it gives you is continuity, a delegation chain, and a stake that can be
lost — enough to hold someone accountable, not enough to know who they are.

Neither is `headroom6` a payment guarantee. It is what the vault will still
release, which is the right number for deciding whether to extend something and
the wrong one for treating a signature as cleared.

## License

MIT
