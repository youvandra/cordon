/**
 * Does the namespace grant exactly what the contract does, and nothing more?
 *
 * This project's rule is that no surface may say a thing the contract does not
 * enforce. Roles on a name are the sharpest way to break it: a role that lets
 * somebody cut an agent's name is a role that cuts the agent's spending, and
 * if the contract would have refused that person, the name has just invented
 * an authority.
 *
 * So the mirror is checked rather than asserted. For each name this walks the
 * ENSv2 registries down to the agent's own, reads the mandate the name points
 * at, and compares them line by line.
 *
 *   node scripts/check-authority.ts worker1.probe.mira.eth
 */
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { normalize } from "viem/ens";
import { SEPOLIA, ENSV2 } from "../../fixtures/src/index.ts";
import { ensChain } from "../src/ens.ts";
import { mirror, type Grant } from "../src/namespace.ts";

const REGISTRY = parseAbi([
  "function getSubregistry(string label) view returns (address)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
]);
const MANDATES = parseAbi([
  "function mandate(bytes32) view returns ((bytes32 parent,bytes32 root,address owner,address operator,uint128 budget6,uint128 lifetimeCap6,uint64 windowSeconds,uint128 trancheCap6,uint16 concentrationBps,uint8 depth,uint8 maxDepth,bool revoked,bool exists,uint64 createdAt))",
]);

/** From `contracts/src/registry/libraries/RegistryRolesLib.sol`. */
const ROLE = { REGISTRAR: 1n << 0n, UNREGISTER: 1n << 12n, SET_SUBREGISTRY: 1n << 20n };

/* `src/ens.ts`, which names ENSv2's Universal Resolver. This file walks the
   ENSv2 registries directly, so on viem's default the two halves of the
   comparison would read different namespaces and the mismatch would be the
   check's own. */
const client = createPublicClient({ chain: ensChain, transport: http(SEPOLIA.rpc) });

const name = normalize(process.argv[2] ?? "probe.mira.eth");
const labels = name.split(".");
if (labels.at(-1) !== "eth") {
  console.error("this walks .eth names only");
  process.exit(2);
}

/* Down the registries, one label at a time, the way resolution does. The
   registry that holds a name is where its parent points; the registry a name
   owns is what it points at. */
let holder = ENSV2.registry as Address;
const path = labels.slice(0, -1).reverse();
let own: Address = "0x0000000000000000000000000000000000000000";
for (const label of path) {
  own = (await client.readContract({
    address: holder, abi: REGISTRY, functionName: "getSubregistry", args: [label],
  })) as Address;
  if (own === "0x0000000000000000000000000000000000000000") break;
  holder = own;
}

const node = (await client.getEnsText({ name, key: "cordon.node" })) as Hex | null;
const registry = (await client.getEnsText({ name, key: "cordon.registry" })) as Address | null;
if (!node || !registry) {
  console.log(`${name} publishes no mandate, so there is nothing to mirror.`);
  process.exit(0);
}

const m = await client.readContract({
  address: registry, abi: MANDATES, functionName: "mandate", args: [node],
});

const owns = own !== "0x0000000000000000000000000000000000000000";
const maySpawn = m.depth < m.maxDepth;

const grants: Grant[] = [];
const ask = async (roles: bigint, who: Address) =>
  owns
    ? ((await client.readContract({
        address: own, abi: REGISTRY, functionName: "hasRootRoles", args: [roles, who],
      })) as boolean)
    : false;

/* The operator may spawn beneath its node exactly while the tree has depth
   left for it, so it may register beneath its name on the same condition. */
grants.push({
  what: "operator may register beneath itself",
  granted: await ask(ROLE.REGISTRAR, m.operator),
  allowed: maySpawn,
});
/* Cutting a branch belongs to whoever may revoke the mandate, and the operator
   of a node may not revoke its own. */
grants.push({
  what: "operator may unregister",
  granted: await ask(ROLE.UNREGISTER, m.operator),
  allowed: false,
});
/* The owner may revoke any node in the tree it funded. */
grants.push({
  what: "owner may unregister",
  granted: await ask(ROLE.UNREGISTER, m.owner),
  allowed: owns,
});
/* Re-pointing a name's registry re-parents everything under it, which no
   mandate operation can do. */
grants.push({
  what: "operator may re-point the registry",
  granted: await ask(ROLE.SET_SUBREGISTRY, m.operator),
  allowed: false,
});

console.log(name);
console.log(`  mandate depth ${m.depth} of ${m.maxDepth}, operator ${m.operator}`);
console.log(`  owner         ${m.owner}`);
console.log(`  own registry  ${owns ? own : "none (nothing may be registered beneath it)"}`);
console.log();

/**
 * The two disagreements are not the same failure, and calling them the same
 * thing hides the one that matters. `mirror` in `src/namespace.ts` keeps them
 * apart, and is tested there — this script reads the chain and prints; it does
 * not decide.
 */
const { rows, invented, narrower, exitCode } = mirror(grants);
const WORD = { ok: "ok    ", invented: "INVENT", narrower: "narrow" } as const;
for (const row of rows) {
  console.log(
    `  ${WORD[row.verdict]} ${row.what.padEnd(38)} name:${String(row.granted).padEnd(5)} mandate:${row.allowed}`,
  );
}

console.log();
if (invented > 0) {
  console.log(`  ${invented} authority the name grants and the contract refuses. This is the defect.`);
} else if (narrower > 0) {
  console.log(`  The namespace grants nothing the mandate refuses.`);
  console.log(`  ${narrower} place(s) where it grants less, which publishes nothing false.`);
} else {
  console.log("  The namespace grants what the mandate grants, and nothing else.");
}
process.exit(exitCode);
