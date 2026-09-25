#!/usr/bin/env node
/**
 * The attestation endpoint, as a process.
 *
 *     node --env-file="$HOME/cordon/.env.attest" src/main.ts --chain 5042002
 *
 * The key comes from that file, never from the command line, where it would
 * land in shell history.
 *
 * It indexes Arc with the meter's own reducer rather than a second copy of
 * one, because two indexers drift the same way two copies of a figure do.
 * Addresses come from `packages/contracts/deployments/<chainId>.json` and
 * nowhere else.
 *
 * It refuses to start when the token it is meant to be paid in cannot verify
 * the signature it would publish a domain for. That check is one RPC call and
 * it is the difference between a payer being refused by the token and a payer
 * being told the price they will actually be able to pay.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC, ATTEST, DEFAULT_CHAIN, chainFacts } from "../../fixtures/src/index.ts";
import { deserialize, everyAfter, sync, writeSnapshot, type Ledger } from "../../meter/src/index.ts";
import { Eip3009Collector, resolveDomain } from "./collect.ts";
import { createAttestApi } from "./server.ts";
import type { Terms } from "./payment.ts";

const here = dirname(fileURLToPath(import.meta.url));

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const argv = process.argv.slice(2);
const chainId = Number(flag(argv, "chain") ?? process.env.CORDON_CHAIN_ID ?? DEFAULT_CHAIN.chainId);
const rpc = flag(argv, "rpc") ?? process.env.CORDON_RPC ?? DEFAULT_CHAIN.rpc;
const port = Number(flag(argv, "port") ?? process.env.CORDON_ATTEST_PORT ?? 8405);
const fromArg = flag(argv, "from") ?? process.env.CORDON_FROM_BLOCK;
const snapshot = flag(argv, "out") ?? resolve(here, `../ledger.${chainId}.json`);

const key = process.env.CORDON_ATTEST_KEY as Hex | undefined;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("CORDON_ATTEST_KEY is not set. It is the account that submits");
  console.error("settlements and pays their gas, and it holds nothing else.");
  process.exit(2);
}

const deployment = resolve(here, `../../contracts/deployments/${chainId}.json`);
if (!existsSync(deployment)) {
  console.error(`no deployment recorded for chain ${chainId}: ${deployment}`);
  console.error("deploy first — addresses live in that file and nowhere else");
  process.exit(2);
}
const contracts = JSON.parse(readFileSync(deployment, "utf8")) as {
  registry: Address;
  vault: Address;
  record?: Address;
  fromBlock?: string;
};

/* Where reading starts. Zero is not a slower version of the deployment block:
   Arc's public RPC prunes, answers `pruned history unavailable` and the sync
   fails outright. Nothing these contracts have to say predates them. An
   explicit --from still wins, since a narrower range invents nothing. */
const fromBlock = fromArg === undefined ? BigInt(contracts.fromBlock ?? "0") : BigInt(fromArg);

/* The gas token is the chain's, not Arc's. This read `ARC.nativeDecimals` and
   called the result USDC, which is true on Arc and false on Sepolia — where gas
   is ETH and USDC is a separate token with six decimals. */
const facts = chainFacts(chainId);
if (!facts) {
  console.error(`chain ${chainId} is not one this build knows`);
  console.error("chains live in packages/fixtures/src/index.ts and nowhere else");
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
/* Same reason as the collector's, which had this and this one did not: viem's
   four-second default poll and block-number cache are written for chains where
   a block is minutes away, and Arc settles in under a second. */
/* The pace follows the chain. 250ms matches Arc's sub-second finality; on
   Sepolia, where a block is twelve seconds, it is forty requests per block
   against a public endpoint and the way an address gets rate limited. */
const POLL_MS = chainId === ARC.chainId ? 250 : 4_000;
const client = createPublicClient({
  chain,
  transport: http(rpc),
  pollingInterval: POLL_MS,
  cacheTime: POLL_MS,
}) as PublicClient;

const asset = (process.env.CORDON_ATTEST_ASSET ?? facts.erc20) as Address;
const domain = await resolveDomain(client, asset, chainId);
const collector = new Eip3009Collector({ rpcUrl: rpc, chain, token: asset, privateKey: key });
const payTo = (process.env.CORDON_ATTEST_PAYTO ?? privateKeyToAccount(key).address) as Address;

const terms: Terms = {
  network: `eip155:${chainId}`,
  asset,
  payTo,
  price6: ATTEST.price6,
  scheme: ATTEST.scheme,
  minLeadSeconds: ATTEST.minLeadSeconds,
  domain,
  x402Version: ATTEST.x402Version,
};

let ledger: Ledger | undefined = existsSync(snapshot)
  ? deserialize(readFileSync(snapshot, "utf8"))
  : undefined;

async function tick(): Promise<void> {
  ledger = await sync(client, { contracts, fromBlock }, ledger);
  writeSnapshot(snapshot, ledger);
}

await tick();

const server = createAttestApi({
  current: () => ledger!,
  terms,
  collector,
  sources: {
    vault: contracts.vault,
    registry: contracts.registry,
    record: contracts.record,
    explorer: facts.explorer,
  },
});

/* Loopback by default. This process holds the only key in the package and a
   default of 0.0.0.0 puts it on the public internet the moment the box has an
   open port, which is a firewall rule away from being wrong. A deployment that
   wants it exposed says so; nginx in front needs nothing but the default. */
const bind = flag(argv, "bind") ?? process.env.CORDON_BIND ?? "127.0.0.1";

server.listen(port, bind, () => {
  console.log(`attest chain ${chainId} via ${rpc}`);
  console.log(`       blocks ${ledger!.fromBlock}–${ledger!.toBlock}`);
  console.log(`       ${ATTEST.resourcePath}/:agentId  ${Number(ATTEST.price6) / 1e6} in ${domain.name}`);
  console.log(`       paid to ${payTo}, submitted by ${collector.submitter}`);
  console.log(`       on ${bind}:${port}`);
});

/* One read at a time, scheduled after the last one finished. This was a
   `setInterval`, which starts a second read of the same range whenever a tick
   outlives its interval — and because `reduce` folds events into the ledger in
   place, the same draws and refusals land in it twice while two writers race
   one snapshot file. On the surface that sells the answer. */
everyAfter(tick, {
  intervalMs: Number(flag(argv, "interval") ?? 5_000),
  /* A failed read leaves the last good ledger in place. Serving a partial one
     would sell an answer that disagrees with the chain. */
  onError: (error) => console.error(`sync failed, keeping the last good ledger: ${error.message}`),
});
