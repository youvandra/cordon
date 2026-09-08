/**
 * The 402 this endpoint answers with.
 *
 * Written in the same dialect the daemon reads on the buying side — CAIP-2
 * network, base-unit `amount` as a string, `payTo` naming the recipient — so
 * a Cordon-bounded agent can pay for an attestation through the same code
 * path it uses for anything else, and be refused by the same contract if the
 * price ever exceeded its tranche.
 *
 * `extra` carries the token's EIP-712 domain, because a payer has to sign
 * against the domain the token will verify against, and guessing it produces
 * a signature that recovers to the wrong address.
 */
import type { Terms } from "./payment.ts";
import { ATTEST } from "../../fixtures/src/index.ts";

export interface ChallengeOptions {
  terms: Terms;
  /** The URL that was asked for, echoed so a payer signs for a resource. */
  resource: string;
  /** Why this 402 was issued, when it followed a payment we could not take. */
  error?: string;
}

export function challengeBody(options: ChallengeOptions): Record<string, unknown> {
  const { terms, resource, error } = options;
  return {
    x402Version: ATTEST.x402Version,
    ...(error ? { error } : {}),
    accepts: [
      {
        scheme: terms.scheme,
        network: terms.network,
        asset: terms.asset,
        payTo: terms.payTo,
        amount: terms.price6.toString(),
        maxTimeoutSeconds: ATTEST.maxTimeoutSeconds,
        resource,
        description:
          "One agent's conduct record: does it hold a live mandate, and what did the contract refuse it",
        mimeType: "application/json",
        /* The domain a payer signs `TransferWithAuthorization` against. Read
           off the token at startup, never assumed. */
        extra: { name: terms.domain.name, version: terms.domain.version },
      },
    ],
  };
}
