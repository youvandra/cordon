/**
 * Reading a seller's 402.
 *
 * This is where the counterparty comes from, and it matters that it comes from
 * here. The agent above the daemon can only say "fetch this URL"; the address
 * that gets paid is `payTo` in the seller's own challenge, and the daemon
 * copies it onto the chain before paying. An agent cannot name a recipient
 * because nothing it can call takes one.
 *
 * Everything in this file is pure. A challenge is untrusted input written by
 * whoever owns the URL, so it is parsed and validated rather than trusted, and
 * every field the daemon acts on is checked before it is used.
 */

/** One way a seller is willing to be paid. Shape verified against Circle's
 *  live x402 catalogue on 2026-09-08. */
export interface Offer {
  scheme: string;
  /** CAIP-2, e.g. "eip155:8453" for Base. */
  network: string;
  /** ERC-20 address of the asset, in that network's format. */
  asset: string;
  /** Who gets paid. The counterparty, and the only place it is ever named. */
  payTo: string;
  /** Base units, as a decimal string. Never a float. */
  amount: bigint;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export interface Challenge {
  x402Version: number;
  offers: Offer[];
}

export class ChallengeError extends Error {}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CAIP2 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;

/**
 * Parse a 402 response. Returns null when the response is not a payment
 * challenge at all, and throws when it claims to be one but is malformed —
 * those are different problems and the caller handles them differently.
 */
export function parseChallenge(status: number, body: unknown): Challenge | null {
  if (status !== 402) return null;
  if (typeof body !== "object" || body === null) {
    throw new ChallengeError("402 with no JSON body");
  }

  const raw = body as Record<string, unknown>;
  const version = raw.x402Version;
  if (typeof version !== "number") {
    throw new ChallengeError("402 body has no x402Version");
  }

  const accepts = raw.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new ChallengeError("402 body offers no way to pay");
  }

  return { x402Version: version, offers: accepts.map(parseOffer) };
}

function parseOffer(input: unknown, index: number): Offer {
  if (typeof input !== "object" || input === null) {
    throw new ChallengeError(`accepts[${index}] is not an object`);
  }
  const o = input as Record<string, unknown>;

  const scheme = str(o.scheme, `accepts[${index}].scheme`);
  const network = str(o.network, `accepts[${index}].network`);
  if (!CAIP2.test(network)) {
    throw new ChallengeError(`accepts[${index}].network is not a CAIP-2 id: ${network}`);
  }

  const payTo = str(o.payTo, `accepts[${index}].payTo`);
  const asset = str(o.asset, `accepts[${index}].asset`);

  /* An amount is base units and arrives as a string. Parsing it as a number
     would silently round anything past 2^53, and this is money. */
  const amountRaw = o.amount;
  if (typeof amountRaw !== "string" || !/^\d+$/.test(amountRaw)) {
    throw new ChallengeError(`accepts[${index}].amount is not a base-unit string`);
  }
  const amount = BigInt(amountRaw);
  if (amount <= 0n) {
    throw new ChallengeError(`accepts[${index}].amount is not positive`);
  }

  return {
    scheme,
    network,
    asset,
    payTo,
    amount,
    maxTimeoutSeconds: typeof o.maxTimeoutSeconds === "number" ? o.maxTimeoutSeconds : undefined,
    extra: typeof o.extra === "object" && o.extra !== null ? (o.extra as Record<string, unknown>) : undefined,
  };
}

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new ChallengeError(`${where} is missing`);
  }
  return v;
}

export interface Acceptable {
  /** CAIP-2 ids this daemon can settle on. */
  networks: string[];
  /** Asset addresses it will pay in, lowercased, per network. */
  assets: string[];
  scheme?: string;
}

/**
 * Choose an offer we can actually settle.
 *
 * Deliberately not "the cheapest": price is chosen by the seller and picking
 * on it lets a seller steer us onto a network or an asset we did not intend to
 * hold. The daemon settles on what it was configured for, or it does not pay.
 */
export function selectOffer(challenge: Challenge, ok: Acceptable): Offer {
  const scheme = ok.scheme ?? "exact";
  const networks = new Set(ok.networks);
  const assets = new Set(ok.assets.map((a) => a.toLowerCase()));

  const match = challenge.offers.find(
    (o) => o.scheme === scheme && networks.has(o.network) && assets.has(o.asset.toLowerCase()),
  );

  if (!match) {
    throw new ChallengeError(
      `no offer this daemon can settle: seller accepts ${challenge.offers
        .map((o) => `${o.scheme}/${o.network}`)
        .join(", ")}`,
    );
  }

  /* An EVM payTo has to look like one before it reaches a contract call. A
     seller controls this string, and it becomes the counterparty on chain. */
  if (match.network.startsWith("eip155:") && !ADDRESS.test(match.payTo)) {
    throw new ChallengeError(`payTo is not an address: ${match.payTo}`);
  }

  return match;
}
