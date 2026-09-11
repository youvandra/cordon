/**
 * Circle's Gateway, from the paying side.
 *
 * A Gateway balance is spent by an EIP-712 burn intent its depositor signs off
 * chain and hands to Circle's API, which answers with an attestation that
 * anyone may mint with on the destination chain. Cordon's vault funds that
 * balance; this releases it.
 *
 * Everything here was verified against Arc testnet on 11 September rather than
 * read from a guide: the domain is `{ name: "GatewayWallet", version: "1" }`
 * with the types below, `/v1/transfer` takes no credential, and the fee is
 * charged **on top of** the value — a burn of $0.0065 against a $0.0100
 * balance is accepted and a burn of $0.0100 against it is refused for
 * `required 0.0135`.
 */
import { pad, toHex, parseAbi, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { GATEWAY } from "../../fixtures/src/index.ts";

export const GATEWAY_EIP712_DOMAIN = { name: "GatewayWallet", version: "1" } as const;

/** The burn intent, field for field. A missing field hashes to a signature
 *  Circle rejects; a re-ordered one hashes to something it accepts and nobody
 *  meant. */
export const BURN_INTENT_TYPES = {
  TransferSpec: [
    { name: "version", type: "uint32" },
    { name: "sourceDomain", type: "uint32" },
    { name: "destinationDomain", type: "uint32" },
    { name: "sourceContract", type: "bytes32" },
    { name: "destinationContract", type: "bytes32" },
    { name: "sourceToken", type: "bytes32" },
    { name: "destinationToken", type: "bytes32" },
    { name: "sourceDepositor", type: "bytes32" },
    { name: "destinationRecipient", type: "bytes32" },
    { name: "sourceSigner", type: "bytes32" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "hookData", type: "bytes" },
  ],
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
} as const;

export const GATEWAY_MINTER_ABI = parseAbi([
  "function gatewayMint(bytes attestationPayload, bytes signature)",
]);

export interface BurnIntent {
  maxBlockHeight: bigint;
  maxFee: bigint;
  spec: Record<string, unknown>;
}

export interface IntentTerms {
  /** Whose balance is burned, and — here, always — who receives the mint. */
  depositor: Address;
  wallet: Address;
  minter: Address;
  token: Address;
  domain: number;
  /** What lands on the destination. The fee is charged on top of it. */
  value: bigint;
  maxFee: bigint;
  maxBlockHeight: bigint;
  /** Injectable so a test asserts a whole intent rather than its shape. */
  salt?: Hex;
}

const b32 = (address: string): Hex => pad(address.toLowerCase() as Hex, { size: 32 });
const ZERO = "0x0000000000000000000000000000000000000000";

/** Pure, so the typed data a key signs can be asserted without a key. */
export function buildBurnIntent(terms: IntentTerms): BurnIntent {
  return {
    maxBlockHeight: terms.maxBlockHeight,
    maxFee: terms.maxFee,
    spec: {
      version: 1,
      sourceDomain: terms.domain,
      destinationDomain: terms.domain,
      sourceContract: b32(terms.wallet),
      destinationContract: b32(terms.minter),
      sourceToken: b32(terms.token),
      destinationToken: b32(terms.token),
      sourceDepositor: b32(terms.depositor),
      /* The recipient is the depositor, and that is the whole shape of this
         step: the tranche is brought back out of Gateway into the operator's
         own balance so an x402 `exact` payment — an EIP-3009 authorisation
         over that balance — can be signed against it. Naming the seller here
         would pay them Gateway-side and leave the seller's own 402 unanswered. */
      destinationRecipient: b32(terms.depositor),
      sourceSigner: b32(terms.depositor),
      /* Anyone may submit the mint. We do, immediately. */
      destinationCaller: b32(ZERO),
      value: terms.value,
      salt: terms.salt ?? toHex(crypto.getRandomValues(new Uint8Array(32))),
      hookData: "0x",
    },
  };
}

export interface TransferAccepted {
  attestation: Hex;
  signature: Hex;
  transferId: string;
  /** What Circle actually charged, as it reports it. Never our own figure. */
  feeTotal: string;
}

export class GatewayError extends Error {}

/**
 * The API. Every error it answers with is quoted rather than summarised: the
 * fee floor and the block-height window are both facts about Circle that we
 * would otherwise be guessing at, and its refusals are how we learned them.
 */
export class GatewayApi {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { base?: string; fetchImpl?: typeof fetch } = {}) {
    this.base = options.base ?? GATEWAY.api;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** The window a burn intent must expire inside, read per call because it
   *  moves with the chain: an intent built against a stale height is refused
   *  with `maxBlockHeight is too low`. */
  async expirationHeight(domain: number): Promise<bigint> {
    const res = await this.fetchImpl(`${this.base}/v1/info`);
    if (!res.ok) throw new GatewayError(`gateway /v1/info answered ${res.status}`);
    const body = (await res.json()) as { domains: { domain: number; burnIntentExpirationHeight: string }[] };
    const found = body.domains.find((d) => d.domain === domain);
    if (!found) throw new GatewayError(`gateway does not serve domain ${domain}`);
    return BigInt(found.burnIntentExpirationHeight);
  }

  async balance(domain: number, depositor: Address): Promise<string> {
    const res = await this.fetchImpl(`${this.base}/v1/balances`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "USDC", sources: [{ domain, depositor }] }),
    });
    if (!res.ok) throw new GatewayError(`gateway /v1/balances answered ${res.status}`);
    const body = (await res.json()) as { balances?: { balance: string }[] };
    return body.balances?.[0]?.balance ?? "0";
  }

  async transfer(intent: BurnIntent, signature: Hex): Promise<TransferAccepted> {
    const body = JSON.stringify([{ burnIntent: intent, signature }], (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const res = await this.fetchImpl(`${this.base}/v1/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* A body that is not JSON is quoted whole. */
      }
      throw new GatewayError(`Circle refused the burn intent: ${message}`);
    }
    const parsed = JSON.parse(text) as {
      attestation: Hex;
      signature: Hex;
      transferId: string;
      fees?: { total?: string };
    };
    return {
      attestation: parsed.attestation,
      signature: parsed.signature,
      transferId: parsed.transferId,
      feeTotal: parsed.fees?.total ?? "unstated",
    };
  }
}

/** Submit the attestation. The money is in the operator's own balance when
 *  this returns, and not before. */
export async function mint(
  clients: { publicClient: PublicClient; wallet: WalletClient },
  minter: Address,
  accepted: TransferAccepted,
): Promise<Hex> {
  const { request } = await clients.publicClient.simulateContract({
    address: minter,
    abi: GATEWAY_MINTER_ABI,
    functionName: "gatewayMint",
    args: [accepted.attestation, accepted.signature],
    account: clients.wallet.account!,
  });
  const hash = await clients.wallet.writeContract(request);
  await clients.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
