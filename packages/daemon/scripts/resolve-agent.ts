/**
 * The check a seller makes before it serves an agent.
 *
 * An x402 payment arrives as an EIP-3009 authorisation, and the only thing in
 * it that identifies the payer is an address. Today that is where the enquiry
 * ends: a seller cannot ask whether the payment will land, who stands behind
 * the agent, or whether it will still be permitted to spend a minute from now.
 *
 * This is that enquiry, in two reads:
 *
 *   1. Address to name, and the name has to resolve back to the address.
 *      Without the second half anyone can point a name at somebody else's
 *      address and claim their bound.
 *   2. Name to pointer to contract. The records carry `cordon.node` and
 *      `cordon.registry`; the live answer comes from the registry and the
 *      vault, never from the record. A cap written into a text record is a
 *      copy, and a copy drifts.
 *
 *   node scripts/resolve-agent.ts probe.mira.eth
 *   node scripts/resolve-agent.ts 0xFda26a517176E17F856364A599A4D5eD44CAfE43
 */
import { createPublicClient, http, parseAbi, isAddress, type Address, type Hex } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import { SEPOLIA, ERC8004 } from "../../fixtures/src/index.ts";
import { registrationKey } from "../src/namespace.ts";

const REGISTRY_ABI = parseAbi([
  "function isLive(bytes32) view returns (bool)",
  "function revokedAt(bytes32) view returns (bytes32)",
  "function mandate(bytes32) view returns ((bytes32 parent,bytes32 root,address owner,address operator,uint128 budget6,uint128 lifetimeCap6,uint64 windowSeconds,uint128 trancheCap6,uint16 concentrationBps,uint8 depth,uint8 maxDepth,bool revoked,bool exists,uint64 createdAt))",
]);
const VAULT_ABI = parseAbi([
  "function headroom(bytes32) view returns (uint128,bytes32)",
  "function treasury6(bytes32) view returns (uint128)",
]);
const RECORD_ABI = parseAbi(["function agentIdOf(bytes32) view returns (uint256)"]);

/* viem's own Sepolia, for the Universal Resolver address it carries. ENS's
   guidance is to look a resolver up rather than hold one, and this is the
   library doing that; the RPC still comes from the fixtures, which is the one
   place this project writes an endpoint down. */
const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA.rpc) });

const usd = (base6: bigint) => `$${(Number(base6) / 1e6).toFixed(2)}`;

const subject = process.argv[2];
if (!subject) {
  console.error("usage: node scripts/resolve-agent.ts <name.eth | 0xaddress>");
  process.exit(2);
}

/* Which way round the enquiry runs. A seller starts from the address, because
   that is what the authorisation carries; a person starts from the name. */
let name: string;
let payer: Address | null = null;
if (isAddress(subject)) {
  payer = subject;
  const found = await client.getEnsName({ address: subject });
  if (!found) {
    /* Either it never had one, or the name it had has stopped resolving —
       because it was unregistered, or because a name above it was. ENS gives
       the same answer to both, and so does a seller: there is nothing here to
       check, so there is nothing to serve on. */
    console.log(`${subject} has no name that resolves back to it.`);
    console.log("Refuse it. Nothing about this address can be verified.");
    process.exit(1);
  }
  name = found;
} else {
  name = normalize(subject);
}

const addr = await client.getEnsAddress({ name: normalize(name) });
if (!addr) {
  console.log(`${name} resolves to no address.`);
  process.exit(1);
}
/* The half that makes the first half mean anything. */
if (payer && addr.toLowerCase() !== payer.toLowerCase()) {
  console.log(`${name} does not resolve back to ${payer}. Refuse it.`);
  process.exit(1);
}

const node = (await client.getEnsText({ name: normalize(name), key: "cordon.node" })) as Hex | null;
const registry = (await client.getEnsText({
  name: normalize(name),
  key: "cordon.registry",
})) as Address | null;

console.log(name);
console.log("  address   ", addr);

if (!node || !registry) {
  console.log("  bound     none published. This name says nothing about what it may spend.");
  process.exit(0);
}

const [mandate, live] = await Promise.all([
  client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "mandate", args: [node] }),
  client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "isLive", args: [node] }),
]);

const vault = process.env.CORDON_VAULT as Address | undefined;
console.log("  mandate   ", node);
console.log("  registry  ", registry);
console.log("  operator  ", mandate.operator);
console.log("  owner     ", mandate.owner, "  <- who funded it, and the only one who can cut it off");
console.log("  budget    ", usd(mandate.budget6));
console.log("  live      ", live);

if (!live) {
  const cut = await client.readContract({
    address: registry, abi: REGISTRY_ABI, functionName: "revokedAt", args: [node],
  });
  console.log("  cut at    ", cut, cut === node ? "(this node)" : "(an ancestor)");
  console.log("\n  Refuse it. A cut branch cannot pay.");
  process.exit(0);
}

/**
 * What the name says about itself, and whether the chain agrees.
 *
 * `agent-context` and `agent-endpoint` are the owner's words and nothing
 * checks them, which is why they are printed as claims. The registration
 * record is different: it names an ERC-8004 identity, and `ConductRecord`
 * holds the identity this node is actually bound to — so the two can be put
 * side by side, and a name claiming an identity the contract never linked is
 * an owner attesting to something no contract agrees with.
 */
const endpoint = await client.getEnsText({ name: normalize(name), key: "agent-endpoint[mcp]" });
const context = await client.getEnsText({ name: normalize(name), key: "agent-context" });
if (endpoint) console.log("  endpoint  ", endpoint, " (ENSIP-26, stated by the owner)");
if (context) console.log("  context   ", context.length > 70 ? context.slice(0, 67) + "..." : context);

const conduct = process.env.CORDON_RECORD as Address | undefined;
if (conduct) {
  const agentId = (await client.readContract({
    address: conduct, abi: RECORD_ABI, functionName: "agentIdOf", args: [node],
  })) as bigint;
  if (agentId === 0n) {
    console.log("  identity   none. This node is bound to no ERC-8004 agent.");
  } else {
    const key = registrationKey(SEPOLIA.chainId, ERC8004.identity, agentId);
    const attested = await client.getEnsText({ name: normalize(name), key });
    console.log(
      "  identity  ",
      `${agentId} ${attested ? "— and the name attests to it (ENSIP-25)" : "— the name does NOT attest to it"}`,
    );
  }
}

if (vault) {
  const [available, boundBy] = await client.readContract({
    address: vault, abi: VAULT_ABI, functionName: "headroom", args: [node],
  });
  const treasury = await client.readContract({
    address: vault, abi: VAULT_ABI, functionName: "treasury6", args: [mandate.root],
  });
  console.log("  headroom  ", usd(available));
  console.log("  bound by  ", boundBy === node ? "its own budget" : `an ancestor: ${boundBy}`);
  console.log("  treasury  ", usd(treasury), "behind the root");
} else {
  console.log("  headroom   set CORDON_VAULT to read it");
}
