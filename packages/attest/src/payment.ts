/**
 * Reading a buyer's payment, from the other side of the 402.
 *
 * The daemon parses a seller's challenge; this parses a buyer's answer to
 * ours. Everything here is pure: an `X-PAYMENT` header is untrusted input
 * written by whoever wants the record, so every field is checked before any
 * of it reaches a chain, and a failed check names itself.
 *
 * The scheme is x402 `exact` on EVM, which is an EIP-3009
 * `TransferWithAuthorization` signed by an EOA. That is the whole reason this
 * endpoint can exist at Cordon's price: the signature is off chain, costs the
 * payer no gas, and is a bearer instrument the seller submits itself.
 */
import { recoverTypedDataAddress, type Address, type Hex } from "viem";

export interface Authorization {
  /** The payer. Recovered from the signature and compared, never trusted. */
  from: Address;
  /** Who gets paid. Must be this endpoint's own payee. */
  to: Address;
  /** Base units of the asset. */
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  /** 32 bytes chosen by the payer. Replay is refused on it. */
  nonce: Hex;
}

export interface Payment {
  x402Version: number;
  scheme: string;
  /** CAIP-2, the same dialect the daemon reads on the buying side. */
  network: string;
  asset: Address;
  signature: Hex;
  authorization: Authorization;
}

/** The EIP-712 domain of the token being moved. Read from the token itself at
 *  startup rather than assumed — see `collect.ts`. */
export interface TokenDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export interface Terms {
  network: string;
  asset: Address;
  payTo: Address;
  price6: bigint;
  scheme: string;
  minLeadSeconds: number;
  domain: TokenDomain;
  /** The x402 version this endpoint publishes in its own 402. */
  x402Version: number;
}

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export class PaymentError extends Error {}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Decode the header. Throws on anything malformed, because a payer who sent a
 * broken payment wants to know that rather than to be told the price again.
 */
export function parsePayment(header: string): Payment {
  let decoded: string;
  try {
    decoded = Buffer.from(header.trim(), "base64").toString("utf8");
  } catch {
    throw new PaymentError("payment header is not base64");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(decoded);
  } catch {
    /* A payer that sent the JSON unencoded is a common first mistake, so it
       is worth trying before refusing them. */
    try {
      raw = JSON.parse(header);
    } catch {
      throw new PaymentError("payment header is not base64 JSON");
    }
  }

  if (typeof raw !== "object" || raw === null) throw new PaymentError("payment is not an object");
  const body = raw as Record<string, unknown>;

  const version = body.x402Version;
  if (typeof version !== "number") throw new PaymentError("payment has no x402Version");

  const inner = body.payload;
  if (typeof inner !== "object" || inner === null) throw new PaymentError("payment has no payload");
  const payload = inner as Record<string, unknown>;

  const signature = payload.signature;
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new PaymentError("payload.signature is missing");
  }

  const auth = payload.authorization;
  if (typeof auth !== "object" || auth === null) throw new PaymentError("payload has no authorization");
  const a = auth as Record<string, unknown>;

  return {
    x402Version: version,
    scheme: str(body.scheme, "scheme"),
    network: str(body.network, "network"),
    /* The asset may travel on the payment or be implied by the offer. Implied
       is the common case; when it is stated it is checked against ours. */
    asset: (typeof body.asset === "string" ? body.asset : "0x") as Address,
    signature: signature as Hex,
    authorization: {
      from: address(a.from, "authorization.from"),
      to: address(a.to, "authorization.to"),
      value: units(a.value, "authorization.value"),
      validAfter: units(a.validAfter, "authorization.validAfter"),
      validBefore: units(a.validBefore, "authorization.validBefore"),
      nonce: bytes32(a.nonce, "authorization.nonce"),
    },
  };
}

/**
 * Is this payment one we can take?
 *
 * Returns a reason rather than throwing, because every refusal here goes back
 * to the payer as text they can act on. The order is deliberate: the cheap
 * structural checks first, the signature recovery last, so a malformed
 * payment never costs a key recovery.
 */
export async function verifyPayment(
  payment: Payment,
  terms: Terms,
  nowSeconds: bigint,
): Promise<{ ok: true; payer: Address } | { ok: false; reason: string }> {
  const bad = (reason: string) => ({ ok: false as const, reason });

  /* Checked, having been parsed and then ignored. The version decides what
     the rest of the payload means — a future one may spell `authorization`
     differently or sign over different fields — so taking a payload whose
     version this endpoint does not implement is agreeing to terms nobody has
     read. The offer states the version; a payer that answers with another one
     is told, rather than having its fields read as if they were ours. */
  if (payment.x402Version !== terms.x402Version) {
    return bad(`payment is x402 v${payment.x402Version}, this endpoint speaks v${terms.x402Version}`);
  }
  if (payment.scheme !== terms.scheme) return bad(`scheme is ${payment.scheme}, this endpoint takes ${terms.scheme}`);
  if (payment.network !== terms.network) return bad(`network is ${payment.network}, this endpoint settles on ${terms.network}`);
  if (payment.asset !== "0x" && payment.asset.toLowerCase() !== terms.asset.toLowerCase()) {
    return bad(`asset is ${payment.asset}, this endpoint takes ${terms.asset}`);
  }

  const auth = payment.authorization;
  if (auth.to.toLowerCase() !== terms.payTo.toLowerCase()) {
    return bad(`authorization pays ${auth.to}, this endpoint is paid at ${terms.payTo}`);
  }
  if (auth.value < terms.price6) {
    return bad(`authorization is for ${auth.value}, the price is ${terms.price6}`);
  }
  if (auth.validAfter > nowSeconds) return bad("authorization is not valid yet");
  /* Not "has not expired": it has to still be valid when the settlement lands,
     and a payment that expires in flight leaves the seller unpaid and the
     buyer un-charged. */
  if (auth.validBefore <= nowSeconds + BigInt(terms.minLeadSeconds)) {
    return bad(`authorization expires within ${terms.minLeadSeconds}s, too soon to settle`);
  }

  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({
      domain: terms.domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: auth,
      signature: payment.signature,
    });
  } catch (error) {
    return bad(`signature does not recover: ${(error as Error).message}`);
  }

  if (signer.toLowerCase() !== auth.from.toLowerCase()) {
    return bad(`signature is by ${signer}, the authorization says ${auth.from}`);
  }

  return { ok: true, payer: auth.from };
}

/**
 * Nonces already spent here.
 *
 * This is a courtesy, not the guard. The authority on replay is the token:
 * `transferWithAuthorization` reverts on a nonce it has already seen, so a
 * replay that gets past this map still collects nothing. Keeping it in memory
 * means a restart forgets, and forgetting is safe for exactly that reason.
 *
 * Which is also why it can be forgotten on a schedule. Every authorisation
 * carries a `validBefore`, and past it the token refuses the nonce whatever
 * this set believes — so an entry is useful exactly until then and is dead
 * weight afterwards. Without that this grew by one entry per sale forever, on
 * a process meant to stay up, and the only thing that ever emptied it was a
 * restart.
 */
export class Nonces {
  /** Key to the second after which the token will refuse it anyway. */
  private readonly seen = new Map<string, bigint>();

  key(auth: Authorization): string {
    return `${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`;
  }

  has(auth: Authorization): boolean {
    return this.seen.has(this.key(auth));
  }

  add(auth: Authorization): void {
    this.seen.set(this.key(auth), auth.validBefore);
  }

  /* A settlement that failed consumed nothing on the token, so the payer is
     entitled to try the same authorisation again. Holding it here after a
     failure would refuse them their own money. */
  drop(auth: Authorization): void {
    this.seen.delete(this.key(auth));
  }

  /**
   * Forget what the token would refuse on its own.
   *
   * Called with the same clock the verification uses, so a test drives it and
   * a running endpoint does not need a timer of its own.
   */
  forgetExpired(nowSeconds: bigint): number {
    let dropped = 0;
    for (const [key, validBefore] of this.seen) {
      if (validBefore > nowSeconds) continue;
      this.seen.delete(key);
      dropped += 1;
    }
    return dropped;
  }

  get size(): number {
    return this.seen.size;
  }
}

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || v.length === 0) throw new PaymentError(`${where} is missing`);
  return v;
}

function address(v: unknown, where: string): Address {
  if (typeof v !== "string" || !ADDRESS.test(v)) throw new PaymentError(`${where} is not an address`);
  return v as Address;
}

function bytes32(v: unknown, where: string): Hex {
  if (typeof v !== "string" || !BYTES32.test(v)) throw new PaymentError(`${where} is not 32 bytes`);
  return v as Hex;
}

/* Base units arrive as strings. Parsing money as a number rounds it above
   2^53 and rounds it silently, which is the one failure mode this project
   cannot have. */
function units(v: unknown, where: string): bigint {
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  throw new PaymentError(`${where} is not a base-unit string`);
}
