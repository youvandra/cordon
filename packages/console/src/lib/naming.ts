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
import { useCallback, useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, namehash, parseAbi, type Address, type Hex } from "viem";
import { createPublicClient, http } from "viem";
import { ENSV2 } from "@cordon/fixtures";
import { CHAIN, chain } from "./chain";
import { signerFor, why, type ActionState } from "./mandate";
/* The plan lives apart so it can be checked without a browser. This file adds
   the part that signs it. */
import { placeOf, planFor, tokenIdFor, RegistryAbi, ZERO, type NamePlace } from "./ens-plan";

/* A reader that needs no wallet, so the dialog can check a name before anyone
   is asked to sign. */
const reading = CHAIN.chainId === ENSV2.chainId ? createPublicClient({ chain, transport: http(CHAIN.rpc) }) : null;

/* This factory answers with the address it deployed and carries no
   `predictProxyAddress`. Asking for one was the first call this path made, and
   it is why the signing path never got past its opening read. */
const FactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
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
             sentence; found by the wallet it costs a signature and a receipt.
             The simulation's own return value is kept, because `deployProxy`
             answers with the address it deployed and that is the only way to
             learn it. */
          const { result } = await reader.simulateContract(call as never);
          const hash = await wallet.writeContract(call);
          await reader.waitForTransactionReceipt({ hash });
          return { hash, result };
        };

        let registry = plan.parent.subregistry;
        if (!registry) {
          setState({ status: "working", step: "hanging a registry under the parent" });
          /* The factory deploys it, so the browser never carries bytecode. The
             salt is the parent's token id: naming the same parent twice would
             otherwise collide. */
          const data = encodeFunctionData({
            abi: UserRegistryInitAbi,
            functionName: "initialize",
            args: [account, SUBREGISTRY_ROLES],
          });
          const install = await send({
            address: ENSV2.verifiableFactory as Address,
            abi: FactoryAbi,
            functionName: "deployProxy",
            args: [ENSV2.userRegistryImpl as Address, plan.parent.tokenId, data],
            account,
          } as never);
          const proxy = install.result as Address;

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
        const { hash } = await send({
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

/**
 * Check a parent name against the mandate it is supposed to be.
 *
 * The dialog used to take the parent's name from reverse resolution and, when
 * there was none, leave the field empty and the button dead — which is what
 * happened the first time anyone tried it: `worker1.probe.mira.eth` has no
 * reverse record, so naming a child of worker1 offered an empty required field
 * and no explanation.
 *
 * Typing it is fine. Typing it unchecked is not: a name that belongs to a
 * different mandate would hang the child in the wrong place in the namespace
 * while its mandate sat somewhere else, and both would look right on their own.
 * So the typed name is resolved to a node through the same resolver a seller
 * would use, and compared with the mandate the sheet is showing.
 */
export type ParentCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; place: NamePlace; needsSubregistry: boolean }
  | { state: "mismatch"; boundTo: Hex }
  | { state: "unbound" }
  | { state: "error"; why: string };

export function useParentCheck(parentName: string, expectedNode: Hex | null): ParentCheck {
  const [result, setResult] = useState<ParentCheck>({ state: "idle" });

  useEffect(() => {
    const ok = /^([a-z0-9-]+\.)+eth$/.test(parentName);
    if (!reading || !ok || !expectedNode) {
      setResult({ state: "idle" });
      return;
    }
    let live = true;
    setResult({ state: "checking" });

    (async () => {
      try {
        const place = await placeOf(reading as never, parentName);
        if (!place.resolver) {
          if (live) setResult({ state: "unbound" });
          return;
        }
        const bound = (await reading.readContract({
          address: place.resolver,
          abi: ResolverAbi,
          functionName: "nodeOf",
          args: [namehash(parentName)],
        })) as Hex;
        if (!live) return;
        if (bound === "0x0000000000000000000000000000000000000000000000000000000000000000") {
          setResult({ state: "unbound" });
        } else if (bound.toLowerCase() !== expectedNode.toLowerCase()) {
          setResult({ state: "mismatch", boundTo: bound });
        } else {
          setResult({ state: "ok", place, needsSubregistry: place.subregistry === null });
        }
      } catch (error) {
        if (live) setResult({ state: "error", why: why(error) });
      }
    })();

    return () => {
      live = false;
    };
  }, [parentName, expectedNode]);

  return result;
}
