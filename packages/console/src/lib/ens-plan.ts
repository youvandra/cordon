/**
 * Walking an ENSv2 name, and planning the transactions that give an agent one.
 *
 * Kept apart from `naming.ts` so the plan can be checked without a browser:
 * this half imports viem and the fixtures and nothing that needs a wallet or a
 * React runtime, while `naming.ts` holds the signing. What the plan decides is
 * how many signatures an owner will be asked for, and that is the part worth a
 * test.
 */
import {
  keccak256,
  namehash,
  parseAbi,
  stringToBytes,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { ENSV2 } from "@cordon/fixtures";

export const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** The reader a name walk makes, which is the public half of a signer. A stub
 *  carrying only `readContract` is enough to plan one. */
export type Reader = Pick<PublicClient, "readContract">;

/* Only the calls this file makes. The full interfaces live in
   `script/ens/IEns.sol`; copying all of them here would be a second place for
   them to drift. */
export const RegistryAbi = parseAbi([
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
]);

const labelhash = (label: string): bigint => BigInt(keccak256(stringToBytes(label)));

/**
 * The token id for a label, canonicalised.
 *
 * ENSv2 keeps a version in the low 32 bits of the id, so the plain labelhash is
 * not a token anybody owns — `ownerOf(labelhash("worker1"))` answers with the
 * zero address while the name is plainly registered. The scripts sidestepped
 * this by passing the id `register` returned; a console that has to act on a
 * name somebody else registered cannot.
 *
 * Version zero is the id a first registration mints, and the registry's write
 * calls take "anyId" and canonicalise it themselves. `ownerOf` does not, so
 * `placeOf` probes a few versions to find the live one.
 */
const VERSION_MASK = ((1n << 256n) - 1n) ^ 0xffffffffn;
export const tokenIdFor = (label: string, version = 0n): bigint =>
  (labelhash(label) & VERSION_MASK) | version;

/** How many re-registrations to look through before calling a name unheld. A
 *  name reissued more than a handful of times is not one this console is
 *  being asked about. */
const VERSIONS_TO_PROBE = 8n;

/** Where a name sits in the registry hierarchy, and what is already true of it. */
export interface NamePlace {
  /** The full name, as it resolves. */
  name: string;
  /** The registry holding this name's label — its parent's subregistry. */
  registry: Address;
  label: string;
  tokenId: bigint;
  /** Who holds it, or the zero address when nobody does. */
  holder: Address;
  /** The registry hung beneath it, when one is. Without this nothing can be
   *  registered under the name. */
  subregistry: Address | null;
  /** The resolver that answers for this name, found the way a client finds it:
   *  the nearest one at or above it. */
  resolver: Address | null;
}

/**
 * Walk a name down from the `.eth` registry, reading rather than assuming.
 *
 * Each step asks the registry above for the child registry, so the hierarchy is
 * discovered rather than configured — and `resolver` is carried down from the
 * nearest ancestor that sets one, which is how a wildcard is actually found.
 */
export async function placeOf(reader: Reader, name: string): Promise<NamePlace> {
  const parts = name.split(".");
  if (parts.length < 2 || parts[parts.length - 1] !== "eth") {
    throw new Error(`${name} is not a .eth name`);
  }
  /* From the second-level label inward: "worker1.probe.mira.eth" is read as
     mira, then probe, then worker1. */
  const labels = parts.slice(0, -1).reverse();

  let registry: Address = ENSV2.registry as Address;
  let resolver: Address | null = null;
  let place: NamePlace | null = null;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    const [subregistry, own] = await Promise.all([
      reader.readContract({ address: registry, abi: RegistryAbi, functionName: "getSubregistry", args: [label] }),
      reader.readContract({ address: registry, abi: RegistryAbi, functionName: "getResolver", args: [label] }),
    ]);
    /* The nearest resolver at or above the name is the one a client reaches,
       so a subname with none inherits whatever its ancestor set. */
    if (own && own !== ZERO) resolver = own as Address;

    let tokenId = tokenIdFor(label);
    let holder = ZERO as Address;
    for (let version = 0n; version < VERSIONS_TO_PROBE; version++) {
      const candidate = tokenIdFor(label, version);
      const owner = (await reader
        .readContract({ address: registry, abi: RegistryAbi, functionName: "ownerOf", args: [candidate] })
        .catch(() => ZERO)) as Address;
      if (owner !== ZERO) {
        tokenId = candidate;
        holder = owner;
        break;
      }
    }

    place = {
      name: [...labels.slice(0, i + 1)].reverse().concat("eth").join("."),
      registry,
      label,
      tokenId,
      holder,
      subregistry: subregistry && subregistry !== ZERO ? (subregistry as Address) : null,
      resolver,
    };

    if (i === labels.length - 1) break;
    if (!place.subregistry) {
      throw new Error(`${place.name} has no registry beneath it, so ${name} cannot exist yet`);
    }
    registry = place.subregistry;
  }

  if (!place) throw new Error(`${name} has no labels to read`);
  return place;
}

/** What naming one agent will do, decided before a wallet is asked to sign. */
export interface NamePlan {
  parent: NamePlace;
  /** The full name the agent will answer to. */
  fullName: string;
  /** Its namehash, which is what the resolver is keyed by. */
  node: Hex;
  /** True when the parent has no registry and one has to be created first. */
  needsSubregistry: boolean;
  /** The resolver that will answer for the new name. Without one, binding has
   *  nowhere to go and the name would resolve empty. */
  resolver: Address | null;
  /** Set when the label is already taken under this parent. */
  taken: boolean;
}

export async function planFor(reader: Reader, parentName: string, label: string): Promise<NamePlan> {
  const parent = await placeOf(reader, parentName);
  const fullName = `${label}.${parentName}`;

  let taken = false;
  if (parent.subregistry) {
    const holder = (await reader
      .readContract({
        address: parent.subregistry,
        abi: RegistryAbi,
        functionName: "ownerOf",
        args: [tokenIdFor(label)],
      })
      .catch(() => ZERO)) as Address;
    taken = holder !== ZERO;
  }

  return {
    parent,
    fullName,
    node: namehash(fullName),
    needsSubregistry: parent.subregistry === null,
    resolver: parent.resolver,
    taken,
  };
}
