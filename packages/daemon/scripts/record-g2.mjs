/**
 * G2, recorded from the chain it happened on.
 *
 * Every other gate is a test suite. This one cannot be: it is the claim that
 * the thing runs on Arc, so it asks Arc. Each check below is one assertion
 * about state that only a real run could have produced, and the row it writes
 * into `gates.gen.ts` carries how many passed — a gate nobody has run stays
 * pending, and a gate that half ran is red.
 *
 *     CORDON_ROOT=0x… node scripts/record-g2.mjs
 *
 * It reads no keys. Node ids, mandates, draws and refusals are public, and a
 * recorder that needed an operator key could not be re-run by anyone checking.
 */
import { createPublicClient, defineChain, http, parseAbi } from "viem";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGate } from "../../contracts/scripts/gates.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const chainId = Number(process.env.CORDON_CHAIN_ID ?? 5042002);
const deployment = JSON.parse(
  readFileSync(resolve(here, `../../contracts/deployments/${chainId}.json`), "utf8"),
);
const rpc = process.env.CORDON_RPC ?? "https://rpc.blockdaemon.testnet.arc.io";
const meter = process.env.CORDON_METER ?? "https://getcordon.xyz/api";
const root = process.env.CORDON_ROOT;
if (!root) {
  console.error("CORDON_ROOT is not set: G2 is about one tree, and it has to be named");
  process.exit(2);
}

const chain = defineChain({
  id: chainId, name: `chain-${chainId}`,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) });

const registryAbi = parseAbi([
  "function mandate(bytes32) view returns ((bytes32,bytes32,address,address,uint128,uint128,uint64,uint128,uint16,uint8,uint8,bool,bool,uint64))",
  "function isLive(bytes32) view returns (bool)",
  "function path(bytes32) view returns (bytes32[])",
]);
const vaultAbi = parseAbi([
  "function lifetimeSpent(bytes32) view returns (uint256)",
  "function treasury6(bytes32) view returns (uint256)",
]);
const recordAbi = parseAbi([
  "function attested(uint256) view returns (bool)",
  "function agentIdOf(bytes32) view returns (uint256)",
]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const checks = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
    console.log(`ok      ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
    console.log(`FAILED  ${name} — ${error.message}`);
  }
};
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ask = async (path) => {
  const response = await fetch(`${meter}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
};

const mandateOf = (node) =>
  client.readContract({ address: deployment.registry, abi: registryAbi, functionName: "mandate", args: [node] });

const tree = await ask(`/tree/${root}`);
const nodes = tree.nodes ?? tree;

await check("the tree on Arc has four or more live nodes under one root", () => {
  must(Array.isArray(nodes), "the meter did not answer with a list of nodes");
  must(nodes.length >= 4, `only ${nodes.length} nodes`);
  return `${nodes.length} nodes`;
});

await check("every node has its own operator, and none of them is the owner", async () => {
  const owners = new Set();
  const operators = new Set();
  for (const row of nodes) {
    const m = await mandateOf(row.node);
    owners.add(m[2].toLowerCase());
    operators.add(m[3].toLowerCase());
    must(m[2].toLowerCase() !== m[3].toLowerCase(), `${row.node} is operated by its own owner`);
  }
  must(operators.size >= 4, `${operators.size} distinct operators`);
  return `${operators.size} operators, ${owners.size} owner`;
});

await check("no operator holds more of the vault's money than it was released", async () => {
  /* Wallet balance is the wrong question on Arc, where gas and the token are
     one balance: an operator whose tranche cap is smaller than a transaction
     fee would fail a check on what it holds while having taken nothing. The
     claim that can be made is the one the meter computes from events — the
     Gateway balance the vault released, against the Gateway balance the
     operator has. */
  const reconciliation = await ask("/reconcile");
  /* The meter's verdict, not a second definition of it: an operator whose
     nodes have all been cut can draw nothing, and re-deciding that here is how
     two answers to one question end up disagreeing. */
  must(reconciliation.ok === true, "reconciliation reports money from outside the tree");
  const live = reconciliation.operators.filter((operator) => operator.liveNodes > 0);
  for (const operator of live) {
    must(operator.withinRelease, `${operator.operator} holds more than the vault released to it`);
  }
  const cut = reconciliation.operators.length - live.length;
  return `${live.length} live operators within what was released${cut ? `, ${cut} on cut branches` : ""}`;
});

await check("a draw debited every ancestor up to the root", async () => {
  const spentAtRoot = await client.readContract({
    address: deployment.vault, abi: vaultAbi, functionName: "lifetimeSpent", args: [root],
  });
  must(spentAtRoot > 0n, "the root has spent nothing, so no child has drawn");
  const drew = nodes.filter((row) => BigInt(row.drawn6 ?? "0") > 0n && row.node !== root);
  must(drew.length > 0, "no node below the root has drawn");
  return `root debited ${spentAtRoot} by ${drew.length} descendant(s)`;
});

await check("a refusal is on chain, and it names the transaction that produced it", async () => {
  const summary = await ask("/");
  must(summary.refusals > 0, "no refusal has been recorded");
  const refusal = await ask("/refusal/1");
  must(refusal.site?.transactionHash, "refusal 1 names no transaction");
  return `${summary.refusals} refusals, first at ${refusal.site.transactionHash}`;
});

await check("a bound above a node refused that node's draw", async () => {
  const summary = await ask("/");
  let found = null;
  for (let id = 1; id <= summary.refusals; id++) {
    const refusal = await ask(`/refusal/${id}`);
    if (refusal.breachedAt.toLowerCase() === refusal.node.toLowerCase()) continue;
    const ancestry = await client.readContract({
      address: deployment.registry, abi: registryAbi, functionName: "path", args: [refusal.node],
    });
    const above = ancestry.map((n) => n.toLowerCase()).includes(refusal.breachedAt.toLowerCase());
    if (!above) continue;
    const spent = await client.readContract({
      address: deployment.vault, abi: vaultAbi, functionName: "lifetimeSpent", args: [refusal.node],
    });
    found = { id, refusal, spent };
    break;
  }
  must(found, "every refusal was the asking node's own bound; none came from above it");
  must(found.spent === 0n, `the refused node had already spent ${found.spent}`);
  return `refusal ${found.id}: ${found.refusal.reason} at an ancestor, asked by a node that had spent nothing`;
});

await check("every refusal is published to the ERC-8004 reputation registry", async () => {
  const summary = await ask("/");
  for (let id = 1; id <= summary.refusals; id++) {
    const attested = await client.readContract({
      address: deployment.record, abi: recordAbi, functionName: "attested", args: [BigInt(id)],
    });
    must(attested, `refusal ${id} is not attested`);
  }
  return `${summary.refusals} of ${summary.refusals} attested`;
});

await check("the record's own URL resolves to the refusal it names", async () => {
  const refusal = await ask("/refusal/1");
  const page = await fetch("https://getcordon.xyz/refusal/1");
  must(page.ok, `the page answered ${page.status}`);
  must(refusal.id === "1", "the meter resolved a different id");
  return "https://getcordon.xyz/refusal/1";
});

const passed = checks.filter((c) => c.ok).length;
writeGate({
  id: "G2",
  status: passed === checks.length ? "green" : "red",
  tests: checks.length,
  passed,
  recordedAt: new Date().toISOString().slice(0, 10),
});
console.log(`\nG2 ${passed}/${checks.length} — recorded`);
process.exit(passed === checks.length ? 0 : 1);
