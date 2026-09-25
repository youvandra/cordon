#!/usr/bin/env node
/**
 * The demo seller, as a process.
 *
 *     node --env-file="$HOME/cordon/.env.attest" src/demo-main.ts
 *
 * It is paid through the attest endpoint's own key, from the same file, so the
 * box holds no key it did not already hold. Unlike `attest` it indexes
 * nothing: what it sells is read at the moment of sale.
 */
import { createPublicClient, defineChain, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEMO_SELLER, DEFAULT_CHAIN, chainFacts } from "../../fixtures/src/index.ts";
import { Eip3009Collector, resolveDomain } from "./collect.ts";
import { createDemoSeller } from "./demo.ts";
import type { Terms } from "./payment.ts";

const chainId = Number(process.env.CORDON_CHAIN_ID ?? DEFAULT_CHAIN.chainId);
const rpc = process.env.CORDON_RPC ?? DEFAULT_CHAIN.rpc;
const port = Number(process.env.CORDON_DEMO_PORT ?? 8406);
const bind = process.env.CORDON_BIND ?? "127.0.0.1";

const key = process.env.CORDON_ATTEST_KEY as Hex | undefined;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("CORDON_ATTEST_KEY is not set. The demo seller submits settlements");
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

const asset = (process.env.CORDON_ATTEST_ASSET ?? facts.erc20) as Address;
const domain = await resolveDomain(client, asset, chainId);
const collector = new Eip3009Collector({ rpcUrl: rpc, chain, token: asset, privateKey: key });
const payTo = (process.env.CORDON_DEMO_PAYTO ?? privateKeyToAccount(key).address) as Address;

const terms: Terms = {
  network: `eip155:${chainId}`,
  asset,
  payTo,
  price6: DEMO_SELLER.price6,
  scheme: DEMO_SELLER.scheme,
  minLeadSeconds: DEMO_SELLER.minLeadSeconds,
  domain,
  x402Version: DEMO_SELLER.x402Version,
};

const server = createDemoSeller({
  terms,
  collector,
  read: async () => {
    const [block, gasPrice] = await Promise.all([client.getBlock(), client.getGasPrice()]);
    return { chainId, blockNumber: block.number, timestamp: block.timestamp, gasPrice };
  },
});

server.listen(port, bind, () => {
  console.log(`demo seller chain ${chainId} via ${rpc}`);
  console.log(`       ${DEMO_SELLER.resourcePath}  ${Number(DEMO_SELLER.price6) / 1e6} in ${domain.name}`);
  console.log(`       paid to ${payTo}, submitted by ${collector.submitter}`);
  console.log(`       on ${bind}:${port}`);
});
