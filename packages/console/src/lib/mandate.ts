/**
 * Opening a mandate from the owner's own wallet, in the browser.
 *
 * This is the one action in the whole system that cannot be automated: a
 * mandate exists because a person signed for it. The deployer is a machine and
 * the owner is a human, and until now the only way to do it was a shell script
 * against a Foundry keystore.
 *
 * It simulates before it sends. A revert from the node is a hex string; a
 * simulation that fails can say *why* — and the failure most likely to happen
 * here has a specific cause worth naming, because the deployed registry
 * predates `lifetimeCap6` and takes a six-field struct where this sends seven.
 */
import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  http,
  keccak256,
  type Hex,
} from "viem";
import { useWallets } from "@privy-io/react-auth";
import { formatUsdc } from "@cordon/fixtures";
import { CHAIN, DEPLOYED as ON_CHAIN, chain } from "./chain";
import { parseAbi } from "viem";
import { MandateRegistryAbi } from "../../../daemon/src/abi.gen.ts";

/* The chain is named in one place now. Re-exported under its old name so the
   screens that import it keep working and keep meaning the same thing. */
export const arc = chain;

export interface MandateParams {
  operator: `0x${string}`;
  budget6: bigint;
  lifetimeCap6: bigint;
  windowSeconds: bigint;
  trancheCap6: bigint;
  concentrationBps: number;
  maxDepth: number;
}

export type OpenState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "sent"; hash: Hex }
  | { status: "open"; hash: Hex; node: Hex }
  | { status: "failed"; why: string };

/**
 * The registry, or nothing — `pending` is a value here too.
 *
 * The generated fixture types addresses as `string`, because before a deploy
 * there is none and the file says so with `null`. viem wants the narrower
 * type, and this is the one place that crossing happens.
 */
export const REGISTRY = ON_CHAIN?.registry as `0x${string}` | undefined;

/** Both addresses, or nothing. Reading a tree needs the vault as well. */
export const DEPLOYED = ON_CHAIN
  ? {
      registry: ON_CHAIN.registry as `0x${string}`,
      vault: ON_CHAIN.vault as `0x${string}`,
    }
  : undefined;

/** A child's id, derived the way `spawn` derives it. */
export function childNodeId(parent: Hex, nonce: number): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint96" }], [parent, BigInt(nonce)]),
  );
}

export function useOpenMandate(expected?: string | null) {
  const { wallets } = useWallets();
  const [state, setState] = useState<OpenState>({ status: "idle" });

  const open = useCallback(
    async (params: MandateParams) => {
      if (!REGISTRY) {
        setState({ status: "failed", why: "no deployment recorded for this chain yet" });
        return;
      }
      /**
       * The wallet whose address the screen is showing, not simply the first
       * one connected.
       *
       * `usePrivy().user.wallet` is the user's primary wallet and
       * `useWallets()[0]` is whichever connected first; with an external wallet
       * linked they are different addresses. Signing with the second while
       * displaying the first would record an owner the console never named,
       * and the mandate's owner cannot be changed afterwards.
       */
      const wallet = expected
        ? wallets.find((w) => w.address.toLowerCase() === expected.toLowerCase())
        : wallets[0];
      if (!wallet) {
        setState({
          status: "failed",
          why: expected
            ? "the wallet shown here is not one this page can sign with"
            : "no wallet is connected",
        });
        return;
      }

      setState({ status: "signing" });
      try {
        /* Privy wallets follow whatever chain they were last on, and a
           signature sent to the wrong chain is not an error anyone can read. */
        await wallet.switchChain(CHAIN.chainId);
        const provider = await wallet.getEthereumProvider();
        const account = wallet.address as `0x${string}`;
        const walletClient = createWalletClient({ account, chain: arc, transport: custom(provider) });
        const publicClient = createPublicClient({ chain: arc, transport: custom(provider) });

        const call = {
          address: REGISTRY,
          abi: MandateRegistryAbi,
          functionName: "open" as const,
          args: [params] as const,
          account,
        };

        await publicClient.simulateContract(call);
        const hash = await walletClient.writeContract(call);
        setState({ status: "sent", hash });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        /* The node id is the first indexed topic of MandateOpened, which is the
           first log this call writes. Reading it back beats deriving it: the
           derivation is the registry's, and a second copy of it here would be
           a number that can disagree with the chain that just made it. */
        const node = receipt.logs[0]?.topics[1] as Hex | undefined;
        if (!node) {
          setState({ status: "failed", why: "the transaction landed but wrote no MandateOpened log" });
          return;
        }
        setState({ status: "open", hash, node });
      } catch (error) {
        const message = (error as Error).message ?? String(error);
        /* The one failure worth naming, because it looks like a bug and is a
           deployment being out of date. */
        const stale = /function.*not found|execution reverted|encodeFunctionData/i.test(message);
        setState({
          status: "failed",
          why: stale
            ? "the registry at this address does not take these parameters — it predates the lifetime cap, and the contracts need redeploying"
            : message.slice(0, 200),
        });
      }
    },
    [wallets, expected],
  );

  return { state, open };
}

/* ---- finding what is already there --------------------------------------- */

/**
 * A root's node id, derived the way the registry derives it.
 *
 * `open` computes `keccak256(abi.encode(chainid, registry, owner, nonce))` and
 * increments the owner's nonce, so every mandate an address has ever opened is
 * reachable from the address alone. That is the whole reason this can be
 * answered without an indexer: no event log, no meter, no server — the id is a
 * function of who signed and how many times.
 */
export function rootNodeId(owner: `0x${string}`, nonce: number, registry: `0x${string}`): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint96" }],
      [BigInt(CHAIN.chainId), registry, owner, BigInt(nonce)],
    ),
  );
}

export interface OpenMandate {
  node: Hex;
  operator: `0x${string}`;
  budget6: bigint;
  lifetimeCap6: bigint;
  windowSeconds: bigint;
  trancheCap6: bigint;
  concentrationBps: number;
  maxDepth: number;
  revoked: boolean;
}

export type Existing =
  | { state: "unknown" }
  | { state: "looking" }
  | { state: "none" }
  | { state: "found"; mandate: OpenMandate }
  | { state: "failed"; why: string };

/** How many of an owner's mandates to look for. Nonces are sequential. */
const SCAN = 8;

/**
 * Whether this is the registry saying "nobody opened that", or something else.
 *
 * `mandate` reverts `UnknownMandate` on an id nobody has opened, and that
 * revert is how the scan below knows it has reached the end of an owner's
 * nonces. Every other failure — a rate limit, a dropped connection, an RPC
 * that answered with nonsense — arrives at the same `catch`, and treating one
 * as the other reports an owner with a live mandate as having none: they are
 * then shown the form for opening one and sign a second.
 *
 * The revert is recognised by the error viem carries in its `cause` chain
 * rather than by `instanceof`, which a second copy of viem in a bundle breaks.
 */
function isUnknownMandate(error: unknown): boolean {
  for (let step = error as { cause?: unknown; name?: string; data?: { errorName?: string } } | undefined; step; ) {
    if (step.name === "ContractFunctionRevertedError" && step.data?.errorName === "UnknownMandate") return true;
    const next = step.cause as typeof step;
    if (next === step) break;
    step = next;
  }
  return false;
}

/**
 * What this address has already signed, read from the chain.
 *
 * Without it the console is a form with no memory: sign a mandate, reload, and
 * it asks for one again — while the chain holds the answer and cannot be
 * asked, because a mandate's id is not on screen anywhere.
 */
export function useExistingMandate(owner: string | null): Existing {
  const [found, setFound] = useState<Existing>({ state: "unknown" });

  useEffect(() => {
    if (!owner || !REGISTRY) {
      setFound({ state: "unknown" });
      return;
    }
    let live = true;
    setFound({ state: "looking" });

    /* Its own transport rather than the wallet's: this runs before anyone has
       been asked to sign anything, and a read should not need a wallet. */
    const client = createPublicClient({ chain: arc, transport: http(CHAIN.rpc) });

    (async () => {
      for (let nonce = 0; nonce < SCAN; nonce++) {
        const node = rootNodeId(owner as `0x${string}`, nonce, REGISTRY);
        try {
          const m = (await client.readContract({
            address: REGISTRY,
            abi: MandateRegistryAbi,
            functionName: "mandate",
            args: [node],
          })) as {
            operator: `0x${string}`;
            budget6: bigint;
            lifetimeCap6: bigint;
            windowSeconds: bigint;
            trancheCap6: bigint;
            concentrationBps: number;
            maxDepth: number;
            revoked: boolean;
          };
          /* A revoked root is still a mandate this owner opened, and offering
             to open another is the right answer — but it is not the one on
             screen, so keep looking for a live one first. */
          if (!m.revoked && live) {
            setFound({ state: "found", mandate: { node, ...m } });
            return;
          }
        } catch (error) {
          /* Nonces are sequential, so the first id nobody has opened is the
             end of this owner's mandates. Anything else is a read that did not
             happen, and a read that did not happen is not an answer. */
          if (isUnknownMandate(error)) break;
          if (live) setFound({ state: "failed", why: why(error) });
          return;
        }
      }
      if (live) setFound({ state: "none" });
    })();

    return () => {
      live = false;
    };
  }, [owner]);

  return found;
}

/* ---- the two things an owner does after signing --------------------------- */

const ERC20 = parseAbi([
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

const VAULT = parseAbi([
  "function fund(bytes32 root, uint128 amount6)",
  "function withdraw(bytes32 root, address to, uint128 amount6)",
  "function treasury6(bytes32 root) view returns (uint128)",
  "function release(uint256 refusalId)",
]);

export type ActionState =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "done"; hash: Hex }
  | { status: "failed"; why: string };

/** The wallet the screen is showing, and a client that can sign with it. */
async function signerFor(wallets: ReturnType<typeof useWallets>["wallets"], expected: string) {
  const wallet = wallets.find((w) => w.address.toLowerCase() === expected.toLowerCase());
  if (!wallet) throw new Error("the wallet shown here is not one this page can sign with");
  await wallet.switchChain(CHAIN.chainId);
  const provider = await wallet.getEthereumProvider();
  const account = wallet.address as `0x${string}`;
  return {
    account,
    wallet: createWalletClient({ account, chain: arc, transport: custom(provider) }),
    reader: createPublicClient({ chain: arc, transport: custom(provider) }),
  };
}

/**
 * One sentence a person can act on.
 *
 * viem's errors are written for a console: the failure, then the request
 * arguments, then a docs link and a version, over ten or more lines. Slicing
 * the first 200 characters off that — which is what this did — produced a
 * toast that filled a third of the screen and was cut mid-address.
 *
 * `shortMessage` is the one line viem writes for exactly this, and the two
 * cases a person hits most often say what happened rather than what the RPC
 * called it. The whole error is still in the browser console, where somebody
 * debugging can read it.
 */
export function why(error: unknown): string {
  const carried = error as { shortMessage?: string; details?: string; message?: string };
  const raw = (carried?.shortMessage || carried?.details || carried?.message || String(error)).trim();

  if (/user rejected|user denied|rejected the request/i.test(raw)) {
    return "You declined it in your wallet.";
  }
  if (/insufficient funds|exceeds the balance/i.test(raw)) {
    return "This wallet does not hold enough to send it.";
  }

  /* The first line, and never the arguments block or the docs link under it. */
  const first = raw.split("\n").map((line) => line.trim()).find(Boolean) ?? raw;
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}

/**
 * Money into the vault, which is the only place a draw can come from.
 *
 * Two transactions, because ERC-20 is two: the vault can only pull what it has
 * been allowed, and an allowance already large enough is not asked for again —
 * a second approval costs gas and grants nothing new.
 */
export function useFundVault(expected: string | null) {
  const { wallets } = useWallets();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const fund = useCallback(
    async (root: Hex, amount6: bigint) => {
      if (!DEPLOYED || !expected) {
        setState({ status: "failed", why: "no deployment, or no wallet" });
        return;
      }
      try {
        const { account, wallet, reader } = await signerFor(wallets, expected);
        const usdc = CHAIN.erc20 as `0x${string}`;

        const held = (await reader.readContract({
          address: usdc, abi: ERC20, functionName: "balanceOf", args: [account],
        })) as bigint;
        if (held < amount6) {
          setState({
            status: "failed",
            why: `this wallet holds ${Number(held) / 1e6} USDC and the vault was asked for ${Number(amount6) / 1e6}`,
          });
          return;
        }

        const allowed = (await reader.readContract({
          address: usdc, abi: ERC20, functionName: "allowance", args: [account, DEPLOYED.vault],
        })) as bigint;

        if (allowed < amount6) {
          setState({ status: "working", step: "allowing the vault to take it" });
          const approve = await wallet.writeContract({
            address: usdc, abi: ERC20, functionName: "approve", args: [DEPLOYED.vault, amount6],
          });
          await reader.waitForTransactionReceipt({ hash: approve });
        }

        setState({ status: "working", step: "funding the vault" });
        const call = {
          address: DEPLOYED.vault, abi: VAULT, functionName: "fund" as const,
          args: [root, amount6] as const, account,
        };
        await reader.simulateContract(call);
        const hash = await wallet.writeContract(call);
        await reader.waitForTransactionReceipt({ hash });
        setState({ status: "done", hash });
      } catch (error) {
        setState({ status: "failed", why: why(error) });
      }
    },
    [wallets, expected],
  );

  return { state, fund };
}

/** What a tree's vault holds, read from `TreeVault.treasury6`. */
export type Treasury =
  | { state: "idle" }
  | { state: "looking" }
  | { state: "read"; amount6: bigint }
  | { state: "failed"; why: string };

export function useTreasury(root: Hex | null): Treasury {
  const [treasury, setTreasury] = useState<Treasury>({ state: "idle" });

  useEffect(() => {
    if (!root || !DEPLOYED) {
      setTreasury({ state: "idle" });
      return;
    }
    let live = true;
    setTreasury({ state: "looking" });
    const client = createPublicClient({ chain: arc, transport: http(CHAIN.rpc) });
    client
      .readContract({ address: DEPLOYED.vault, abi: VAULT, functionName: "treasury6", args: [root] })
      .then((amount6) => {
        if (live) setTreasury({ state: "read", amount6: amount6 as bigint });
      })
      .catch((error) => {
        if (live) setTreasury({ state: "failed", why: why(error) });
      });
    return () => {
      live = false;
    };
  }, [root]);

  return treasury;
}

/**
 * Take a tree's money back out of the vault.
 *
 * `withdraw` is the owner's alone and does not care whether the tree is
 * revoked, which is what makes a mandate replaceable: revoke the old root,
 * withdraw what it held, open the new one and fund it. The money goes to the
 * wallet that signs — the contract would send it anywhere the owner named, and
 * a console that offered that would be a transfer form with extra steps.
 */
export function useWithdraw(expected: string | null) {
  const { wallets } = useWallets();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const withdraw = useCallback(
    async (root: Hex, amount6: bigint) => {
      if (!DEPLOYED || !expected) {
        setState({ status: "failed", why: "no deployment, or no wallet" });
        return;
      }
      try {
        const { account, wallet, reader } = await signerFor(wallets, expected);

        /* Read again at the moment of signing. The dialog's figure can be
           minutes old, and agents draw from the same treasury meanwhile. */
        const held = (await reader.readContract({
          address: DEPLOYED.vault, abi: VAULT, functionName: "treasury6", args: [root],
        })) as bigint;
        if (held < amount6) {
          setState({
            status: "failed",
            why: `the vault holds ${formatUsdc(held)} for this tree and ${formatUsdc(amount6)} was asked for`,
          });
          return;
        }

        setState({ status: "working", step: "withdrawing from the vault" });
        const call = {
          address: DEPLOYED.vault, abi: VAULT, functionName: "withdraw" as const,
          args: [root, account, amount6] as const, account,
        };
        await reader.simulateContract(call);
        const hash = await wallet.writeContract(call);
        await reader.waitForTransactionReceipt({ hash });
        setState({ status: "done", hash });
      } catch (error) {
        setState({ status: "failed", why: why(error) });
      }
    },
    [wallets, expected],
  );

  return { state, withdraw };
}

/**
 * A child, narrower than its parent.
 *
 * `spawn` accepts the parent's operator or the owner, and this is the owner's
 * path — the first children of a tree, before any daemon is running. Every
 * bound is checked against the parent before it is sent, because the contract
 * will refuse a wider one and finding that out costs a transaction.
 */
/**
 * Cut a branch.
 *
 * The one owner action the console drew but could not perform: the sample
 * tree's revoke was local state, and the rows read from the chain had no
 * control at all. `MandateRegistry.revoke` takes the owner or any strict
 * ancestor's operator, and a revoked node draws nothing from that block on —
 * the subtree with it, because `revokedAt` walks up.
 *
 * It is deliberately not a bulk action. Each call names one node, and the
 * node it names is the root of everything it stops.
 */
/**
 * The human exit, signed.
 *
 * `TreeVault.release` pays one refused draw out of the treasury on the owner's
 * signature. It raises no bound, re-runs no draw and erases nothing: the
 * refusal stays on chain and the release is written beside it, which is the
 * whole point of having the exit be a transaction rather than a setting.
 *
 * The console drew this button for a year and it set a boolean. A control that
 * looks live and does nothing is worse than one that admits what it is — and
 * both are worse than one that works.
 */
export function useRelease(expected: string | null) {
  const { wallets } = useWallets();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const release = useCallback(
    async (refusalId: bigint) => {
      if (!DEPLOYED || !expected) {
        setState({ status: "failed", why: "no deployment, or no wallet" });
        return;
      }
      try {
        const { account, wallet, reader } = await signerFor(wallets, expected);
        setState({ status: "working", step: "signing the release" });
        const call = {
          address: DEPLOYED.vault, abi: VAULT, functionName: "release" as const,
          args: [refusalId] as const, account,
        };
        /* Simulated first: the vault refuses a release from anyone but the
           owner, one already released, and one the treasury cannot cover.
           Each of those is worth telling an owner before a wallet opens. */
        await reader.simulateContract(call);
        const hash = await wallet.writeContract(call);
        await reader.waitForTransactionReceipt({ hash });
        setState({ status: "done", hash });
      } catch (error) {
        setState({ status: "failed", why: why(error) });
      }
    },
    [wallets, expected],
  );

  return { state, release };
}

export function useRevoke(expected: string | null) {
  const { wallets } = useWallets();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const revoke = useCallback(
    async (node: Hex) => {
      if (!REGISTRY || !expected) {
        setState({ status: "failed", why: "no deployment, or no wallet" });
        return;
      }
      try {
        const { account, wallet, reader } = await signerFor(wallets, expected);
        setState({ status: "working", step: "cutting the branch" });
        const call = {
          address: REGISTRY, abi: MandateRegistryAbi, functionName: "revoke" as const,
          args: [node] as const, account,
        };
        /* Simulated first, so an owner who is not the owner of this node is
           told before a wallet asks them to sign anything. */
        await reader.simulateContract(call);
        const hash = await wallet.writeContract(call);
        await reader.waitForTransactionReceipt({ hash });
        setState({ status: "done", hash });
      } catch (error) {
        setState({ status: "failed", why: why(error) });
      }
    },
    [wallets, expected],
  );

  return { state, revoke };
}

export function useSpawnChild(expected: string | null) {
  const { wallets } = useWallets();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const spawn = useCallback(
    async (parent: Hex, params: MandateParams) => {
      if (!REGISTRY || !expected) {
        setState({ status: "failed", why: "no deployment, or no wallet" });
        return;
      }
      try {
        const { account, wallet, reader } = await signerFor(wallets, expected);
        setState({ status: "working", step: "spawning" });
        const call = {
          address: REGISTRY, abi: MandateRegistryAbi, functionName: "spawn" as const,
          args: [parent, params] as const, account,
        };
        await reader.simulateContract(call);
        const hash = await wallet.writeContract(call);
        await reader.waitForTransactionReceipt({ hash });
        setState({ status: "done", hash });
      } catch (error) {
        setState({ status: "failed", why: why(error) });
      }
    },
    [wallets, expected],
  );

  return { state, spawn };
}
