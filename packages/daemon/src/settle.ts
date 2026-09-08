/**
 * Turning a Gateway balance into a payment.
 *
 * This is the half no contract can reach. A payment out of a Circle Gateway
 * balance is a burn intent signed off chain by its depositor — the daemon —
 * and `destinationRecipient` is a field inside that signature. Cordon bounds
 * the balance; this spends it.
 */
import type { Address, Hex } from "viem";

export interface Payment {
  /** The seller, copied from their own 402 challenge. */
  to: Address;
  /** Base units of the asset. */
  value: bigint;
  asset: Address;
  /** CAIP-2 id of the network the seller wants to be paid on. */
  network: string;
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

/**
 * Circle's Gateway, the real path — and deliberately not implemented.
 *
 * What is missing is not code, it is two facts. The EIP-712 domain and type
 * definition for a burn intent are not in the public Gateway guide, and
 * guessing them produces a signature that looks right and is rejected, or
 * worse, is not rejected. And submission needs a Circle API credential this
 * project does not hold.
 *
 * Writing a plausible signer here would make the daemon look finished while
 * paying nobody, which is the failure this whole project is arguing against.
 * So it says what it needs, by name.
 */
export class CircleSettler implements Settler {
  async settle(): Promise<Settlement> {
    throw new Error(
      "Circle settlement is not wired: the burn-intent EIP-712 domain and " +
        "types are not published in the Gateway guide, and submission needs a " +
        "Circle API key. See GATEWAY in packages/fixtures. Until both exist, " +
        "run against a local settler and do not claim a real payment.",
    );
  }
}
