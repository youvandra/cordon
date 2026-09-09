/**
 * A whole Cordon on a local chain, left running.
 *
 * The console reads fixtures today, and the only way to prove it can read a
 * chain instead is to have one with a tree, some draws and a refusal on it.
 * Waiting for the Arc redeploy to find that out is how a surface gets wired
 * wrong on the last day.
 *
 * It writes packages/contracts/deployments/31337.json, which is gitignored
 * exactly because a local deployment is a throwaway, and then stays up so the
 * meter can sync against it:
 *
 *     node packages/eval/scripts/stage-local.mjs
 *     node packages/meter/src/main.ts --chain 31337 --rpc http://127.0.0.1:8545
 *
 * Ctrl-C takes the chain with it.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startWorld } from "../src/world.ts";
import { startSellers } from "../src/sellers.ts";
import { cordonBuyer } from "../src/conditions.ts";
import { SOURCES } from "../src/task.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../contracts/deployments/31337.json");

const port = Number(process.env.CORDON_STAGE_PORT ?? 8545);
const world = await startWorld(port, 5_000);

writeFileSync(
  out,
  `${JSON.stringify(
    {
      chainId: 31337,
      deployedAt: new Date().toISOString(),
      /* Anvil keeps its whole history, so zero is honest here — on Arc it is
         not, and the recorder writes the real block instead. */
      fromBlock: "0",
      registry: world.registry,
      vault: world.vault,
      record: world.record,
      usdc: world.usdc,
      gateway: world.gateway,
      identity: world.identity,
      reputation: world.reputation,
      commit: "local stage, not a deployment anybody can check",
    },
    null,
    2,
  )}\n`,
);

const sellers = await startSellers({
  window6: world.window6, usdc: world.usdc, network: "eip155:31337",
});
const buyer = cordonBuyer(world);

/* Real purchases, so the ledger has draws to reduce. Both workers buy, because
   a tree with one busy child and one idle one is the shape the console's
   exposure column exists to show. */
for (const source of SOURCES) {
  const seller = sellers.byId(source.id);
  const purchase = await buyer.buy(source.section, seller.url);
  console.log(
    `${purchase.ok ? "drew  " : "refused"} ${source.id.padEnd(10)} ` +
      `${(Number(purchase.amount6) / 1e6).toFixed(2)}` +
      `${purchase.refusedBy ? ` (${purchase.refusedBy})` : ""}`,
  );
}

/* And one refusal, because a console that has never rendered one has not been
   tested. A seller asking for more than a whole tranche is the cheapest way to
   get a real one, written by the contract. */
const greedy = await startSellers({
  window6: world.window6 * 100n, usdc: world.usdc, network: "eip155:31337",
});
const refused = await buyer.buy("left", greedy.byId(SOURCES[0].id).url);
console.log(`refused ${"greedy".padEnd(10)} ${(Number(refused.amount6) / 1e6).toFixed(2)} (${refused.refusedBy})`);

console.log("");
console.log(`chain     31337 at http://127.0.0.1:${port}`);
console.log(`registry  ${world.registry}`);
console.log(`vault     ${world.vault}`);
console.log(`record    ${world.record}`);
console.log(`root      ${world.tree.root}`);
console.log(`left      ${world.tree.workers.left.node}`);
console.log(`right     ${world.tree.workers.right.node}`);
console.log("");
console.log("wrote packages/contracts/deployments/31337.json");
console.log("now:  node packages/meter/src/main.ts --chain 31337 --rpc http://127.0.0.1:" + port);
console.log("Ctrl-C to stop the chain.");

const stop = async () => {
  await sellers.stop();
  await greedy.stop();
  await world.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
/* Nothing else to do; the point is that the chain stays up. */
setInterval(() => {}, 1 << 30);
