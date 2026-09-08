/**
 * Writes the deployment addresses to deployments/<chainId>.json, from the
 * broadcast artifact forge just produced.
 *
 * Addresses live in exactly one file. Reading them out of the broadcast rather
 * than off a terminal means the file says what was deployed, not what somebody
 * copied — and a mistyped address here is the kind of defect that looks like a
 * working system until the first draw.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const chainId = process.argv[2];
if (!chainId) {
  console.error("usage: node scripts/record-deployment.mjs <chainId>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const broadcast = resolve(here, `../broadcast/Deploy.s.sol/${chainId}/run-latest.json`);
if (!existsSync(broadcast)) {
  console.error(`no broadcast for chain ${chainId}: ${broadcast}`);
  console.error("run the deploy with --broadcast first");
  process.exit(1);
}

const run = JSON.parse(readFileSync(broadcast, "utf8"));

const deployed = {};
for (const tx of run.transactions ?? []) {
  if (tx.transactionType === "CREATE" && tx.contractName) {
    deployed[tx.contractName] = tx.contractAddress;
  }
}

for (const name of ["MandateRegistry", "TreeVault", "ConductRecord"]) {
  if (!deployed[name]) {
    console.error(`the broadcast contains no ${name}; refusing to write a partial deployment`);
    process.exit(1);
  }
}

/* The block the contracts came into existence in.
 *
 * A reader of these events has to start somewhere, and zero is the wrong
 * answer twice: it is tens of millions of empty blocks on a chain that has
 * been up for a while, and Arc's public RPC answers `pruned history
 * unavailable` rather than returning them. Nothing these three contracts have
 * to say predates their own deployment. */
const blocks = (run.receipts ?? [])
  .map((r) => (r.blockNumber == null ? null : BigInt(r.blockNumber)))
  .filter((b) => b !== null);
if (blocks.length === 0) {
  console.error("the broadcast has no receipts, so there is no block to start reading from");
  process.exit(1);
}
const fromBlock = blocks.reduce((a, b) => (b < a ? b : a));

const out = resolve(here, `../deployments/${chainId}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      chainId: Number(chainId),
      /* Forge writes milliseconds here, not seconds — assuming seconds put
         the first recorded deployment in the year 58655. Accept either, since
         a unit that changed once can change again. */
      deployedAt: new Date(run.timestamp > 1e11 ? run.timestamp : run.timestamp * 1000).toISOString(),
      /* Where a reader of these events starts. See above: not zero. */
      fromBlock: fromBlock.toString(),
      registry: deployed.MandateRegistry,
      vault: deployed.TreeVault,
      record: deployed.ConductRecord,
      /* Not ours, and not deployed by this script — recorded so a reader can
         see what the vault was pointed at without reading a constructor. */
      usdc: process.env.CORDON_USDC ?? null,
      gateway: process.env.CORDON_GATEWAY ?? null,
      /* Live already, at deterministic addresses across 40+ chains. Recorded
         for the same reason as the two above: so a reader can see where the
         conduct record goes without reading a constructor argument. */
      identity: process.env.CORDON_IDENTITY ?? null,
      reputation: process.env.CORDON_REPUTATION ?? null,
      commit: process.env.CORDON_COMMIT ?? null,
    },
    null,
    2,
  ) + "\n",
);

console.log(`deployment -> ${out}`);
console.log(JSON.stringify(deployed, null, 2));
