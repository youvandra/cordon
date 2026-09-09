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
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  type Hex,
} from "viem";
import { useWallets } from "@privy-io/react-auth";
import { ARC, DEPLOYMENT } from "@cordon/fixtures";
import { MandateRegistryAbi } from "../../../daemon/src/abi.gen.ts";

export const arc = defineChain({
  id: ARC.chainId,
  name: ARC.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: ARC.nativeDecimals },
  rpcUrls: { default: { http: [ARC.rpc] } },
  blockExplorers: { default: { name: "arcscan", url: ARC.explorer } },
});

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
export const REGISTRY = DEPLOYMENT?.registry as `0x${string}` | undefined;

/** Both addresses, or nothing. Reading a tree needs the vault as well. */
export const DEPLOYED = DEPLOYMENT
  ? {
      registry: DEPLOYMENT.registry as `0x${string}`,
      vault: DEPLOYMENT.vault as `0x${string}`,
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
        await wallet.switchChain(ARC.chainId);
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
      [BigInt(ARC.chainId), registry, owner, BigInt(nonce)],
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
  | { state: "found"; mandate: OpenMandate };

/** How many of an owner's mandates to look for. Nonces are sequential. */
const SCAN = 8;

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
    const client = createPublicClient({ chain: arc, transport: http(ARC.rpc) });

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
        } catch {
          /* `mandate` reverts on an id nobody has opened, which is how the scan
             ends: nonces are sequential, so the first gap is the end. */
          break;
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
