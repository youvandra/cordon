# @cordon/attest

The conduct record, priced. `GET /attest/:agentId` answers the one question a
seller asks before it serves an agent: does this buyer hold a live mandate, and
what did the contract refuse it?

```bash
CORDON_ATTEST_KEY=0x… node src/main.ts --chain 5042002
```

Live at **<https://attest.getcordon.xyz>**, behind nginx on the box that also
serves the site.

| | |
|---|---|
| `GET /health` | the terms, the range read, and the counts. Free |
| `GET /attest/:agentId` | the record. **$0.01**, x402 `exact` |

The same facts `/agent/:id` shows a human, for a caller in a loop, behind x402.

## Why a cent, and not a tenth of one

The price is a fixture rather than a measurement, but it is not a preference
either. **Circle charges $0.0035 for a same-chain Gateway transfer on Arc, on
top of the value rather than out of it**, so a tranche can only pay for its own
settlement when it is larger than the fee: a burn of $0.0100 against a $0.0100
balance is refused for `required 0.0135`. The other rail,
`GatewayWallet.withdraw`, takes fourteen days.

So a tenth of a cent cannot settle here at all, and a cent is the smallest
price that pays for its own release. It also lands under the catalogue median
and inside the band where most live offers already are, which is the other half
of the answer: a check that costs more than the call it guards is a check
nobody makes.

## What is actually being sold

Not the server. The seat. Only the party that refuses can hold a record of
refusals, and every line of the answer names the transaction it came from, so a
buyer can check the whole thing against Arc without trusting this process at
all.

There is no score in the response and there will not be one. A score is an
opinion, and an opinion is what the ERC-8004 baseline already has too much of.

## Two orderings that make a paid endpoint honest

1. **Whether an answer exists is free.** An identity outside the indexed range
   gets a 404 and no offer. Charging for an empty answer turns an endpoint into
   a tollbooth.
2. **Payment is collected before the answer is written, and only a collection
   that succeeded produces one.** A failed settlement returns a 402 saying why,
   and leaves the payer's authorisation unspent.

Replay is refused twice and only the second one counts: this process remembers
the nonces it has seen, and the token refuses a nonce it has already spent. A
restart forgets the first, which is safe precisely because the second is the
guard.

## The payment

x402 `exact` on EVM, which is an EIP-3009 `TransferWithAuthorization` signed off
chain by the payer. They spend no gas; this endpoint holds the signature,
submits it and pays for the transaction. The challenge is written in the dialect
the daemon reads on the buying side, so a Cordon-bounded agent can pay for an
attestation through the fence like anything else.

The EIP-712 domain is read off the token at startup and matched against its own
`DOMAIN_SEPARATOR`. A domain that is one character out produces a signature that
recovers to a stranger: verification passes, settlement reverts, and the failure
looks like the payer's fault. Mismatch is a startup error with a name instead.

## The key

One, and it belongs to the collector. It submits settlements and pays their gas.
It cannot open a mandate, release a refusal or write a record, and nothing in
this package gives it a way to.

## Tests

```bash
npm test
```

`payment.test.ts` and `server.test.ts` are pure and stub the chain;
`collect.test.ts` deploys a token that implements EIP-3009 the way USDC does,
signs as a payer would, and checks that the money moved, that the payer's gas
balance did not, and that the same authorisation cannot be settled twice.

## Running it on a box

`ops/README.md` has the systemd unit and the nginx vhost. Two things it will
refuse to do: start when `packages/contracts/deployments/<chain>.json` is
absent, because an attest endpoint that invents an address answers about
nothing; and start when the token's own `DOMAIN_SEPARATOR` does not match the
EIP-712 domain it would publish.
