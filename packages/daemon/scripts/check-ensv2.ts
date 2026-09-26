/**
 * Are the ENSv2 addresses in `packages/fixtures` still the set that resolves?
 *
 * The fixture carries a paragraph saying this set is self-consistent and was
 * checked against the chain on a date. That is a claim in a comment, and this
 * project's own rule is that a claim nobody can run is a claim that rots. So
 * the same checks are written here, where a reviewer can execute them.
 *
 * Sepolia carries two complete ENSv2 deployments, both live, both holding
 * registered names, and only one reachable from the root registry. A name
 * registered in the other resolves to nothing while every transaction
 * succeeds — which is why "the addresses look right" is not a check and the
 * two links below are:
 *
 *   rootRegistry.getSubregistry("eth") == registry
 *   registrar.rentPriceOracle()        == rentPriceOracle
 *
 * Each ties one recorded address to another through the chain, so a fixture
 * edited to an address from the other set breaks a link rather than passing
 * quietly.
 *
 *   node scripts/check-ensv2.ts
 *
 * Exit 0 when the set holds, 1 when it does not, and 2 when the chain could
 * not be reached — a network that is down is not a fixture that is wrong, and
 * a check that reports the two the same way is one nobody will trust.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA, ENSV2 } from "../../fixtures/src/index.ts";

const ROOT = parseAbi(["function getSubregistry(string label) view returns (address)"]);
const REGISTRAR = parseAbi(["function rentPriceOracle() view returns (address)"]);

const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA.rpc) });

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Every address the fixture records, and what each one is for. */
const CARRIES: Array<[string, Address]> = [
  ["registry", ENSV2.registry as Address],
  ["rootRegistry", ENSV2.rootRegistry as Address],
  ["registrar", ENSV2.registrar as Address],
  ["universalResolver", ENSV2.universalResolver as Address],
  ["verifiableFactory", ENSV2.verifiableFactory as Address],
  ["userRegistryImpl", ENSV2.userRegistryImpl as Address],
  ["permissionedResolverImpl", ENSV2.permissionedResolverImpl as Address],
  ["rentPriceOracle", ENSV2.rentPriceOracle as Address],
  ["feeToken", ENSV2.feeToken as Address],
  ["feeTokenDai", ENSV2.feeTokenDai as Address],
];

let wrong = 0;

function ok(line: string) {
  console.log(`  ok    ${line}`);
}
function bad(line: string) {
  console.log(`  WRONG ${line}`);
  wrong += 1;
}

console.log(`ENSv2 on chain ${ENSV2.chainId}, via ${SEPOLIA.rpc}\n`);

if (ENSV2.chainId !== SEPOLIA.chainId) {
  bad(`fixture says chain ${ENSV2.chainId}, Sepolia is ${SEPOLIA.chainId}`);
}

let code: Array<`0x${string}` | undefined>;
try {
  console.log("code at every recorded address");
  code = await Promise.all(CARRIES.map(([, address]) => client.getCode({ address })));
} catch (error) {
  /* Distinguished from a wrong fixture on purpose. An RPC that is down, rate
     limiting, or serving pruned state says nothing about whether these
     addresses are the right ones. */
  console.error(`\ncould not reach the chain: ${(error as Error).message}`);
  process.exit(2);
}

for (const [index, [name, address]] of CARRIES.entries()) {
  const bytes = code[index];
  /* An address with no code is the failure this catches: it is what a name
     registered against the wrong deployment looks like from here, and what a
     typo looks like too. */
  if (bytes && bytes !== "0x") ok(`${name.padEnd(24)} ${address}`);
  else bad(`${name.padEnd(24)} ${address} carries no code`);
}

console.log("\nthe two links that say this is the resolving set");

try {
  const eth = await client.readContract({
    address: ENSV2.rootRegistry as Address,
    abi: ROOT,
    functionName: "getSubregistry",
    args: ["eth"],
  });
  if (same(eth, ENSV2.registry)) ok(`rootRegistry.getSubregistry("eth") == registry`);
  else bad(`rootRegistry.getSubregistry("eth") is ${eth}, fixture says ${ENSV2.registry}`);
} catch (error) {
  bad(`rootRegistry.getSubregistry("eth") did not answer: ${(error as Error).message}`);
}

try {
  const oracle = await client.readContract({
    address: ENSV2.registrar as Address,
    abi: REGISTRAR,
    functionName: "rentPriceOracle",
  });
  if (same(oracle, ENSV2.rentPriceOracle)) ok(`registrar.rentPriceOracle() == rentPriceOracle`);
  else bad(`registrar.rentPriceOracle() is ${oracle}, fixture says ${ENSV2.rentPriceOracle}`);
} catch (error) {
  bad(`registrar.rentPriceOracle() did not answer: ${(error as Error).message}`);
}

console.log(
  wrong === 0
    ? "\nthe recorded set is the one on chain"
    : `\n${wrong} recorded value disagrees with the chain`,
);
process.exit(wrong === 0 ? 0 : 1);
