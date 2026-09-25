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
import { sepolia } from "viem/chains";
import { SEPOLIA, ENSV2 } from "../../fixtures/src/index.ts";

const REGISTRY = parseAbi([
  "function getSubregistry(string label) view returns (address)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
]);
const MANDATES = parseAbi([
  "function mandate(bytes32) view returns ((bytes32 parent,bytes32 root,address owner,address operator,uint128 budget6,uint128 lifetimeCap6,uint64 windowSeconds,uint128 trancheCap6,uint16 concentrationBps,uint8 depth,uint8 maxDepth,bool revoked,bool exists,uint64 createdAt))",
]);

/** From `contracts/src/registry/libraries/RegistryRolesLib.sol`. */
const ROLE = { REGISTRAR: 1n << 0n, UNREGISTER: 1n << 12n, SET_SUBREGISTRY: 1n << 20n };

const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA.rpc) });

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

const rows: Array<[string, boolean, boolean]> = [];
const ask = async (roles: bigint, who: Address) =>
  owns
    ? ((await client.readContract({
        address: own, abi: REGISTRY, functionName: "hasRootRoles", args: [roles, who],
      })) as boolean)
    : false;

/* The operator may spawn beneath its node exactly while the tree has depth
   left for it, so it may register beneath its name on the same condition. */
rows.push(["operator may register beneath itself", await ask(ROLE.REGISTRAR, m.operator), maySpawn]);
/* Cutting a branch belongs to whoever may revoke the mandate, and the operator
   of a node may not revoke its own. */
rows.push(["operator may unregister", await ask(ROLE.UNREGISTER, m.operator), false]);
/* The owner may revoke any node in the tree it funded. */
rows.push(["owner may unregister", await ask(ROLE.UNREGISTER, m.owner), owns]);
/* Re-pointing a name's registry re-parents everything under it, which no
   mandate operation can do. */
rows.push(["operator may re-point the registry", await ask(ROLE.SET_SUBREGISTRY, m.operator), false]);

console.log(name);
console.log(`  mandate depth ${m.depth} of ${m.maxDepth}, operator ${m.operator}`);
console.log(`  owner         ${m.owner}`);
console.log(`  own registry  ${owns ? own : "none (nothing may be registered beneath it)"}`);
console.log();

/**
 * The two disagreements are not the same failure, and calling them the same
 * thing hides the one that matters.
 *
 * A name that grants what the mandate refuses has invented an authority: a
 * stranger reading it is told something no contract will honour, and somebody
 * holding that role can act on it. That is the defect this whole check exists
 * to catch.
 *
 * A name that grants less is narrower than its mandate. Nothing false is
 * published and nobody gains anything — usually it is a name that has not been
 * given its own registry yet. Worth printing, never worth failing.
 */
let invented = 0;
let narrower = 0;
for (const [what, granted, allowed] of rows) {
  const verdict = granted === allowed ? "ok    " : granted ? "INVENT" : "narrow";
  if (granted && !allowed) invented++;
  if (!granted && allowed) narrower++;
  console.log(
    `  ${verdict} ${what.padEnd(38)} name:${String(granted).padEnd(5)} mandate:${allowed}`,
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
process.exit(invented === 0 ? 0 : 1);
