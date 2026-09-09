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
import { ARC, GATEWAY } from "../../fixtures/src/index.ts";
import { deserialize, serialize } from "./snapshot.ts";
import { sync } from "./sync.ts";
import { createReadApi } from "./server.ts";
import type { Ledger } from "./ledger.ts";
import { reconcileGateway, type Reconciliation } from "./reconcile.ts";

const here = dirname(fileURLToPath(import.meta.url));

interface Args {
  chainId: number;
  rpc: string;
  fromBlock: string | undefined;
  out: string;
  port: number;
  bind: string;
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
    /* Left undefined here and resolved from the deployment below, because
       the honest default is the block the contracts were created in and that
       file is the only place it is written down. */
    fromBlock: args.from ?? process.env.CORDON_FROM_BLOCK,
    out: args.out ?? resolve(here, `../ledger.${chainId}.json`),
    port: Number(args.port ?? process.env.CORDON_METER_PORT ?? 8404),
    bind: args.bind ?? process.env.CORDON_BIND ?? "127.0.0.1",
    once: flags.has("once"),
    intervalMs: Number(args.interval ?? 5_000),
  };
}

function contractsFor(chainId: number): {
  registry: Address;
  vault: Address;
  record?: Address;
  /* Both are null in a deployment recorded before the script exported them,
     and on Arc they are not ours to deploy anyway — the fixtures are the one
     place either is written down. */
  gateway: Address;
  usdc: Address;
  fromBlock: bigint;
} {
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
    gateway?: Address | null;
    usdc?: Address | null;
    fromBlock?: string;
  };
  /* Reading from zero is not a slower version of reading from the deployment:
     Arc's public RPC answers `pruned history unavailable` and the sync fails
     outright. A deployment recorded before this field existed has none, and
     zero is what it used to mean. */
  return {
    registry: file.registry,
    vault: file.vault,
    record: file.record,
    gateway: (file.gateway ?? GATEWAY.wallet) as Address,
    usdc: (file.usdc ?? ARC.erc20) as Address,
    fromBlock: BigInt(file.fromBlock ?? "0"),
  };
}

const args = parse(process.argv.slice(2));
const { fromBlock: deployedAt, ...contracts } = contractsFor(args.chainId);
/* An explicit --from still wins: reading a narrower range is a thing an
   operator may want, and it cannot invent history that was never there. */
const fromBlock = args.fromBlock === undefined ? deployedAt : BigInt(args.fromBlock);

const chain = defineChain({
  id: args.chainId,
  name: `chain-${args.chainId}`,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: ARC.nativeDecimals },
  rpcUrls: { default: { http: [args.rpc] } },
});
/* viem caches `getBlockNumber` for the polling interval, and its default is
   4,000ms — written for chains where a block is minutes away. On Arc, where
   finality is sub-second, that makes the ledger up to four seconds behind a
   chain that has already settled, for no reason a reader would guess. */
const client = createPublicClient({
  chain,
  transport: http(args.rpc),
  pollingInterval: 250,
  cacheTime: 250,
}) as PublicClient;

let ledger: Ledger | undefined = existsSync(args.out)
  ? deserialize(readFileSync(args.out, "utf8"))
  : undefined;

/**
 * The last reconciliation, recomputed every sync.
 *
 * It was written, tested and then called by nothing outside its own test —
 * a check that proves the vault is the only funding source and that no
 * operator could run. A guarantee nobody can ask about is not a guarantee.
 */
let reconciliation: Reconciliation | undefined;

async function tick(): Promise<void> {
  ledger = await sync(client, { contracts, fromBlock }, ledger);
  writeFileSync(args.out, serialize(ledger));
  /* Reads the Gateway once per operator. It is a chain read and can fail on
     its own; a failed reconciliation must not throw away a good ledger, so it
     keeps the last answer and says when it was taken. */
  try {
    reconciliation = await reconcileGateway(client, ledger, {
      gateway: contracts.gateway,
      usdc: contracts.usdc,
    });
  } catch (error) {
    console.error(`reconciliation failed, keeping the last one: ${(error as Error).message}`);
  }
}

await tick();
console.log(`meter  chain ${args.chainId} via ${args.rpc}`);
console.log(`       blocks ${ledger!.fromBlock}–${ledger!.toBlock}`);
console.log(`       nodes ${Object.keys(ledger!.nodes).length}, refusals ${ledger!.refusals.length}`);
console.log(
  `       reconciled ${reconciliation ? (reconciliation.ok ? "ok" : "MISMATCH") : "not yet"}` +
    `${reconciliation ? `, ${reconciliation.operators.length} operators` : ""}`,
);
console.log(`       snapshot ${args.out}`);

if (!args.once) {
  const server = createReadApi(() => ledger!, () => reconciliation);
  /* Loopback by default, same as attest. This API is read-only and public by
     intent, but "public" means through the origin that serves the pages, so
     the console needs no CORS and there is one place to look at the logs. */
  server.listen(args.port, args.bind, () =>
    console.log(`       read api on ${args.bind}:${args.port}`),
  );

  setInterval(() => {
    tick().catch((error: unknown) => {
      /* A failed read leaves the last good ledger in place. The alternative —
         serving a partial one — is a page that quietly disagrees with the
         chain, which is the failure this package exists to make impossible. */
      console.error(`sync failed, keeping the last good ledger: ${(error as Error).message}`);
    });
  }, args.intervalMs);
}
