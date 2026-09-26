/**
 * Record one settled purchase, read back from the chain it happened on.
 *
 * A settlement is a claim: transactions anyone can open, whose amounts, payer,
 * payee and blocks are read from the receipts named on the command line. Nothing
 * here is typed, and the script refuses to write a fixture it could not verify.
 *
 *   CORDON_CHAIN_ID=11155111 node scripts/record-settlement.mjs <drawTx> <collectTx>
 *   node scripts/record-settlement.mjs <drawTx> <mintTx> <collectTx>
 *
 * Two transactions where the rail is direct — the draw deposits the tranche
 * into the operator's own wallet and the seller collects the authorisation —
 * and three on Arc, where Circle's Gateway lands it in a separate mint. The
 * rail is whatever the hashes say it is, and `CORDON_CHAIN_ID` names the
 * deployment file so the same script reads either.
 *
 * It reads no key: a purchase is public once it has happened.
 */
import { createPublicClient, http, defineChain, parseAbi, decodeEventLog } from "viem";
import { writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

const chainId = Number(process.env.CORDON_CHAIN_ID ?? 5042002);
const deployment = JSON.parse(
  readFileSync(resolve(root, `packages/contracts/deployments/${chainId}.json`), "utf8"),
);

const args = process.argv.slice(2);
const [drawTx, second, third] = args;
/* Three hashes is the Gateway rail; two is the direct one. */
const mintTx = third ? second : null;
const collectTx = third ?? second;
if (!drawTx || !collectTx || args.length < 2 || args.length > 3) {
  console.error("usage: [CORDON_CHAIN_ID=<id>] record-settlement.mjs <drawTx> [mintTx] <collectTx>");
  process.exit(2);
}

const RPC =
  process.env.CORDON_RPC ??
  (chainId === 11155111
    ? "https://ethereum-sepolia-rpc.publicnode.com"
    : "https://rpc.testnet.arc.io");

const chain = defineChain({
  id: chainId,
  name: `chain-${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const client = createPublicClient({ chain, transport: http() });

const TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const DRAWN = parseAbi([
  "event Drawn(bytes32 indexed node, address indexed counterparty, address beneficiary, uint128 amount6, bytes32 indexed root)",
]);

const receipt = async (hash, what) => {
  const r = await client.getTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${what} ${hash} did not succeed`);
  return r;
};

const draw = await receipt(drawTx, "the draw");
const mint = mintTx ? await receipt(mintTx, "the Gateway release") : null;
const collect = await receipt(collectTx, "the seller's collection");

/* The draw says which node paid and how much the contract released. */
let drawn = null;
for (const log of draw.logs) {
  if (log.address.toLowerCase() !== deployment.vault.toLowerCase()) continue;
  try {
    const event = decodeEventLog({ abi: DRAWN, data: log.data, topics: log.topics });
    if (event.eventName === "Drawn") drawn = event.args;
  } catch {
    continue;
  }
}
if (!drawn) throw new Error(`${drawTx} carries no Drawn event from the vault`);

/* The collection says who was actually paid, and how much reached them. */
let paid = null;
for (const log of collect.logs) {
  if (log.address.toLowerCase() !== deployment.usdc.toLowerCase()) continue;
  try {
    const event = decodeEventLog({ abi: TRANSFER, data: log.data, topics: log.topics });
    if (event.eventName === "Transfer" && event.args.value === drawn.amount6) paid = event.args;
  } catch {
    continue;
  }
}
if (!paid) {
  throw new Error(
    `${collectTx} moves no transfer of ${drawn.amount6} base units: the seller was not paid the price the contract released for`,
  );
}
if (paid.from.toLowerCase() !== drawn.beneficiary.toLowerCase()) {
  throw new Error(
    `the payer in ${collectTx} is ${paid.from} and the tranche went to ${drawn.beneficiary}`,
  );
}
if (paid.to.toLowerCase() !== drawn.counterparty.toLowerCase()) {
  throw new Error(
    `the seller paid in ${collectTx} is ${paid.to}, and the counterparty the contract was asked ` +
      `about is ${drawn.counterparty} — a bound on one address is no bound at all if another is paid`,
  );
}

const out = {
  recordedAt: new Date().toISOString(),
  chainId: deployment.chainId,
  node: drawn.node,
  operator: drawn.beneficiary,
  seller: drawn.counterparty,
  price6: drawn.amount6,
  drawTx,
  drawBlock: draw.blockNumber,
  /* Present on Arc, where Circle's Gateway lands the tranche in a second
     transaction. Absent on the direct rail, where the draw itself deposits. */
  ...(mint ? { mintTx, mintBlock: mint.blockNumber } : {}),
  collectTx,
  collectBlock: collect.blockNumber,
};

const chainNote = mint
  ? `// One purchase that settled, read back from chain ${chainId}. Three transactions: the draw
// the contract bounded, the Gateway release that brought the tranche into the
// operator's own balance, and the seller's own collection of the EIP-3009
// authorisation it was given. Anyone can open all three.`
  : `// One purchase that settled, read back from chain ${chainId}. Two transactions: the draw
// the contract bounded, which deposited the tranche straight into the operator's
// own wallet, and the seller's own collection of the EIP-3009 authorisation it
// was given. Anyone can open both.`;

const file = resolve(root, "packages/fixtures/src/settlement.gen.ts");
writeFileSync(
  file,
  `// GENERATED by packages/daemon/scripts/record-settlement.mjs — do not edit.
${chainNote}

export interface SettledPurchase {
  recordedAt: string;
  chainId: number;
  node: string;
  operator: string;
  seller: string;
  price6: bigint;
  drawTx: string;
  drawBlock: bigint;
  /** Absent on the direct rail, where the draw is the deposit. */
  mintTx?: string;
  mintBlock?: bigint;
  collectTx: string;
  collectBlock: bigint;
}

export const SETTLEMENT: SettledPurchase = ${JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? `${v}n` : v), 2)
    .replace(/"(\d+)n"/g, "$1n")};
`,
);

console.log(`settlement -> ${file}`);
console.log(`  chain    ${out.chainId}`);
console.log(`  node     ${out.node}`);
console.log(`  price    ${out.price6} base units to ${out.seller}`);
console.log(`  draw     ${out.drawTx}`);
if (mintTx) console.log(`  release  ${mintTx}`);
else console.log("  release  none — the draw deposited straight into the operator's wallet");
console.log(`  collect  ${out.collectTx}`);
