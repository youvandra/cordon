/**
 * Taking the payment.
 *
 * An EIP-3009 authorisation is a bearer instrument: the payer signs off chain
 * and pays no gas, and whoever holds the signature submits it. So this is the
 * only part of the endpoint that holds a key, and the key it holds can do
 * exactly one thing — move money the payer already signed to `payTo`. It
 * cannot touch a mandate, a vault or a record, and nothing in this package
 * gives it a way to.
 *
 * The domain is discovered from the token, not assumed. A domain that is one
 * character out produces a signature that recovers to a stranger's address:
 * the verification passes, the settlement reverts, and the failure looks like
 * the payer's fault. Reading `DOMAIN_SEPARATOR()` off the token and matching
 * it turns that into a startup error with a name.
 */
import {
  createPublicClient,
  createWalletClient,
  hashDomain,
  http,
  parseAbi,
  parseSignature,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Payment, TokenDomain } from "./payment.ts";

export const EIP3009_ABI = parseAbi([
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

/** Versions to try when the token has no `version()`. USDC is "2"; the
 *  original FiatToken and most EIP-2612 clones are "1". */
const VERSIONS = ["2", "1"];

/** The four-field domain EIP-3009 tokens use. Stated rather than inferred,
 *  because a domain with a fifth field hashes to something else entirely. */
const EIP712_DOMAIN = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
} as const;

export class CollectError extends Error {}

export interface Collection {
  txHash: Hex;
  payer: Address;
  amount6: bigint;
}

export interface Collector {
  collect(payment: Payment): Promise<Collection>;
}

/**
 * Find the EIP-712 domain this token actually verifies against.
 *
 * Throws rather than falling back to a guess. A token whose separator matches
 * nothing we can build is a token this endpoint cannot be paid in, and saying
 * so at startup costs one restart; discovering it at settlement costs a payer
 * an answer they signed for.
 */
export async function resolveDomain(
  client: PublicClient,
  token: Address,
  chainId: number,
): Promise<TokenDomain> {
  const read = <T>(functionName: string) =>
    client.readContract({ address: token, abi: EIP3009_ABI, functionName: functionName as never }) as Promise<T>;

  let separator: Hex;
  try {
    separator = await read<Hex>("DOMAIN_SEPARATOR");
  } catch (error) {
    throw new CollectError(
      `${token} has no DOMAIN_SEPARATOR(), so it does not implement EIP-3009 and ` +
        `cannot settle an x402 exact payment. Point CORDON_ATTEST_ASSET at a token that does. ` +
        `(${(error as Error).message})`,
    );
  }

  let name: string;
  try {
    name = await read<string>("name");
  } catch {
    throw new CollectError(`${token} has no name(), so its EIP-712 domain cannot be built`);
  }

  const declared = await read<string>("version").catch(() => null);
  const candidates = declared ? [declared, ...VERSIONS] : VERSIONS;

  for (const version of candidates) {
    const domain = { name, version, chainId, verifyingContract: token };
    /* `chainId` is a uint256 in the domain type, so it is hashed as one here
       even though it travels as a number everywhere else. */
    const hashed = hashDomain({
      domain: { ...domain, chainId: BigInt(chainId) },
      types: EIP712_DOMAIN,
    });
    if (hashed.toLowerCase() === separator.toLowerCase()) return domain;
  }

  throw new CollectError(
    `${token} reports DOMAIN_SEPARATOR ${separator}, which does not match name "${name}" at ` +
      `version ${candidates.join(" or ")} on chain ${chainId}. A payer signing against a domain ` +
      `this endpoint published would be refused by the token, so it refuses to start instead.`,
  );
}

export interface Eip3009Options {
  rpcUrl: string;
  chain: Chain;
  token: Address;
  /** The submitter. It pays gas and holds nothing else. */
  privateKey: Hex;
}

export class Eip3009Collector implements Collector {
  private readonly publicClient: PublicClient;
  private readonly wallet: ReturnType<typeof createWalletClient>;
  private readonly token: Address;

  constructor(options: Eip3009Options) {
    this.token = options.token;
    this.publicClient = createPublicClient({
      chain: options.chain,
      transport: http(options.rpcUrl),
      /* Arc settles in under a second. viem's default four-second poll would
         make a tenth-of-a-cent call feel like a timeout. */
      pollingInterval: 250,
    }) as PublicClient;
    this.wallet = createWalletClient({
      account: privateKeyToAccount(options.privateKey),
      chain: options.chain,
      transport: http(options.rpcUrl),
    });
  }

  get submitter(): Address {
    return this.wallet.account!.address;
  }

  /**
   * Simulate, then send.
   *
   * The simulation is what turns a bad payment into a 402 with a reason
   * instead of a burnt transaction, and it is also how the two signature
   * shapes are told apart: FiatTokenV2 takes `(v, r, s)`, V2_2 and most
   * newer tokens take `bytes`. Whichever simulates is the one that exists.
   */
  async collect(payment: Payment): Promise<Collection> {
    const a = payment.authorization;
    const base = [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce] as const;

    const attempts: { args: readonly unknown[]; shape: string }[] = [
      { args: [...base, payment.signature], shape: "bytes" },
      { args: [...base, ...splitSignature(payment.signature)], shape: "v,r,s" },
    ];

    const failures: string[] = [];
    for (const attempt of attempts) {
      try {
        const { request } = await this.publicClient.simulateContract({
          address: this.token,
          abi: EIP3009_ABI,
          functionName: "transferWithAuthorization",
          args: attempt.args as never,
          account: this.wallet.account,
        });
        const txHash = await this.wallet.writeContract(request as never);
        const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
          throw new CollectError(`settlement reverted in ${txHash}`);
        }
        return { txHash, payer: a.from, amount6: a.value };
      } catch (error) {
        if (error instanceof CollectError) throw error;
        failures.push(`${attempt.shape}: ${short(error)}`);
      }
    }

    throw new CollectError(`the token refused this authorisation. ${failures.join("; ")}`);
  }
}

function splitSignature(signature: Hex): [number, Hex, Hex] {
  const { v, r, s, yParity } = parseSignature(signature);
  return [Number(v ?? BigInt(yParity) + 27n), r, s];
}

/* A viem revert carries the whole call, which is not what a payer needs to
   read. Its short message is, and it is the half that names the require the
   token failed on. */
function short(error: unknown): string {
  const viem = error as { shortMessage?: string; message?: string };
  const message = viem.shortMessage ?? viem.message ?? String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 200);
}
