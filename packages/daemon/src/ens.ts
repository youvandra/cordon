/**
 * The chain a name is resolved on, defined once.
 *
 * `viem/chains`'s Sepolia carries the address of ENS**v1**'s Universal
 * Resolver. The names Cordon publishes are registered in ENSv2 — a different
 * registry with a different resolver — so a client that takes the library's
 * default asks a namespace these agents do not live in, and every lookup comes
 * back empty about an agent that is published and resolvable.
 *
 * It is here rather than in either script because both `resolve-agent.ts` and
 * `check-authority.ts` need it, and two copies of a resolver address is one
 * copy that can be corrected while the other keeps answering `absent`.
 */
import { defineChain } from "viem";
import { SEPOLIA, ENSV2 } from "../../fixtures/src/index.ts";

export const ensChain = defineChain({
  id: SEPOLIA.chainId,
  name: SEPOLIA.name,
  nativeCurrency: {
    name: SEPOLIA.nativeName,
    symbol: SEPOLIA.nativeSymbol,
    decimals: SEPOLIA.nativeDecimals,
  },
  rpcUrls: { default: { http: [SEPOLIA.rpc] } },
  blockExplorers: { default: { name: "explorer", url: SEPOLIA.explorer } },
  contracts: {
    multicall3: { address: SEPOLIA.multicall3 as `0x${string}` },
    ensUniversalResolver: { address: ENSV2.universalResolver as `0x${string}` },
  },
});
