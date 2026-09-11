/**
 * Turning a Gateway balance into a payment.
 *
 * This is the half no contract can reach. The vault puts a tranche into the
 * operator's Circle Gateway balance; an x402 `exact` payment is an EIP-3009
 * authorisation over the operator's **token** balance. So settlement is two
 * steps: bring the tranche back out of Gateway, then sign the authorisation
 * the seller will submit itself.
 *
 * What this costs is not ours to round off. Circle charges **$0.0035** to
 * release a tranche same-chain on Arc, and the mint costs about $0.003 of gas
 * — both paid by the operator, like gas, and neither inside the mandate. The
 * bound is on the tranche; the rail's toll is beside it. A price below the
 * fee is a price this rail cannot settle at all, and the settler says so with
 * Circle's own number rather than failing vaguely.
 */
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { GATEWAY } from "../../fixtures/src/index.ts";
import {
  GatewayApi,
  buildBurnIntent,
  mint,
  GATEWAY_EIP712_DOMAIN,
  BURN_INTENT_TYPES,
  type TransferAccepted,
} from "./gateway.ts";

export interface Payment {
  /** The seller, copied from their own 402 challenge. */
  to: Address;
  /** Base units of the asset. */
  value: bigint;
  asset: Address;
  /** CAIP-2 id of the network the seller wants to be paid on. */
  network: string;
  /** The seller's `extra`, which carries the token's EIP-712 name and version.
   *  A payer that guesses these signs something the token will not verify. */
  extra?: Record<string, unknown>;
  /** How long the seller said the authorisation has to stay valid. */
  maxTimeoutSeconds?: number;
}

export interface Settlement {
  /** What the caller puts in the PAYMENT-SIGNATURE header, or equivalent. */
  proof: string;
  /** Present only when settlement touched a chain we can watch. */
  txHash?: Hex;
}

export interface Settler {
  settle(node: Hex, payment: Payment): Promise<Settlement>;
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

export class SettlementError extends Error {}

export interface CircleOptions {
  publicClient: PublicClient;
  /** The operator's signer for a node. The gate holds the key; this borrows
   *  the signer, so there is still one place in the process a key lives. */
  walletFor: (node: Hex) => WalletClient;
  chainId: number;
  /** Overridable so a test drives the API without the network. */
  api?: GatewayApi;
  /** Blocks of margin over the window `/v1/info` reports, because the chain
   *  moves between reading it and submitting: Circle refused an intent built
   *  on a height three blocks stale. */
  heightMargin?: bigint;
  now?: () => number;
  nonce?: () => Hex;
  /** Overridable so a test can exercise the whole path without a chain. */
  mint?: (wallet: WalletClient, minter: Address, accepted: TransferAccepted) => Promise<Hex>;
}

/**
 * Circle's Gateway, the real path.
 *
 * It used to throw on the grounds that the burn-intent EIP-712 definition was
 * unpublished and that submission needed a Circle key. Both were answered on
 * 11 September by doing it: the domain and types live in `gateway.ts`, and
 * `gateway-api-testnet.circle.com` takes no credential.
 */
export class CircleSettler implements Settler {
  private readonly options: CircleOptions;
  private readonly api: GatewayApi;

  constructor(options: CircleOptions) {
    this.options = options;
    this.api = options.api ?? new GatewayApi();
  }

  async settle(node: Hex, payment: Payment): Promise<Settlement> {
    const wallet = this.options.walletFor(node);
    const operator = wallet.account!.address;

    /* Before anything is spent. A tranche released for a payment that cannot
       then be signed is a tranche gone and nothing bought — and the fee is
       gone with it, which is the expensive half. */
    const token = tokenDomain(payment, this.options.chainId);

    /* The fee is charged on top of the value, so the most of a tranche that
       can be released is the tranche less the fee. A tranche at or under the
       fee releases nothing: state Circle's floor rather than sending an
       intent that will be refused for arithmetic we can do here. */
    if (payment.value <= GATEWAY.baseFee6) {
      throw new SettlementError(
        `this purchase is ${payment.value} base units and Circle's Gateway fee on Arc is ` +
          `${GATEWAY.baseFee6} — a tranche at or below the fee cannot pay for its own release. ` +
          `The alternative rail, GatewayWallet.withdraw, has a ${GATEWAY.withdrawalDelaySeconds}-second delay. ` +
          `Neither settles a payment this small, and that is a fact about the rail.`,
      );
    }

    const released = payment.value - GATEWAY.baseFee6;
    const intent = buildBurnIntent({
      depositor: operator,
      wallet: GATEWAY.wallet as Address,
      minter: GATEWAY.minter as Address,
      token: payment.asset,
      domain: GATEWAY.domain,
      value: released,
      maxFee: GATEWAY.baseFee6,
      maxBlockHeight:
        (await this.api.expirationHeight(GATEWAY.domain)) + (this.options.heightMargin ?? 5_000n),
    });

    const signature = await wallet.signTypedData({
      account: wallet.account!,
      domain: GATEWAY_EIP712_DOMAIN,
      types: BURN_INTENT_TYPES,
      primaryType: "BurnIntent",
      message: intent as never,
    });

    const accepted = await this.api.transfer(intent, signature);
    const submit =
      this.options.mint ??
      ((w: WalletClient, minter: Address, a: TransferAccepted) =>
        mint({ publicClient: this.options.publicClient, wallet: w }, minter, a));
    const txHash = await submit(wallet, GATEWAY.minter as Address, accepted);

    /* The seller is paid its whole price. Of that price, everything but the
       fee came out of the tranche the contract released; the fee and the gas
       came out of the operator's own float, which is the same place gas comes
       from and is outside the mandate either way. */
    const proof = await this.authorise(wallet, operator, payment, token);
    return { proof, txHash };
  }

  /** The x402 `exact` payload: an EIP-3009 authorisation the seller submits. */
  private async authorise(
    wallet: WalletClient,
    operator: Address,
    payment: Payment,
    token: TokenDomain,
  ): Promise<string> {
    const now = Math.floor((this.options.now?.() ?? Date.now()) / 1000);
    const authorization = {
      from: operator,
      to: payment.to,
      value: payment.value,
      validAfter: 0n,
      validBefore: BigInt(now + (payment.maxTimeoutSeconds ?? 300)),
      nonce: this.options.nonce?.() ?? randomNonce(),
    };

    const signature = await wallet.signTypedData({
      account: wallet.account!,
      domain: token,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });

    return Buffer.from(
      JSON.stringify({
        x402Version: 2,
        scheme: "exact",
        network: payment.network,
        asset: payment.asset,
        payload: {
          signature,
          authorization: {
            ...authorization,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
          },
        },
      }),
      "utf8",
    ).toString("base64");
  }
}

export interface TokenDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/**
 * The domain the token itself will verify against, taken from the seller's
 * own `extra`. Guessing it produces a signature that recovers to the wrong
 * address — accepted by nothing, and only discovered after the money moved.
 */
function tokenDomain(payment: Payment, chainId: number): TokenDomain {
  const extra = payment.extra ?? {};
  const name = typeof extra.name === "string" ? extra.name : undefined;
  const version = typeof extra.version === "string" ? extra.version : undefined;
  if (!name || !version) {
    throw new SettlementError(
      "the seller's offer carries no EIP-712 name and version in `extra`, and a payer that " +
        "guesses them signs an authorisation the token will not verify",
    );
  }
  return { name, version, chainId, verifyingContract: payment.asset };
}

function randomNonce(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Buffer.from(bytes).toString("hex")}` as Hex;
}
