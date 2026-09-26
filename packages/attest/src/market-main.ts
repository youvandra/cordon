#!/usr/bin/env node
/**
 * The sample market, as a process.
 *
 *     CORDON_CHAIN_ID=11155111 node --env-file="$HOME/cordon/.env.attest" src/market-main.ts
 *
 * It is paid through the attest endpoint's own key, from the same file, so the
 * box holds no key it did not already hold. It indexes nothing and reads no
 * upstream: every body it sells is a fixed sample that says so.
 *
 * The chain comes from the environment, because the point of this seller is
 * to exist on the chain the names are on. Started with no CORDON_CHAIN_ID it
 * takes the default, which is where the agents live.
 */
import { createPublicClient, defineChain, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MARKET, DEMO_SELLER, DEFAULT_CHAIN, chainFacts } from "../../fixtures/src/index.ts";
import { Eip3009Collector, resolveDomain } from "./collect.ts";
import { createMarket } from "./market.ts";
import type { Terms } from "./payment.ts";

const chainId = Number(process.env.CORDON_CHAIN_ID ?? DEFAULT_CHAIN.chainId);

/**
 * Beacon's own RPC, ahead of the shared one.
 *
 * On the box this runs beside `attest`, reads the same `.env.attest` for the
 * key, and that file carries `CORDON_RPC` pointing at Arc — because `attest`
 * is on Arc. Beacon is on Sepolia. Taking `CORDON_RPC` from there gave it a
 * Sepolia chain id and an Arc endpoint, so it looked up Sepolia's USDC on Arc,
 * found no contract, and died on a `DOMAIN_SEPARATOR` that read as a bad token
 * rather than as a wrong network.
 *
 * `CORDON_MARKET_RPC` cannot collide with the other seller's, which is the
 * whole reason it has its own name.
 */
const rpc = process.env.CORDON_MARKET_RPC ?? process.env.CORDON_RPC ?? DEFAULT_CHAIN.rpc;
const port = Number(process.env.CORDON_MARKET_PORT ?? MARKET.port);
const bind = process.env.CORDON_BIND ?? "127.0.0.1";

const key = process.env.CORDON_ATTEST_KEY as Hex | undefined;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("CORDON_ATTEST_KEY is not set. The market submits settlements");
  console.error("with the attest endpoint's key and pays their gas from it.");
  process.exit(2);
}

/* The chain's own gas token, not Arc's. See the note in src/main.ts. */
const facts = chainFacts(chainId);
if (!facts) {
  console.error(`chain ${chainId} is not one this build knows`);
  process.exit(2);
}
const chain = defineChain({
  id: facts.chainId,
  name: facts.name,
  nativeCurrency: {
    name: facts.nativeName,
    symbol: facts.nativeSymbol,
    decimals: facts.nativeDecimals,
  },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({
  chain,
  transport: http(rpc),
  pollingInterval: 250,
  cacheTime: 250,
}) as PublicClient;

/**
 * The endpoint has to be on the chain it was told to serve.
 *
 * Every address below is chosen by chain id — the asset from `facts.erc20`,
 * the domain read from that asset — while every call goes to `rpc`. Let the
 * two disagree and the failure surfaces as whatever the other chain happens
 * to hold at those addresses, which is a token that looks broken or, worse, a
 * real contract that is not the one meant. So it is checked once, here, before
 * a price is quoted to anybody.
 */
const live = await client.getChainId();
if (live !== chainId) {
  console.error(`CORDON_CHAIN_ID is ${chainId} and the RPC answers ${live}.`);
  console.error("Set CORDON_MARKET_RPC to an endpoint for the chain this seller serves.");
  process.exit(2);
}

const asset = (process.env.CORDON_ATTEST_ASSET ?? facts.erc20) as Address;
const domain = await resolveDomain(client, asset, chainId);
const collector = new Eip3009Collector({ rpcUrl: rpc, chain, token: asset, privateKey: key });
const payTo = (process.env.CORDON_MARKET_PAYTO ?? privateKeyToAccount(key).address) as Address;

/* Everything but the price, which each item in the catalogue carries. */
const terms: Omit<Terms, "price6"> = {
  network: `eip155:${chainId}`,
  asset,
  payTo,
  scheme: DEMO_SELLER.scheme,
  minLeadSeconds: DEMO_SELLER.minLeadSeconds,
  domain,
  x402Version: DEMO_SELLER.x402Version,
};

const server = createMarket({ terms, collector });

server.listen(port, bind, () => {
  console.log(`${MARKET.name} — chain ${chainId} via ${rpc}`);
  for (const item of MARKET.items) {
    console.log(`       ${item.path.padEnd(28)} ${(Number(item.price6) / 1e6).toFixed(2)} ${domain.name}`);
  }
  console.log(`       paid to ${payTo}, submitted by ${collector.submitter}`);
  console.log(`       on ${bind}:${port}`);
});
