/**
 * Rewrites the address table in README.md from deployments/<chainId>.json.
 *
 * The repository's rule is that deployment addresses live in that file and
 * nowhere else, and the README was the one place breaking it: three addresses
 * typed by hand, in the most public file there is, that a redeploy silently
 * makes wrong. The fixture is generated for the same reason
 * (`record-addresses.mjs`); this closes the last copy.
 *
 * The table is replaced between two markers, so the prose around it is
 * untouched and a reader editing the README cannot be surprised.
 *
 * The markers carry the chain id, and the explorer comes from the fixtures
 * for that chain. Both because of what one pair of markers and one hardcoded
 * explorer did on 26 September 2026: a Sepolia deploy rewrote the Arc table
 * with Sepolia addresses and linked every one of them to arcscan, so the most
 * public file in the repository named the wrong chain for three contracts and
 * pointed at a block explorer that has never heard of them.
 *
 * Usage: node scripts/record-readme.mjs [chainId]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const chainId = Number(process.argv[2] ?? process.env.CORDON_CHAIN_ID ?? 5042002);
const source = resolve(here, `../deployments/${chainId}.json`);
const readme = resolve(here, "../../../README.md");

const START = `<!-- deployed:${chainId}:start -->`;
const END = `<!-- deployed:${chainId}:end -->`;

if (!existsSync(source)) {
  console.error(`no deployment at ${source}; README left alone`);
  process.exit(1);
}

const deployment = JSON.parse(readFileSync(source, "utf8"));

/* The chain's own explorer, from the one place chains are described. An
   explorer that defaults to another chain's produces links that resolve to
   nothing, which reads as a contract that was never deployed. */
const { CHAINS } = await import("../../fixtures/src/index.ts");
const explorer = process.env.CORDON_EXPLORER ?? CHAINS[chainId]?.explorer;
if (!explorer) {
  console.error(`chain ${chainId} has no explorer in packages/fixtures; README left alone`);
  process.exit(1);
}

const row = (name, address) =>
  `| \`${name}\` | [\`${address}\`](${explorer}/address/${address}) |`;

const table = [
  "| Contract | Address |",
  "|---|---|",
  row("MandateRegistry", deployment.registry),
  row("TreeVault", deployment.vault),
  row("ConductRecord", deployment.record),
].join("\n");

const text = readFileSync(readme, "utf8");
const from = text.indexOf(START);
const to = text.indexOf(END);
if (from === -1 || to === -1 || to < from) {
  console.error(`README.md has no ${START} … ${END} block; nothing written`);
  console.error(`Add the pair around chain ${chainId}'s table, or this deploy goes unrecorded.`);
  process.exit(1);
}

writeFileSync(
  readme,
  `${text.slice(0, from + START.length)}\n${table}\n${text.slice(to)}`,
);

console.log(`README address table written from deployments/${chainId}.json`);
