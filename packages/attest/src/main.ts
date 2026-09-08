#!/usr/bin/env node
/**
 * The attestation endpoint, as a process.
 *
 *     CORDON_ATTEST_KEY=0x… node src/main.ts --chain 5042002
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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC, ATTEST } from "../../fixtures/src/index.ts";
import { deserialize, serialize, sync, type Ledger } from "../../meter/src/index.ts";
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
const chainId = Number(flag(argv, "chain") ?? process.env.CORDON_CHAIN_ID ?? ARC.chainId);
const rpc = flag(argv, "rpc") ?? process.env.CORDON_RPC ?? ARC.rpc;
const port = Number(flag(argv, "port") ?? process.env.CORDON_ATTEST_PORT ?? 8405);
const fromBlock = BigInt(flag(argv, "from") ?? process.env.CORDON_FROM_BLOCK ?? "0");
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
};

const chain = defineChain({
  id: chainId,
  name: `chain-${chainId}`,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: ARC.nativeDecimals },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) }) as PublicClient;

const asset = (process.env.CORDON_ATTEST_ASSET ?? ARC.erc20) as Address;
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
};

let ledger: Ledger | undefined = existsSync(snapshot)
  ? deserialize(readFileSync(snapshot, "utf8"))
  : undefined;

async function tick(): Promise<void> {
  ledger = await sync(client, { contracts, fromBlock }, ledger);
  writeFileSync(snapshot, serialize(ledger));
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
    explorer: ARC.explorer,
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

setInterval(() => {
  tick().catch((error: unknown) => {
    /* A failed read leaves the last good ledger in place. Serving a partial
       one would sell an answer that disagrees with the chain. */
    console.error(`sync failed, keeping the last good ledger: ${(error as Error).message}`);
  });
}, Number(flag(argv, "interval") ?? 5_000));
