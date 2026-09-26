/**
 * Giving an agent a name, from the console rather than from four scripts.
 *
 * The mandate side of the tree has had owner actions since the beginning —
 * fund, spawn, withdraw, revoke. The namespace side had none: issuing a
 * subname lived in `script/ens/AttachSubregistry`, `IssueSubname` and
 * `BindSubname`, run by hand with a token id copied between them. So a spawned
 * agent got a mandate immediately and a name only if somebody remembered to
 * run three scripts in the right order.
 *
 * The order is the reason this is a module and not a form. Four things have to
 * happen and two of them are traps:
 *
 *   1. The parent needs a registry beneath it. Nothing can be registered under
 *      a name that has no subregistry, and most names do not: `worker1` had
 *      none, so `check-authority` said "nothing may be registered beneath it".
 *   2. The subname is registered in that registry, which mints a token id.
 *   3. **The namehash is bound to the mandate node.** ENSIP-10 decides which
 *      resolver is *found* for a subname; it does not decide what that resolver
 *      answers. `CordonResolver.resolve` hashes the whole name and looks up
 *      `nodeOf[namehash]`, so a subname nobody bound resolves to *empty* — and
 *      empty is indistinguishable from "this agent has no bound". A name issued
 *      without this step is worse than no name at all.
 *   4. The subname's own resolver is cleared last, so the parent's wildcard is
 *      reached. A resolver on the name wins over the one above it.
 *
 * The roles are derived here and never typed. A form that let an owner grant
 * `SET_SUBREGISTRY` on a name whose mandate forbids a deeper child would
 * publish authority the contract refuses — which is the exact defect
 * `MirrorAuthority` and `check-authority.ts` exist to catch. So the bitmap
 * comes from the mandate: the subname holder gets `SET_RESOLVER` and nothing
 * else, and a parent registry is created with the roles its own name already
 * carries.
 */
import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, keccak256, namehash, parseAbi, stringToBytes, type Address, type Hex } from "viem";
import { ENSV2 } from "@cordon/fixtures";
import { signerFor, why, type ActionState } from "./mandate";

/* Only the calls this file makes. The full interfaces live in
   `script/ens/IEns.sol`; copying all of them here would be a second place for
   them to drift. */
const RegistryAbi = parseAbi([
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
]);

const FactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address)",
]);

const UserRegistryInitAbi = parseAbi(["function initialize(address rootAccount, uint256 roleBitmap)"]);

const ResolverAbi = parseAbi([
  "function bind(bytes32 namehash, bytes32 node)",
  "function setText(bytes32 namehash, string key, string value)",
  "function nodeOf(bytes32 namehash) view returns (bytes32)",
]);

/** `EnsRoles`, as the Solidity library defines them. */
const ROLE = {
  REGISTRAR: 1n << 0n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  UPGRADE: 1n << 124n,
} as const;

/** The admin bit for a role, which is the role shifted by 128. An owner who
 *  cannot delegate is an owner in name only. */
const admin = (roles: bigint) => roles << 128n;

/**
 * What a registry hung under a name may do.
 *
 * The same bitmap `AttachSubregistry` uses: register beneath it, take a name
 * back, renew, hang a deeper registry, point at a resolver, upgrade — each with
 * its admin bit.
 */
const SUBREGISTRY_ROLES = (() => {
  const roles =
    ROLE.REGISTRAR | ROLE.UNREGISTER | ROLE.RENEW | ROLE.SET_SUBREGISTRY | ROLE.SET_RESOLVER | ROLE.UPGRADE;
  return roles | admin(roles);
})();

/**
 * What the holder of a new subname may do: point it at a resolver, nothing
 * else.
 *
 * Deliberately not `SET_SUBREGISTRY`. An agent that could hang a registry under
 * itself could name children the mandate has no room for — `maxDepth` is the
 * contract's answer to that, and the namespace should not grant what the
 * contract would refuse. When a deeper child is legitimate, this flow attaches
 * that registry as the owner, on purpose, one level at a time.
 */
const SUBNAME_ROLES = ROLE.SET_RESOLVER;

/** A hundred years. ENSv2 expiries are absolute, and a demo tree outliving the
 *  demo is the failure worth avoiding, not a name that lapses in a decade. */
const EXPIRY_SECONDS = 100n * 365n * 24n * 60n * 60n;

const ZERO = "0x0000000000000000000000000000000000000000" as const;

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
const tokenIdFor = (label: string, version = 0n): bigint => (labelhash(label) & VERSION_MASK) | version;

/** How many re-registrations to look through before calling a name unheld. A
 *  name reissued more than a handful of times is not one this console is
 *  being asked about. */
const VERSIONS_TO_PROBE = 8n;

type Reader = Awaited<ReturnType<typeof signerFor>>["reader"];

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

/**
 * Issue a subname for a mandate node and bind it, in the one order that works.
 *
 * Every step is simulated before it is signed, so an owner who does not hold
 * the parent is told before a wallet opens. The steps are separate
 * transactions because they are separate calls to separate contracts; the
 * order is what makes a partial run safe to resume rather than a name that
 * lies. Binding happens before the resolver is cleared, so the name never
 * answers empty: until the clear it answers from whatever it had, and after it
 * from the tree.
 */
export function useNameAgent(expected: string | null) {
  const { wallets } = useWallets();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const name = useCallback(
    async (
      mandateNode: Hex,
      parentName: string,
      label: string,
      records?: { endpoint?: string; context?: string },
    ) => {
      if (!expected) {
        setState({ status: "failed", why: "no wallet" });
        return;
      }
      try {
        const { account, wallet, reader } = await signerFor(wallets, expected);
        const plan = await planFor(reader, parentName, label);

        if (plan.taken) throw new Error(`${plan.fullName} is already registered`);
        if (!plan.resolver) {
          throw new Error(
            `no resolver answers for ${parentName} or anything above it, so a name bound here would resolve to nothing`,
          );
        }

        const send = async (call: Parameters<typeof wallet.writeContract>[0]) => {
          /* Simulated first every time. A revert found here costs a reader one
             sentence; found by the wallet it costs a signature and a receipt. */
          await reader.simulateContract(call as never);
          const hash = await wallet.writeContract(call);
          await reader.waitForTransactionReceipt({ hash });
          return hash;
        };

        let registry = plan.parent.subregistry;
        if (!registry) {
          setState({ status: "working", step: "hanging a registry under the parent" });
          /* The factory deploys it, so the browser never carries bytecode. The
             salt is the parent's token id: naming the same parent twice would
             otherwise collide, and a predictable salt makes the proxy address
             checkable afterwards. */
          const data = encodeFunctionData({
            abi: UserRegistryInitAbi,
            functionName: "initialize",
            args: [account, SUBREGISTRY_ROLES],
          });
          /* Predicted rather than read back from the receipt: the factory
             derives the address from the deployer and the salt, so it is known
             before the transaction and checkable after it. */
          const proxy = (await reader.readContract({
            address: ENSV2.verifiableFactory as Address,
            abi: FactoryAbi,
            functionName: "predictProxyAddress",
            args: [account, plan.parent.tokenId],
          })) as Address;

          await send({
            address: ENSV2.verifiableFactory as Address,
            abi: FactoryAbi,
            functionName: "deployProxy",
            args: [ENSV2.userRegistryImpl as Address, plan.parent.tokenId, data],
            account,
          } as never);

          setState({ status: "working", step: "pointing the parent at it" });
          await send({
            address: plan.parent.registry,
            abi: RegistryAbi,
            functionName: "setSubregistry",
            args: [plan.parent.tokenId, proxy],
            account,
          } as never);
          registry = proxy;
        }

        setState({ status: "working", step: `registering ${plan.fullName}` });
        const expiry = BigInt(Math.floor(Date.now() / 1000)) + EXPIRY_SECONDS;
        await send({
          address: registry,
          abi: RegistryAbi,
          functionName: "register",
          args: [label, account, ZERO, ZERO, SUBNAME_ROLES, expiry],
          account,
        } as never);

        /* The bound, before anything can be read. A name that reaches the
           tree's resolver without this resolves empty, and empty reads as an
           agent with no bound rather than as a name nobody bound. */
        setState({ status: "working", step: "binding the name to the mandate" });
        const hash = await send({
          address: plan.resolver,
          abi: ResolverAbi,
          functionName: "bind",
          args: [plan.node, mandateNode],
          account,
        } as never);

        for (const [key, value] of [
          ["agent-endpoint[mcp]", records?.endpoint],
          ["agent-context", records?.context],
        ] as const) {
          if (!value) continue;
          setState({ status: "working", step: `publishing ${key}` });
          await send({
            address: plan.resolver,
            abi: ResolverAbi,
            functionName: "setText",
            args: [plan.node, key, value],
            account,
          } as never);
        }

        /* Last, and only when it would change something. A resolver on the
           name wins over the parent's wildcard, so this is what hands the name
           to the tree — and a fresh registration was made with none, so the
           call is usually unnecessary and always safe. */
        const childId = tokenIdFor(label);
        const own = (await reader
          .readContract({ address: registry, abi: RegistryAbi, functionName: "getResolver", args: [label] })
          .catch(() => ZERO)) as Address;
        if (own !== ZERO) {
          setState({ status: "working", step: "handing the name to the tree's resolver" });
          await send({
            address: registry,
            abi: RegistryAbi,
            functionName: "setResolver",
            args: [childId, ZERO],
            account,
          } as never);
        }

        setState({ status: "done", hash });
      } catch (error) {
        setState({ status: "failed", why: why(error) });
      }
    },
    [wallets, expected],
  );

  return { state, name };
}
