/**
 * The chain this console speaks for, named once.
 *
 * Cordon is deployed on more than one chain, and the console answers for
 * exactly one of them at a time. Before this existed, every file that needed a
 * chain imported `ARC` directly, so moving the console meant editing nine of
 * them and hoping none was missed — and a surface reading one chain while the
 * bar above it names another is the failure this project spends most of its
 * rules preventing.
 *
 * **It points at Sepolia, because that is where ENSv2 is.** An agent's name,
 * the roles that mirror its mandate, and the tree those names hang from all
 * live there, and a console that showed a different tree from the one a name
 * resolves to would be answering a question nobody asked. The Arc deployment
 * is untouched and still reachable — `deployments/5042002.json` is still the
 * file it was, and `OTHER` below is its fixture.
 *
 * To move the console back, change `CHAIN`. Nothing else in this package
 * names a chain.
 */
import { defineChain } from "viem";
import { ARC, SEPOLIA, DEPLOYMENTS, DEMOS } from "@cordon/fixtures";

export const CHAIN = SEPOLIA;
/** The chain this console is not on, for the one or two places that say so. */
export const OTHER = ARC;

export const chain = defineChain({
  id: CHAIN.chainId,
  name: CHAIN.name,
  nativeCurrency: {
    name: CHAIN.nativeName,
    symbol: CHAIN.nativeSymbol,
    decimals: CHAIN.nativeDecimals,
  },
  rpcUrls: { default: { http: [CHAIN.rpc] } },
  blockExplorers: { default: { name: "explorer", url: CHAIN.explorer } },
  /* Declared so viem may pack a batch of `eth_call`s into one request. A tree
     is read view by view, and a public endpoint counts requests. */
  contracts: { multicall3: { address: CHAIN.multicall3 as `0x${string}` } },
});

/**
 * What is deployed on that chain, or nothing.
 *
 * `pending` is a value here too: with no deployment every surface says so
 * rather than drawing an invented address.
 */
export const DEPLOYED = DEPLOYMENTS[CHAIN.chainId] ?? null;

/**
 * The tree a visitor without a wallet is shown.
 *
 * One per chain, because an owner who signed on one has signed nothing on the
 * other. Its owner address is public — a mandate's owner is a field of the
 * mandate — and the same code path that shows an owner their own tree shows a
 * visitor this one, read-only, with a banner saying so. No key is implied.
 */
export const DEMO_TREE = DEMOS[CHAIN.chainId] ?? null;

/** Where a reader goes to check something for themselves. */
export const explorerFor = {
  address: (address: string) => `${CHAIN.explorer}/address/${address}`,
  tx: (hash: string) => `${CHAIN.explorer}/tx/${hash}`,
};
