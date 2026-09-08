#!/usr/bin/env node
/**
 * The meter, as a process: index Arc, keep a snapshot, serve it read-only.
 *
 *     node src/main.ts --chain 5042002 --from 0
 *     node src/main.ts --once --out ledger.json
 *
 * Addresses are never arguments. They come from
 * `packages/contracts/deployments/<chainId>.json`, which is written by the
 * deploy script from the broadcast — a meter pointed at a hand-typed address
 * would produce a ledger that looks right and is about another tree.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";
import { ARC } from "../../fixtures/src/index.ts";
import { deserialize, serialize } from "./snapshot.ts";
import { sync } from "./sync.ts";
import { createReadApi } from "./server.ts";
import type { Ledger } from "./ledger.ts";

const here = dirname(fileURLToPath(import.meta.url));

interface Args {
  chainId: number;
  rpc: string;
  fromBlock: bigint;
  out: string;
  port: number;
  once: boolean;
  intervalMs: number;
}

function parse(argv: string[]): Args {
  const args: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[name] = next;
      i++;
    } else {
      flags.add(name);
    }
  }

  const chainId = Number(args.chain ?? process.env.CORDON_CHAIN_ID ?? ARC.chainId);
  return {
    chainId,
    rpc: args.rpc ?? process.env.CORDON_RPC ?? ARC.rpc,
    fromBlock: BigInt(args.from ?? process.env.CORDON_FROM_BLOCK ?? "0"),
    out: args.out ?? resolve(here, `../ledger.${chainId}.json`),
    port: Number(args.port ?? process.env.CORDON_METER_PORT ?? 8404),
    once: flags.has("once"),
    intervalMs: Number(args.interval ?? 5_000),
  };
}

function contractsFor(chainId: number): { registry: Address; vault: Address; record?: Address } {
  const path = resolve(here, `../../contracts/deployments/${chainId}.json`);
  if (!existsSync(path)) {
    console.error(`no deployment recorded for chain ${chainId}: ${path}`);
    console.error("deploy first — addresses live in that file and nowhere else");
    process.exit(2);
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as {
    registry: Address;
    vault: Address;
    record?: Address;
  };
  return { registry: file.registry, vault: file.vault, record: file.record };
}

const args = parse(process.argv.slice(2));
const contracts = contractsFor(args.chainId);

const chain = defineChain({
  id: args.chainId,
  name: `chain-${args.chainId}`,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: ARC.nativeDecimals },
  rpcUrls: { default: { http: [args.rpc] } },
});
const client = createPublicClient({ chain, transport: http(args.rpc) }) as PublicClient;

let ledger: Ledger | undefined = existsSync(args.out)
  ? deserialize(readFileSync(args.out, "utf8"))
  : undefined;

async function tick(): Promise<void> {
  ledger = await sync(client, { contracts, fromBlock: args.fromBlock }, ledger);
  writeFileSync(args.out, serialize(ledger));
}

await tick();
console.log(`meter  chain ${args.chainId} via ${args.rpc}`);
console.log(`       blocks ${ledger!.fromBlock}–${ledger!.toBlock}`);
console.log(`       nodes ${Object.keys(ledger!.nodes).length}, refusals ${ledger!.refusals.length}`);
console.log(`       snapshot ${args.out}`);

if (!args.once) {
  const server = createReadApi(() => ledger!);
  server.listen(args.port, () => console.log(`       read api on :${args.port}`));

  setInterval(() => {
    tick().catch((error: unknown) => {
      /* A failed read leaves the last good ledger in place. The alternative —
         serving a partial one — is a page that quietly disagrees with the
         chain, which is the failure this package exists to make impossible. */
      console.error(`sync failed, keeping the last good ledger: ${(error as Error).message}`);
    });
  }, args.intervalMs);
}
